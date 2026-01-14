import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const MCP_URL = process.env.MCP_URL || 'http://localhost:4000/mcp';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface MCPResponse {
  jsonrpc: string;
  id?: number;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    tools?: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }>;
  };
  error?: { code: number; message: string };
}

// MCP Client class that handles connection per request
class MCPClient {
  private sessionId: string | null = null;

  private async parseSSEResponse(response: Response): Promise<MCPResponse> {
    const text = await response.text();
    
    if (text.startsWith('{')) {
      return JSON.parse(text);
    }
    
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.substring(6);
        if (jsonStr.trim()) {
          return JSON.parse(jsonStr);
        }
      }
    }
    
    throw new Error('No valid JSON found in SSE response');
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<MCPResponse> {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(this.sessionId && { 'mcp-session-id': this.sessionId })
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
    }

    const sessionHeader = response.headers.get('mcp-session-id');
    if (sessionHeader) {
      this.sessionId = sessionHeader;
    }

    return this.parseSSEResponse(response);
  }

  async initialize(): Promise<boolean> {
    try {
      const initResponse = await this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { sampling: {} },
        clientInfo: { name: 'PharmAssist Chat API', version: '1.0.0' }
      });

      if (initResponse.result) {
        await this.request('notifications/initialized', {});
        return true;
      }
      return false;
    } catch (error) {
      console.error('MCP initialization failed:', error);
      return false;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      const response = await this.request('tools/call', { name, arguments: args });
      
      if (response.error) {
        return `Error: ${response.error.message}`;
      }
      
      if (response.result?.content) {
        return response.result.content.map(c => c.text || JSON.stringify(c)).join('\n');
      }
      
      return 'No response from tool';
    } catch (error) {
      console.error(`Tool call failed for ${name}:`, error);
      return `Error calling tool: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

// Define tools for Gemini function calling
const pharmacyTools = [
  {
    name: 'search_medicines',
    description: 'Search for medicines by name, symptom, or condition. Use this to find medicines for treating symptoms like fever, headache, malaria, cough, cold, pain, etc.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'The medicine name, symptom, or condition to search for (e.g., "paracetamol", "fever", "malaria")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'check_stock',
    description: 'Check the stock availability of a specific medicine by its ID. Use this after searching for medicines to verify availability.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine to check stock for'
        }
      },
      required: ['medicine_id']
    }
  },
  {
    name: 'find_alternatives',
    description: 'Find alternative medicines for a specific medicine by its ID. Use this when a medicine is out of stock or user wants options.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine to find alternatives for'
        }
      },
      required: ['medicine_id']
    }
  },
  {
    name: 'get_medicine_details',
    description: 'Get detailed information about a specific medicine including dosage, side effects, and usage instructions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine to get details for'
        }
      },
      required: ['medicine_id']
    }
  }
];

// Map Gemini function names to MCP tool names
const toolMapping: Record<string, string> = {
  'search_medicines': 'SEARCH_MEDS',
  'check_stock': 'CHECK_STOCK',
  'find_alternatives': 'FIND_ALTERNATIVES',
  'get_medicine_details': 'GET_MEDICINE_DETAILS'
};

function mapArguments(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (toolName) {
    case 'search_medicines':
      return { name: args.query };
    default:
      return args;
  }
}

async function processWithGemini(
  message: string, 
  mcpClient: MCPClient
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ functionDeclarations: pharmacyTools }],
    systemInstruction: `You are PharmAssist, a helpful AI pharmacy assistant. Your role is to:
1. Help customers find medicines for their symptoms or conditions
2. Check stock availability of medicines
3. Provide information about medicines (dosage, side effects, usage)
4. Suggest alternatives when medicines are unavailable

When users describe symptoms like fever, headache, malaria, cold, or pain:
1. First use search_medicines to find relevant medicines
2. Then check stock availability if needed
3. Suggest alternatives if something is out of stock

Always be helpful and provide clear, actionable responses. Use the tools to get real data from the pharmacy database.`
  });

  const chat = model.startChat({});
  
  let response = await chat.sendMessage(message);
  let result = response.response;
  
  // Handle function calls
  let iterations = 0;
  const maxIterations = 5;
  
  while (result.functionCalls() && result.functionCalls()!.length > 0 && iterations < maxIterations) {
    iterations++;
    const functionCalls = result.functionCalls()!;
    const functionResponses = [];
    
    for (const call of functionCalls) {
      console.log(`[Gemini] Function call: ${call.name}`, call.args);
      
      const mcpToolName = toolMapping[call.name];
      if (!mcpToolName) {
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: { error: `Unknown tool: ${call.name}` }
          }
        });
        continue;
      }
      
      const mappedArgs = mapArguments(call.name, call.args as Record<string, unknown>);
      console.log(`[MCP] Calling ${mcpToolName} with:`, mappedArgs);
      
      const toolResult = await mcpClient.callTool(mcpToolName, mappedArgs);
      console.log(`[MCP] Result from ${mcpToolName}:`, toolResult.substring(0, 200));
      
      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: { result: toolResult }
        }
      });
    }
    
    response = await chat.sendMessage(functionResponses);
    result = response.response;
  }
  
  const text = result.text();
  if (!text || text.trim() === '') {
    return 'I apologize, but I could not generate a response. Please try rephrasing your question.';
  }
  
  return text;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { message } = await request.json();
    
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ 
        error: 'GEMINI_API_KEY not configured',
        response: '❌ The AI service is not configured. Please add your GEMINI_API_KEY to the environment variables.'
      }, { status: 500 });
    }

    // Create a new MCP client for this request
    const mcpClient = new MCPClient();
    
    // Initialize MCP connection
    const initialized = await mcpClient.initialize();
    if (!initialized) {
      console.warn('MCP initialization failed, continuing without MCP tools');
    }
    
    // Process with Gemini
    const response = await processWithGemini(message, mcpClient);
    
    console.log(`[Chat] Processed in ${Date.now() - startTime}ms`);
    
    return NextResponse.json({ 
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat API error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({ 
      error: errorMessage,
      response: `❌ Sorry, I encountered an error: ${errorMessage}. Please try again.`
    }, { status: 500 });
  }
}

export async function GET() {
  // Health check endpoint
  let mcpStatus = 'unknown';
  
  try {
    const mcpClient = new MCPClient();
    const initialized = await mcpClient.initialize();
    mcpStatus = initialized ? 'connected' : 'failed';
  } catch {
    mcpStatus = 'error';
  }
  
  return NextResponse.json({ 
    status: 'ok',
    message: 'PharmAssist Chat API (Powered by Gemini)',
    geminiConfigured: !!GEMINI_API_KEY,
    mcpStatus,
    mcpUrl: MCP_URL
  });
}
