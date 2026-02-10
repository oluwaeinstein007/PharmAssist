export interface ConversationMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface ConversationSession {
  id: string;
  history: ConversationMessage[];
  createdAt: number;
  lastActiveAt: number;
  metadata: {
    userId?: string;
    platform?: string;
    toolsUsed: string[];
  };
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY_LENGTH = 50; // Max messages per conversation

export class ConversationStore {
  private sessions = new Map<string, ConversationSession>();
  private ttlMs: number;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;

    // Periodic cleanup of expired sessions
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  create(userId?: string, platform?: string): ConversationSession {
    const id = crypto.randomUUID();
    const now = Date.now();

    const session: ConversationSession = {
      id,
      history: [],
      createdAt: now,
      lastActiveAt: now,
      metadata: {
        userId,
        platform,
        toolsUsed: [],
      },
    };

    this.sessions.set(id, session);
    return session;
  }

  get(id: string): ConversationSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    // Check TTL
    if (Date.now() - session.lastActiveAt > this.ttlMs) {
      this.sessions.delete(id);
      return undefined;
    }

    return session;
  }

  addMessage(id: string, message: ConversationMessage): void {
    const session = this.get(id);
    if (!session) return;

    session.history.push(message);
    session.lastActiveAt = Date.now();

    // Trim history if too long (keep system context + recent messages)
    if (session.history.length > MAX_HISTORY_LENGTH) {
      session.history = session.history.slice(-MAX_HISTORY_LENGTH);
    }
  }

  addToolUsed(id: string, toolName: string): void {
    const session = this.get(id);
    if (!session) return;

    if (!session.metadata.toolsUsed.includes(toolName)) {
      session.metadata.toolsUsed.push(toolName);
    }
  }

  getHistory(id: string): ConversationMessage[] {
    const session = this.get(id);
    return session?.history || [];
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  get size(): number {
    return this.sessions.size;
  }

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
