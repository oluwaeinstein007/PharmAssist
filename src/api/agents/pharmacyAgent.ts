import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiDeclarations, executeTool } from './toolRegistry.js';
import { conversationStore } from '../sessions/conversationStore.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { getSystemPromptForRole, getAllowedToolsForRole } from '../rbac/roles.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash';
const MAX_TOOL_ITERATIONS = 5;

// System prompt is now role-dependent — see src/api/rbac/roles.ts

// ── Public types ────────────────────────────────────────────────────────────

export interface AgentResult {
  response: string;
  conversationId: string;
  toolsUsed: string[];
  /** Session snapshot for the client to cache (mobile restore) */
  sessionState: {
    turnCount: number;
    cartItemCount: number;
    pinnedFactCount: number;
    hasSummary: boolean;
  };
}

export interface StreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'context' | 'done' | 'error';
  data: Record<string, unknown>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildContextMessage(sessionId: string): string {
  const { contextPreamble } = conversationStore.getContextWindow(sessionId);
  if (!contextPreamble) return '';
  return `[CONTEXT — do not repeat this to the user, use it to inform your responses]\n${contextPreamble}\n[END CONTEXT]\n\n`;
}

interface ToolCallRecord {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
}


function extractPinnedFacts(
  sessionId: string,
  userMessage: string,
  toolCalls: ToolCallRecord[],
): void {
  // Auto-pin user's stated conditions/symptoms
  const symptomMatch = userMessage.match(/\b(?:i have|suffering from|diagnosed with)\s+(.+?)(?:\.|,|$)/i);
  if (symptomMatch) {
    conversationStore.pinFact(sessionId, 'user_condition', symptomMatch[1].trim());
  }

  // Auto-pin search results for reference
  for (const tc of toolCalls) {
    if (tc.name === 'search_medicines' && tc.result) {
      // Store last search in the session (already done in addMessage via toolCalls)
    }
  }
}

// ── Non-streaming chat ──────────────────────────────────────────────────────

export async function processChat(
  message: string,
  conversationId?: string,
  userId?: string,
  platform?: string,
  role?: string,
): Promise<AgentResult> {
  if (!GEMINI_API_KEY) {
    throw new ApiError(ErrorCode.LLM_ERROR, 'GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const toolsUsed: string[] = [];
  const allToolCalls: ToolCallRecord[] = [];

  // Resolve or create conversation session
  let session = conversationId ? conversationStore.get(conversationId) : undefined;
  if (!session) {
    session = conversationStore.create(userId, platform);
  }

  // Resolve role-scoped configuration
  const userRole = role || 'customer';
  const allowedTools = getAllowedToolsForRole(userRole);
  const systemInstruction = getSystemPromptForRole(userRole);

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    tools: [{ functionDeclarations: getGeminiDeclarations(allowedTools) }],
    systemInstruction,
  });

  // Get context-windowed history (not the full raw history)
  const { contextPreamble, recentHistory } = conversationStore.getContextWindow(session.id);

  const history = recentHistory.map((msg) => ({
    role: msg.role,
    parts: msg.parts,
  }));

  const chat = model.startChat({ history });

  // Save user message to history
  conversationStore.addMessage(session.id, {
    role: 'user',
    parts: [{ text: message }],
  });

  // Prepend context preamble to the user message so the model sees it
  const contextBlock = buildContextMessage(session.id);
  const enrichedMessage = contextBlock ? `${contextBlock}${message}` : message;

  // Send message and enter tool-calling loop
  let response = await chat.sendMessage(enrichedMessage);
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

      // Inject the session's stable cart UID so the external cart is updated, not recreated
      let callArgs = (call.args as Record<string, unknown>) || {};
      if (call.name === 'create_cart') {
        const existingCartId = conversationStore.get(session.id)?.cartId;
        if (existingCartId) callArgs = { ...callArgs, cart_id: existingCartId };
      }

      const toolResult = await executeTool(call.name, callArgs, allowedTools);

      allToolCalls.push({
        name: call.name,
        args: call.args as Record<string, unknown>,
        result: toolResult,
      });

      // Sync session cart when CREATE_CART succeeds (full replace — CREATE_CART is the source of truth)
      if (call.name === 'create_cart' && toolResult.includes('successfully')) {
        // Persist the cart UID from the result so it's reused next time
        const cartIdMatch = toolResult.match(/Cart ID:\s*([a-f0-9-]+)/i);
        if (cartIdMatch && !conversationStore.get(session.id)?.cartId) {
          conversationStore.setCartId(session.id, cartIdMatch[1]);
        }
        const cartArgs = call.args as { items: Array<{ barcode: string; qty: string | number; name?: string; price?: number }> | { barcode: string; qty: string | number; name?: string; price?: number } };
        const itemsArray = Array.isArray(cartArgs.items) ? cartArgs.items : [cartArgs.items];
        conversationStore.updateCart(session.id, itemsArray.map(item => ({
          barcode: item.barcode,
          name: item.name || item.barcode,
          price: item.price || 0,
          quantity: Number(item.qty) || 1,
          addedAt: Date.now(),
        })));
      }

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

  // Save assistant response with tool call metadata
  conversationStore.addMessage(session.id, {
    role: 'model',
    parts: [{ text: finalResponse }],
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
  });

  // Auto-extract pinned facts from this turn
  extractPinnedFacts(session.id, message, allToolCalls);

  // Refresh session reference (summarization may have mutated it)
  session = conversationStore.get(session.id)!;

  return {
    response: finalResponse,
    conversationId: session.id,
    toolsUsed: [...new Set(toolsUsed)],
    sessionState: {
      turnCount: session.turnCount,
      cartItemCount: session.cart.length,
      pinnedFactCount: session.pinnedFacts.length,
      hasSummary: !!session.contextSummary,
    },
  };
}

