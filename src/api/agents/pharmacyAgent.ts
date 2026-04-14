import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiDeclarations, executeTool } from './toolRegistry.js';
import { conversationStore } from '../sessions/conversationStore.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { getSystemPromptForRole, getAllowedToolsForRole, buildCustomerSystemPrompt } from '../rbac/roles.js';
import { botConfigService } from '../../services/botConfigService.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
const MAX_TOOL_ITERATIONS = 5;

// System prompt is now role-dependent — see src/api/rbac/roles.ts

// ── Public types ────────────────────────────────────────────────────────────

export interface MedicineSearchResult {
  name: string;
  barcode: string;
  price: number;
  inStock: boolean;
  quantity: number;
  category: string;
}

export interface StoreProductResult {
  storeName?: string;
  storeSid: string;
  productName: string;
  barcode: string;
  price: string;
  quantity: number;
  inStock: boolean;
  category: string;
}

export interface AgentResult {
  response: string;
  conversationId: string;
  toolsUsed: string[];
  /** Structured medicine results from the last search_medicines call — for frontend rendering */
  searchResults?: MedicineSearchResult[];
  /** Structured per-store product results from search_store_products — for frontend rendering */
  storeResults?: StoreProductResult[];
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

// ── Search result parser ─────────────────────────────────────────────────────
// Extracts structured medicine data from search_medicines tool result text
// so the frontend can render interactive cards without parsing LLM prose.

function parseSearchResults(toolResult: string): MedicineSearchResult[] {
  const medicines: MedicineSearchResult[] = [];
  const blocks = toolResult.split(/\n(?=\d+\. \*\*)/);

  for (const block of blocks) {
    const nameMatch = block.match(/\d+\. \*\*(.+?)\*\*/);
    const barcodeMatch = block.match(/\[internal:barcode=([^\]]+)\]/);
    const qtyMatch = block.match(/\[internal:qty=(\d+)\]/);
    const priceMatch = block.match(/Price: ₦([\d.]+)/);
    const statusMatch = block.match(/Status: ([\w ]+)/);
    const categoryMatch = block.match(/Category: (.+)/);

    if (nameMatch && barcodeMatch) {
      medicines.push({
        name: nameMatch[1].trim(),
        barcode: barcodeMatch[1].trim(),
        quantity: qtyMatch ? parseInt(qtyMatch[1]) : 0,
        price: priceMatch ? parseFloat(priceMatch[1]) : 0,
        inStock: statusMatch ? statusMatch[1].trim().toLowerCase().includes('in stock') : false,
        category: categoryMatch ? categoryMatch[1].trim() : '',
      });
    }
  }

  return medicines;
}

// ── Store result parser ──────────────────────────────────────────────────────
// Extracts structured store product data from search_store_products tool result.

function parseStoreResults(toolResult: string, storeSid: string): StoreProductResult[] {
  const results: StoreProductResult[] = [];
  const blocks = toolResult.split(/\n(?=\d+\. \*\*)/);
  for (const block of blocks) {
    const nameMatch = block.match(/\d+\. \*\*(.+?)\*\*/);
    const barcodeMatch = block.match(/\[internal:barcode=([^\]]+)\]/);
    const priceMatch = block.match(/Price: ₦([\d.,]+)/);
    const statusMatch = block.match(/Status: ([\w ]+)/);
    const qtyMatch = block.match(/\((\d+) units\)/);
    const categoryMatch = block.match(/Category: (.+)/);
    if (nameMatch && barcodeMatch) {
      results.push({
        storeSid,
        productName: nameMatch[1].trim(),
        barcode: barcodeMatch[1].trim(),
        price: priceMatch ? priceMatch[1].trim() : '0',
        quantity: qtyMatch ? parseInt(qtyMatch[1]) : 0,
        inStock: statusMatch ? statusMatch[1].trim().toLowerCase().includes('in stock') : false,
        category: categoryMatch ? categoryMatch[1].trim() : '',
      });
    }
  }
  return results;
}

