// ── Message types ───────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
  timestamp: number;
  /** If this message triggered or resulted from a tool call */
  toolCalls?: Array<{ name: string; args?: Record<string, unknown>; result?: string }>;
}

// ── Cart item tracked across the session ────────────────────────────────────

export interface SessionCartItem {
  barcode: string;
  name: string;
  price: number;
  quantity: number;
  addedAt: number;
}

// ── Pinned facts that survive context windowing ─────────────────────────────

export interface PinnedFact {
  key: string;
  value: string;
  createdAt: number;
}

// ── Session ─────────────────────────────────────────────────────────────────

export interface ConversationSession {
  id: string;

  /** Full raw history — never truncated, used for session restore */
  history: ConversationMessage[];

  /** Rolling summary of older messages that fell outside the context window */
  contextSummary: string;

  /** Key facts extracted from the conversation that must persist */
  pinnedFacts: PinnedFact[];

  /** Cart state tracked across the entire session */
  cart: SessionCartItem[];

  /** Stable cart UID reused across all create_cart calls in this session */
  cartId: string;

  /** Last search results so the agent can reference them */
  lastSearchResults: string;

  createdAt: number;
  lastActiveAt: number;
  turnCount: number;

  metadata: {
    userId?: string;
    platform?: string;
    toolsUsed: string[];
  };
}

// ── Serializable snapshot for session restore / mobile handoff ──────────────

export interface SessionSnapshot {
  id: string;
  contextSummary: string;
  pinnedFacts: PinnedFact[];
  cart: SessionCartItem[];
  cartId: string;
  lastSearchResults: string;
  recentMessages: ConversationMessage[];
  turnCount: number;
  createdAt: number;
  lastActiveAt: number;
  metadata: ConversationSession['metadata'];
}

// ── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour (was 30 min — too aggressive for mobile)
const CONTEXT_WINDOW_SIZE = 20;         // Recent messages sent to the LLM
const SUMMARIZE_THRESHOLD = 30;         // Trigger summarization when raw history exceeds this
const MAX_RAW_HISTORY = 200;            // Hard cap on raw history to bound memory

// ── Store ───────────────────────────────────────────────────────────────────

export class ConversationStore {
  private sessions = new Map<string, ConversationSession>();
  private ttlMs: number;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  // ── Create ──────────────────────────────────────────────────────────────

  create(userId?: string, platform?: string): ConversationSession {
    const id = crypto.randomUUID();
    const now = Date.now();

    const session: ConversationSession = {
      id,
      history: [],
      contextSummary: '',
      pinnedFacts: [],
      cart: [],
      cartId: '',
      lastSearchResults: '',
      createdAt: now,
      lastActiveAt: now,
      turnCount: 0,
      metadata: { userId, platform, toolsUsed: [] },
    };

    this.sessions.set(id, session);
    return session;
  }

  // ── Get (with TTL check) ────────────────────────────────────────────────

  get(id: string): ConversationSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    if (Date.now() - session.lastActiveAt > this.ttlMs) {
      this.sessions.delete(id);
      return undefined;
    }