// ── Streaming chat ──────────────────────────────────────────────────────────

export async function* processChatStream(
  message: string,
  conversationId?: string,
  userId?: string,
  platform?: string,
  role?: string,
): AsyncGenerator<StreamEvent> {
  if (!GEMINI_API_KEY) {
    yield { type: 'error', data: { message: 'GEMINI_API_KEY is not configured' } };
    return;
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const toolsUsed: string[] = [];
  const allToolCalls: ToolCallRecord[] = [];

  // Resolve or create conversation session
  let session = conversationId ? conversationStore.get(conversationId) : undefined;
  if (!session) {
    session = conversationStore.create(userId, platform);
  }

  // Resolve role-scoped configuration
  const userRole = role || 'customer';
  const allowedTools = getAllowedToolsForRole(userRole);
  const systemInstruction = getSystemPromptForRole(userRole);

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    tools: [{ functionDeclarations: getGeminiDeclarations(allowedTools) }],
    systemInstruction,
  });

  const { contextPreamble, recentHistory } = conversationStore.getContextWindow(session.id);

  const history = recentHistory.map((msg) => ({
    role: msg.role,
    parts: msg.parts,
  }));

  const chat = model.startChat({ history });

  conversationStore.addMessage(session.id, {
    role: 'user',
    parts: [{ text: message }],
  });

  // Emit context event so the client knows what state the server has
  if (contextPreamble) {
    yield {
      type: 'context',
      data: {
        summary: session.contextSummary || null,
        cartItemCount: session.cart.length,
        pinnedFacts: session.pinnedFacts.map((f) => ({ key: f.key, value: f.value })),
        turnCount: session.turnCount,
      },
    };
  }

  const contextBlock = buildContextMessage(session.id);
  const enrichedMessage = contextBlock ? `${contextBlock}${message}` : message;

  try {
    const streamResult = await chat.sendMessageStream(enrichedMessage);
    let fullText = '';
    let pendingFunctionCalls: any[] = [];

    for await (const chunk of streamResult.stream) {
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

    // Handle tool calls
    let iterations = 0;
    while (pendingFunctionCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      const functionResponses = [];

      for (const call of pendingFunctionCalls) {
        yield { type: 'tool_call', data: { tool: call.name, args: call.args } };

        toolsUsed.push(call.name);
        conversationStore.addToolUsed(session.id, call.name);

        // Inject the session's stable cart UID so the external cart is updated, not recreated
        let callArgs = (call.args as Record<string, unknown>) || {};
        if (call.name === 'create_cart') {
          const existingCartId = conversationStore.get(session.id)?.cartId;
          if (existingCartId) callArgs = { ...callArgs, cart_id: existingCartId };
        }

        const toolResult = await executeTool(call.name, callArgs, allowedTools);

        allToolCalls.push({
          name: call.name,
          args: call.args as Record<string, unknown>,
          result: toolResult,
        });

        yield { type: 'tool_result', data: { tool: call.name, result: toolResult.substring(0, 500) } };

        // Sync session cart when CREATE_CART succeeds (full replace — CREATE_CART is the source of truth)
        if (call.name === 'create_cart' && toolResult.includes('successfully')) {
          // Persist the cart UID from the result so it's reused next time
          const cartIdMatch = toolResult.match(/Cart ID:\s*([a-f0-9-]+)/i);
          if (cartIdMatch && !conversationStore.get(session.id)?.cartId) {
            conversationStore.setCartId(session.id, cartIdMatch[1]);
          }
          const cartArgs = call.args as { items: Array<{ barcode: string; qty: string | number; name?: string; price?: number }> | { barcode: string; qty: string | number; name?: string; price?: number } };
          const itemsArray = Array.isArray(cartArgs.items) ? cartArgs.items : [cartArgs.items];
          conversationStore.updateCart(session.id, itemsArray.map(item => ({
            barcode: item.barcode,
            name: item.name || item.barcode,
            price: item.price || 0,
            quantity: Number(item.qty) || 1,
            addedAt: Date.now(),
          })));
        }

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: { result: toolResult },
          },
        });
      }

      pendingFunctionCalls = [];

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

    // Save to history with tool metadata
    if (fullText.trim()) {
      conversationStore.addMessage(session.id, {
        role: 'model',
        parts: [{ text: fullText }],
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      });
    }

    // Auto-extract pinned facts
    extractPinnedFacts(session.id, message, allToolCalls);

    // Refresh session
    session = conversationStore.get(session.id)!;

    yield {
      type: 'done',
      data: {
        conversationId: session.id,
        toolsUsed: [...new Set(toolsUsed)],
        sessionState: {
          turnCount: session.turnCount,
          cartItemCount: session.cart.length,
          pinnedFactCount: session.pinnedFacts.length,
          hasSummary: !!session.contextSummary,
        },
      },
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PharmacyAgent] Stream error:', errMsg);
    yield { type: 'error', data: { message: errMsg } };
  }
}