// ── Strip internal tags from LLM response ────────────────────────────────────
function stripInternalTags(text: string): string {
  return text.replace(/\[internal:[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ── Search result fallback helpers ──────────────────────────────────────────
// Used when the LLM answers from conversation memory without calling
// search_medicines — we still need to return structured data to the frontend.

/** Returns true when the LLM response clearly contains a medicine product listing. */
function isProductListingResponse(responseText: string, searchResultsHistory: string[]): boolean {
  // Naira price + stock status — the most explicit indicator
  if (/₦[\d,.]+/.test(responseText) && /(in stock|out of stock)/i.test(responseText)) {
    return true;
  }
  // Numbered bold list — LLM rendering of a search result (e.g. "1. **MEDICINE NAME**")
  if (/\d+\.\s+\*\*/.test(responseText)) {
    return true;
  }
  // Any cached product name from a previous search appears in the response
  const responseUpper = responseText.toUpperCase();
  for (const raw of searchResultsHistory) {
    const parsed = parseSearchResults(raw);
    if (parsed.some((r) => responseUpper.includes(r.name.toUpperCase()))) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the best-matching set of structured search results from the session history.
 * Scores each cached result set by how many product names appear in the response text,
 * returning the highest-scoring one (falling back to the most recent if no names match).
 */
function findBestMatchingSearchResults(
  responseText: string,
  searchResultsHistory: string[],
): MedicineSearchResult[] {
  if (searchResultsHistory.length === 0) return [];

  const allParsed = searchResultsHistory
    .map((raw) => parseSearchResults(raw))
    .filter((r) => r.length > 0);

  if (allParsed.length === 0) return [];
  if (allParsed.length === 1) return allParsed[0];

  const responseUpper = responseText.toUpperCase();
  let bestScore = -1;
  let bestResults = allParsed[allParsed.length - 1]; // default: most recent

  for (const results of allParsed) {
    const score = results.filter((r) => responseUpper.includes(r.name.toUpperCase())).length;
    if (score > bestScore) {
      bestScore = score;
      bestResults = results;
    }
  }

  return bestResults;
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
  let latestSearchResults: MedicineSearchResult[] = [];
  let latestStoreResults: StoreProductResult[] = [];

  // Resolve or create conversation session
  let session = conversationId ? conversationStore.get(conversationId) : undefined;
  if (!session) {
    session = conversationStore.create(userId, platform);
  }

  // Resolve role-scoped configuration
  const userRole = role || 'customer';
  const allowedTools = getAllowedToolsForRole(userRole);

  // Inject live bot config into customer system prompt so contact info is always fresh
  let systemInstruction: string;
  if (userRole === 'customer') {
    const botConfig = await botConfigService.getConfig();
    systemInstruction = buildCustomerSystemPrompt(botConfig);
  } else {
    systemInstruction = getSystemPromptForRole(userRole);
  }

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    tools: [{ functionDeclarations: getGeminiDeclarations(allowedTools) }],
    systemInstruction,
  },
  { apiVersion: 'v1beta' }
);

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

      // Capture structured search results so the frontend can render interactive medicine cards
      if (call.name === 'search_medicines') {
        const parsed = parseSearchResults(toolResult);
        if (parsed.length > 0) latestSearchResults = parsed;
      }

      // Capture structured store product results
      if (call.name === 'search_store_products') {
        const sid = String((call.args as Record<string, unknown>).store_sid || '');
        const parsed = parseStoreResults(toolResult, sid);
        if (parsed.length > 0) latestStoreResults = parsed;
      }

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
  const finalResponse = stripInternalTags(
    text && text.trim()
      ? text
      : 'I apologize, but I could not generate a response. Please try rephrasing your question.',
  );

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

  // Fallback: when the LLM answered from memory without calling search_medicines,
  // call the tool programmatically with the user's own message so searchResults
  // always contains fresh, correct data for what the user actually asked about.
  if (latestSearchResults.length === 0 && isProductListingResponse(finalResponse, session.searchResultsHistory)) {
    try {
      const toolResult = await executeTool('search_medicines', { query: message }, allowedTools);
      const parsed = parseSearchResults(toolResult);
      if (parsed.length > 0) {
        latestSearchResults = parsed;
        // Keep session in sync so future turns see this search
        session.lastSearchResults = toolResult;
        session.searchResultsHistory.push(toolResult);
        if (session.searchResultsHistory.length > 10) session.searchResultsHistory.shift();
      }
    } catch {
      // Tool call failed — fall back to best-matching cached results
      const matched = findBestMatchingSearchResults(finalResponse, session.searchResultsHistory);
      if (matched.length > 0) latestSearchResults = matched;
    }
  }

  return {
    response: finalResponse,
    conversationId: session.id,
    toolsUsed: [...new Set(toolsUsed)],
    searchResults: latestSearchResults.length > 0 ? latestSearchResults : undefined,
    storeResults: latestStoreResults.length > 0 ? latestStoreResults : undefined,
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
  let latestSearchResults: MedicineSearchResult[] = [];
  let latestStoreResults: StoreProductResult[] = [];

  // Resolve or create conversation session
  let session = conversationId ? conversationStore.get(conversationId) : undefined;
  if (!session) {
    session = conversationStore.create(userId, platform);
  }

  // Resolve role-scoped configuration
  const userRole = role || 'customer';
  const allowedTools = getAllowedToolsForRole(userRole);

  // Inject live bot config into customer system prompt so contact info is always fresh
  let systemInstruction: string;
  if (userRole === 'customer') {
    const botConfig = await botConfigService.getConfig();
    systemInstruction = buildCustomerSystemPrompt(botConfig);
  } else {
    systemInstruction = getSystemPromptForRole(userRole);
  }

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    tools: [{ functionDeclarations: getGeminiDeclarations(allowedTools) }],
    systemInstruction,
  },
  { apiVersion: 'v1beta' }
);

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

        // Capture structured search results for the done event
        if (call.name === 'search_medicines') {
          const parsed = parseSearchResults(toolResult);
          if (parsed.length > 0) latestSearchResults = parsed;
        }

        // Capture structured store product results for the done event
        if (call.name === 'search_store_products') {
          const sid = String((call.args as Record<string, unknown>).store_sid || '');
          const parsed = parseStoreResults(toolResult, sid);
          if (parsed.length > 0) latestStoreResults = parsed;
        }

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

    fullText = stripInternalTags(fullText);

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

    // Fallback: same as non-streaming path — call search_medicines programmatically.
    if (latestSearchResults.length === 0 && isProductListingResponse(fullText, session.searchResultsHistory)) {
      try {
        const toolResult = await executeTool('search_medicines', { query: message }, allowedTools);
        const parsed = parseSearchResults(toolResult);
        if (parsed.length > 0) {
          latestSearchResults = parsed;
          session.lastSearchResults = toolResult;
          session.searchResultsHistory.push(toolResult);
          if (session.searchResultsHistory.length > 10) session.searchResultsHistory.shift();
        }
      } catch {
        const matched = findBestMatchingSearchResults(fullText, session.searchResultsHistory);
        if (matched.length > 0) latestSearchResults = matched;
      }
    }

    yield {
      type: 'done',
      data: {
        conversationId: session.id,
        toolsUsed: [...new Set(toolsUsed)],
        searchResults: latestSearchResults.length > 0 ? latestSearchResults : undefined,
        storeResults: latestStoreResults.length > 0 ? latestStoreResults : undefined,
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
