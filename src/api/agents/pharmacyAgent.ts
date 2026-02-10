import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiDeclarations, executeTool } from './toolRegistry.js';
import {
  conversationStore,
  type ConversationMessage,
} from '../sessions/conversationStore.js';
import { ApiError, ErrorCode } from '../types/errors.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash';
const MAX_TOOL_ITERATIONS = 5;

const SYSTEM_INSTRUCTION = `You are PharmAssist, a simple and helpful AI pharmacy assistant. Help customers find and order medicines easily.

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

Be friendly, clear, and let the frontend handle the UI interactions.`;

export interface AgentResult {
  response: string;
  conversationId: string;
  toolsUsed: string[];
}

export interface StreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  data: Record<string, unknown>;
}

export async function processChat(
  message: string,
  conversationId?: string,
  userId?: string,
  platform?: string,
): Promise<AgentResult> {
  if (!GEMINI_API_KEY) {
    throw new ApiError(ErrorCode.LLM_ERROR, 'GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const toolsUsed: string[] = [];

  // Resolve or create conversation session
  let session = conversationId ? conversationStore.get(conversationId) : undefined;
  if (!session) {
    session = conversationStore.create(userId, platform);
  }

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    tools: [{ functionDeclarations: getGeminiDeclarations() }],
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  // Build history from conversation store
  const history = session.history.map((msg) => ({
    role: msg.role,
    parts: msg.parts,
  }));

  const chat = model.startChat({ history });

  // Save user message to history
  conversationStore.addMessage(session.id, {
    role: 'user',
    parts: [{ text: message }],
  });

  // Send message and enter tool-calling loop
  let response = await chat.sendMessage(message);
  let result = response.response;
  let iterations = 0;

  while (
    result.functionCalls() &&
    result.functionCalls()!.length > 0 &&
    iterations < MAX_TOOL_ITERATIONS
  ) {
    iterations++;
    const functionCalls = result.functionCalls()!;
    const functionResponses = [];

    for (const call of functionCalls) {
      console.log(`[PharmacyAgent] Tool call: ${call.name}`, JSON.stringify(call.args).substring(0, 200));

      toolsUsed.push(call.name);
      conversationStore.addToolUsed(session.id, call.name);

      const toolResult = await executeTool(
        call.name,
        (call.args as Record<string, unknown>) || {},
      );

      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: { result: toolResult },
        },
      });
    }

    response = await chat.sendMessage(functionResponses);
    result = response.response;
  }

  const text = result.text();
  const finalResponse =
    text && text.trim()
      ? text
      : 'I apologize, but I could not generate a response. Please try rephrasing your question.';

  // Save assistant response to history
  conversationStore.addMessage(session.id, {
    role: 'model',
    parts: [{ text: finalResponse }],
  });

  return {
    response: finalResponse,
    conversationId: session.id,
    toolsUsed: [...new Set(toolsUsed)],
  };
}

export async function* processChatStream(
  message: string,
  conversationId?: string,
  userId?: string,
  platform?: string,
): AsyncGenerator<StreamEvent> {
  if (!GEMINI_API_KEY) {
    yield { type: 'error', data: { message: 'GEMINI_API_KEY is not configured' } };
    return;
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const toolsUsed: string[] = [];

  // Resolve or create conversation session
  let session = conversationId ? conversationStore.get(conversationId) : undefined;
  if (!session) {
    session = conversationStore.create(userId, platform);
  }

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    tools: [{ functionDeclarations: getGeminiDeclarations() }],
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const history = session.history.map((msg) => ({
    role: msg.role,
    parts: msg.parts,
  }));

  const chat = model.startChat({ history });

  conversationStore.addMessage(session.id, {
    role: 'user',
    parts: [{ text: message }],
  });

  try {
    // Use streaming for the initial message
    const streamResult = await chat.sendMessageStream(message);
    let fullText = '';
    let pendingFunctionCalls: any[] = [];

    for await (const chunk of streamResult.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullText += chunkText;
        yield { type: 'token', data: { text: chunkText } };
      }

      // Check for function calls in this chunk
      const calls = chunk.functionCalls();
      if (calls && calls.length > 0) {
        pendingFunctionCalls.push(...calls);
      }
    }

    // Handle tool calls if any
    let iterations = 0;
    while (pendingFunctionCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      const functionResponses = [];

      for (const call of pendingFunctionCalls) {
        yield { type: 'tool_call', data: { tool: call.name, args: call.args } };

        toolsUsed.push(call.name);
        conversationStore.addToolUsed(session.id, call.name);

        const toolResult = await executeTool(
          call.name,
          (call.args as Record<string, unknown>) || {},
        );

        yield { type: 'tool_result', data: { tool: call.name, result: toolResult.substring(0, 500) } };

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: { result: toolResult },
          },
        });
      }

      pendingFunctionCalls = [];

      // Send tool results back and stream the response
      const followUpStream = await chat.sendMessageStream(functionResponses);
      for await (const chunk of followUpStream.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullText += chunkText;
          yield { type: 'token', data: { text: chunkText } };
        }

        const calls = chunk.functionCalls();
        if (calls && calls.length > 0) {
          pendingFunctionCalls.push(...calls);
        }
      }
    }

    // Save to history
    if (fullText.trim()) {
      conversationStore.addMessage(session.id, {
        role: 'model',
        parts: [{ text: fullText }],
      });
    }

    yield {
      type: 'done',
      data: {
        conversationId: session.id,
        toolsUsed: [...new Set(toolsUsed)],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PharmacyAgent] Stream error:', message);
    yield { type: 'error', data: { message } };
  }
}
