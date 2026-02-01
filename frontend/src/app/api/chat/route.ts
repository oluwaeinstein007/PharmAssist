import { NextRequest, NextResponse } from 'next/server';
import { 
  GoogleGenerativeAI, 
  SchemaType, 
  FunctionDeclaration, 
  Schema
} from '@google/generative-ai';

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
      const errorBody = await response.text();
      throw new Error(`MCP request failed: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 200)}`);
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
const pharmacyTools: FunctionDeclaration[] = [
  {
    name: 'search_medicines',
    description: 'Search for medicines by name, symptom, or condition. Use this to find medicines for treating symptoms like fever, headache, malaria, cough, cold, pain, etc.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'The medicine name, symptom, or condition to search for (e.g., "paracetamol", "fever", "malaria")'
        } as Schema
      },
      required: ['query']
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'check_stock',
    description: 'Check the stock availability and price of a specific medicine by its barcode. Use this after selecting a medicine from search results to verify availability before ordering.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_barcode: {
          type: SchemaType.STRING,
          description: 'The barcode of the medicine to check stock for'
        } as Schema
      },
      required: ['medicine_barcode']
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'find_alternatives',
    description: 'Find alternative medicines for a specific medicine by its ID. Use this when a medicine is out of stock or user wants options.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine to find alternatives for'
        } as Schema
      },
      required: ['medicine_id']
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'get_medicine_details',
    description: 'Get detailed information about a specific medicine including dosage, side effects, and usage instructions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine to get details for'
        } as Schema
      },
      required: ['medicine_id']
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'create_cart',
    description: 'Create a shopping cart with medicine items. Each item requires a barcode and quantity. Accepts either a single item object or an array of items.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              barcode: {
                type: SchemaType.STRING,
                description: 'The barcode of the medicine'
              } as Schema,
              qty: {
                type: SchemaType.STRING,
                description: 'The quantity of the medicine (string or number accepted)'
              } as Schema
            },
            required: ['barcode', 'qty']
          } as Schema
        } as Schema
      },
      required: ['items']
    } as Schema
  } as FunctionDeclaration
];

// Map Gemini function names to MCP tool names
const toolMapping: Record<string, string> = {
  'search_medicines': 'SEARCH_MEDS',
  'check_stock': 'CHECK_STOCK',
  'find_alternatives': 'FIND_ALTERNATIVES',
  'get_medicine_details': 'GET_MEDICINE_DETAILS',
  'create_cart': 'CREATE_CART'
};

function mapArguments(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (toolName) {
    case 'search_medicines':
      return { name: args.query };
    case 'create_cart':
      return { items: args.items };
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
    systemInstruction: `You are PharmAssist, a simple and helpful AI pharmacy assistant. Help customers find and order medicines easily.

CORE RESPONSIBILITIES:
1. Search for medicines when users ask (use search_medicines)
2. Display search results with barcode, price, and availability
3. Create carts when users want to order (use create_cart)

FRONTEND WORKFLOW - READ CAREFULLY:
- The frontend will automatically extract barcodes from your search results
- The frontend handles all product selection and quantity input
- You ONLY need to: search, display results, and create carts
- DO NOT ask users for barcodes - they're extracted automatically
- DO NOT ask for quantity input - the frontend will ask
- Just keep responses simple and helpful

EXPECTED RESPONSE FORMAT FOR SEARCH:
When you find medicines, format them EXACTLY like this:
1. **Medicine Name**
   Barcode: 1234567890
   Price: ₦10.99
   Available: 50 units
   
2. **Another Medicine**
   Barcode: 0987654321
   ...

USER SCENARIOS:
1. User: "Find paracetamol"
   → Use search_medicines, show results with barcodes
   → Frontend shows select buttons automatically
   
2. User: "I want 2 paracetamol"
   → Use search_medicines to find paracetamol
   → Frontend auto-detects "2" and asks for confirmation
   
3. User sends barcode + quantity directly
   → Use create_cart to complete the order

Be friendly, clear, and let the frontend handle the UI interactions.`
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
    const body = await request.json();
    const message = typeof body === 'object' && body?.message ? String(body.message) : undefined;
    const action = typeof body === 'object' && body?.action ? String(body.action) : undefined;
    const items = Array.isArray(body?.items) ? body.items : undefined;

    // Allow requests that omit `message` but include an explicit `action` (e.g. create_cart, batch_search)
    if (!message && !action) {
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

    // If caller explicitly asked to create a cart (frontend checkout), call the tool directly
    if (action === 'create_cart') {
      if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Items array is required for create_cart' }, { status: 400 });
      }

      try {
        const toolResult = await mcpClient.callTool('CREATE_CART', { items });
        console.log(`[Chat][CREATE_CART] Tool result: ${toolResult.substring(0, 200)}`);
        return NextResponse.json({ response: String(toolResult), timestamp: new Date().toISOString() });
      } catch (err) {
        console.error('[Chat][CREATE_CART] Error calling tool:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage, response: `❌ Failed to create cart: ${errorMessage}` }, { status: 500 });
      }
    }

    // If caller wants to search for multiple medicine names at once
    if (action === 'batch_search') {
      if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Items array is required for batch_search' }, { status: 400 });
      }

      try {
        const queries = items.slice(0, 6).map(String); // limit to 6 to avoid abuse
        let aggregated = '';

        for (const q of queries) {
          try {
            const toolResult = await mcpClient.callTool('SEARCH_MEDS', { name: q });
            aggregated += `Results for "${q}":\n${toolResult}\n\n`;
          } catch (err) {
            console.error(`[Chat][BATCH_SEARCH] Error searching for ${q}:`, err);
            aggregated += `Results for "${q}":\n⚠️ Error searching for this item.\n\n`;
          }
        }

        if (!aggregated.trim()) {
          aggregated = 'No results found for the given medicines.';
        }

        return NextResponse.json({ response: aggregated, timestamp: new Date().toISOString() });
      } catch (err) {
        console.error('[Chat][BATCH_SEARCH] Unexpected error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage, response: `❌ Failed to search for items: ${errorMessage}` }, { status: 500 });
      }
    }

    // Process with Gemini for general chat flow
    const response = await processWithGemini(message!, mcpClient);

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