    return session;
  }

  // ── Add message + auto-summarize ────────────────────────────────────────

  addMessage(id: string, message: Omit<ConversationMessage, 'timestamp'>): void {
    const session = this.get(id);
    if (!session) return;

    const fullMessage: ConversationMessage = { ...message, timestamp: Date.now() };
    session.history.push(fullMessage);
    session.lastActiveAt = Date.now();
    if (message.role === 'user') session.turnCount++;

    // Auto-extract pinned facts from tool results
    if (fullMessage.toolCalls) {
      for (const tc of fullMessage.toolCalls) {
        if (tc.name === 'search_medicines' && tc.result) {
          session.lastSearchResults = tc.result;
        }
      }
    }

    // Trigger summarization when history grows beyond threshold
    if (session.history.length > SUMMARIZE_THRESHOLD) {
      this.summarizeOlderMessages(session);
    }

    // Hard cap
    if (session.history.length > MAX_RAW_HISTORY) {
      session.history = session.history.slice(-MAX_RAW_HISTORY);
    }
  }

  // ── Tool tracking ───────────────────────────────────────────────────────

  addToolUsed(id: string, toolName: string): void {
    const session = this.get(id);
    if (!session) return;
    if (!session.metadata.toolsUsed.includes(toolName)) {
      session.metadata.toolsUsed.push(toolName);
    }
  }

  // ── Pinned facts ────────────────────────────────────────────────────────

  pinFact(id: string, key: string, value: string): void {
    const session = this.get(id);
    if (!session) return;

    const existing = session.pinnedFacts.find((f) => f.key === key);
    if (existing) {
      existing.value = value;
      existing.createdAt = Date.now();
    } else {
      session.pinnedFacts.push({ key, value, createdAt: Date.now() });
    }
  }

  unpinFact(id: string, key: string): void {
    const session = this.get(id);
    if (!session) return;
    session.pinnedFacts = session.pinnedFacts.filter((f) => f.key !== key);
  }

  // ── Cart state ──────────────────────────────────────────────────────────

  updateCart(id: string, items: SessionCartItem[]): void {
    const session = this.get(id);
    if (!session) return;
    session.cart = items;
  }

  addCartItem(id: string, item: SessionCartItem): void {
    const session = this.get(id);
    if (!session) return;

    const existing = session.cart.find((c) => c.barcode === item.barcode);
    if (existing) {
      existing.quantity += item.quantity;
      existing.addedAt = Date.now();
    } else {
      session.cart.push(item);
    }
  }

  removeCartItem(id: string, barcode: string): void {
    const session = this.get(id);
    if (!session) return;
    session.cart = session.cart.filter((c) => c.barcode !== barcode);
  }

  clearCart(id: string): void {
    const session = this.get(id);
    if (!session) return;
    session.cart = [];
    session.cartId = '';
  }

  setCartId(id: string, cartId: string): void {
    const session = this.get(id);
    if (!session) return;
    session.cartId = cartId;
  }

  // ── Context window for LLM ─────────────────────────────────────────────
  //
  // Returns the messages that should be sent to the LLM as chat history.
  // This is the core context engineering: we compose a context block from
  // (1) a summary of older conversation, (2) pinned facts, (3) cart state,
  // (4) last search results, and (5) the most recent N messages.

  getContextWindow(id: string): {
    contextPreamble: string;
    recentHistory: ConversationMessage[];
  } {
    const session = this.get(id);
    if (!session) return { contextPreamble: '', recentHistory: [] };

    // Build preamble from structured context
    const parts: string[] = [];

    // 1. Rolling summary of older conversation
    if (session.contextSummary) {
      parts.push(`[CONVERSATION SUMMARY]\n${session.contextSummary}`);
    }

    // 2. Pinned facts
    if (session.pinnedFacts.length > 0) {
      const facts = session.pinnedFacts.map((f) => `- ${f.key}: ${f.value}`).join('\n');
      parts.push(`[KEY FACTS]\n${facts}`);
    }

    // 3. Cart state
    if (session.cart.length > 0) {
      const cartLines = session.cart.map(
        (c) => `- ${c.name} (barcode: ${c.barcode}, qty: ${c.quantity}, price: ₦${c.price})`,
      ).join('\n');
      const total = session.cart.reduce((s, c) => s + c.price * c.quantity, 0);
      parts.push(`[CURRENT CART — ${session.cart.length} item(s), total: ₦${total.toFixed(2)}]\n${cartLines}`);
    }

    // 4. Last search results (condensed)
    if (session.lastSearchResults) {
      const truncated = session.lastSearchResults.length > 800
        ? session.lastSearchResults.substring(0, 800) + '\n...(truncated)'
        : session.lastSearchResults;
      parts.push(`[LAST SEARCH RESULTS]\n${truncated}`);
    }

    const contextPreamble = parts.length > 0 ? parts.join('\n\n') : '';

    // 5. Recent messages within the context window
    const recentHistory = session.history.slice(-CONTEXT_WINDOW_SIZE);

    return { contextPreamble, recentHistory };
  }

  // ── Summarization (runs in-process, no LLM call — extractive) ──────────
  //
  // We don't call the LLM for summarization (that would be slow/expensive).
  // Instead we do extractive summarization: pull out the key user intents
  // and assistant actions from older messages and compress them.

  private summarizeOlderMessages(session: ConversationSession): void {
    const cutoff = session.history.length - CONTEXT_WINDOW_SIZE;
    if (cutoff <= 0) return;

    const olderMessages = session.history.slice(0, cutoff);
    const summaryLines: string[] = [];

    if (session.contextSummary) {
      summaryLines.push(session.contextSummary);
    }

    for (const msg of olderMessages) {
      const text = msg.parts.map((p) => p.text).join(' ').trim();
      if (!text) continue;

      if (msg.role === 'user') {
        // Extract user intent — keep it short
        const short = text.length > 120 ? text.substring(0, 120) + '...' : text;
        summaryLines.push(`User asked: "${short}"`);
      } else {
        // Extract key outcomes from model responses
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            summaryLines.push(`Used ${tc.name}${tc.args ? ` with ${JSON.stringify(tc.args).substring(0, 80)}` : ''}`);
          }
        }
        // Extract cart creation or key results
        if (text.includes('Cart created') || text.includes('cart created')) {
          summaryLines.push('A cart was created.');
        }
        if (text.includes('Found') && text.includes('medicine')) {
          const match = text.match(/Found (\d+) medicine/);
          if (match) summaryLines.push(`Found ${match[1]} medicine(s) in a search.`);
        }
      }
    }

    // Deduplicate and cap summary length
    const unique = [...new Set(summaryLines)];
    const maxSummaryLines = 20;
    session.contextSummary = unique.slice(-maxSummaryLines).join('\n');

    // Remove the summarized messages from history (keep only the window)
    session.history = session.history.slice(cutoff);

    console.log(
      `[ConversationStore] Summarized ${olderMessages.length} messages for session ${session.id.substring(0, 8)}. ` +
      `Summary: ${session.contextSummary.length} chars, History: ${session.history.length} messages`,
    );
  }

  // ── Session snapshot (for mobile restore / handoff) ─────────────────────

  getSnapshot(id: string): SessionSnapshot | undefined {
    const session = this.get(id);
    if (!session) return undefined;

    return {
      id: session.id,
      contextSummary: session.contextSummary,
      pinnedFacts: session.pinnedFacts,
      cart: session.cart,
      cartId: session.cartId,
      lastSearchResults: session.lastSearchResults,
      recentMessages: session.history.slice(-CONTEXT_WINDOW_SIZE),
      turnCount: session.turnCount,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      metadata: session.metadata,
    };
  }

  // ── Restore session from snapshot (mobile app resume) ───────────────────

  restoreFromSnapshot(snapshot: SessionSnapshot): ConversationSession {
    const existing = this.sessions.get(snapshot.id);
    if (existing) return existing; // Already active, don't overwrite

    const session: ConversationSession = {
      id: snapshot.id,
      history: snapshot.recentMessages,
      contextSummary: snapshot.contextSummary,
      pinnedFacts: snapshot.pinnedFacts,
      cart: snapshot.cart,
      cartId: snapshot.cartId || '',
      lastSearchResults: snapshot.lastSearchResults,
      createdAt: snapshot.createdAt,
      lastActiveAt: Date.now(),
      turnCount: snapshot.turnCount,
      metadata: snapshot.metadata,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  // ── List sessions for a user ────────────────────────────────────────────

  listByUser(userId: string): SessionSnapshot[] {
    const results: SessionSnapshot[] = [];
    const now = Date.now();

    for (const [, session] of this.sessions) {
      if (session.metadata.userId === userId && now - session.lastActiveAt <= this.ttlMs) {
        results.push(this.getSnapshot(session.id)!);
      }
    }

    return results.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  // ── Delete & size ───────────────────────────────────────────────────────

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  get size(): number {
    return this.sessions.size;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActiveAt > this.ttlMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[ConversationStore] Cleaned up ${cleaned} expired sessions. Active: ${this.sessions.size}`);
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}

// Singleton instance
export const conversationStore = new ConversationStore();
