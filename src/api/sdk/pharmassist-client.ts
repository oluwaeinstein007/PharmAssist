/**
 * PharmAssist API Client SDK
 *
 * Platform-agnostic client for the PharmAssist Unified API.
 * Works in browsers, React Native, and Node.js.
 *
 * Usage:
 *   import { PharmAssistClient } from './pharmassist-client';
 *   const client = new PharmAssistClient({ baseUrl: 'https://api.example.com', apiKey: '...' });
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface PharmAssistConfig {
  baseUrl: string;
  apiKey?: string;
  jwtToken?: string;
  platform?: 'web' | 'ios' | 'android' | 'api';
  /** Called when a session snapshot should be persisted (e.g. AsyncStorage) */
  onSessionSnapshot?: (snapshot: SessionSnapshot) => void | Promise<void>;
  /** Called when the connection status changes */
  onConnectionChange?: (connected: boolean) => void;
  /** Request timeout in ms (default 30000) */
  timeout?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  meta?: { requestId: string; timestamp: string; executionTimeMs?: number };
}

export interface ChatResponse {
  response: string;
  conversationId: string;
  toolsUsed?: string[];
  sessionState?: SessionState;
}

export interface SessionState {
  turnCount: number;
  cartItemCount: number;
  pinnedFactCount: number;
  hasSummary: boolean;
}

export interface SessionSnapshot {
  id: string;
  contextSummary: string;
  pinnedFacts: Array<{ key: string; value: string; createdAt: number }>;
  cart: CartItem[];
  lastSearchResults: string;
  recentMessages: Array<{ role: string; parts: Array<{ text: string }>; timestamp: number }>;
  turnCount: number;
  createdAt: number;
  lastActiveAt: number;
  metadata: { userId?: string; platform?: string; toolsUsed: string[] };
}

export interface CartItem {
  barcode: string;
  name: string;
  price: number;
  quantity: number;
  addedAt?: number;
}

export interface Medicine {
  id: string;
  product_name: string;
  price: number;
  quantity: number;
  category_name: string;
  category_slug: string;
  barcode: string;
  score: number;
}

export interface BotConfig {
  contact: {
    support_whatsapp: string;
    support_email: string;
    support_call: string;
    telehealth_whatsapp: string;
    telehealth_email: string;
    telehealth_call: string;
  };
  links: {
    privacy_policy: string;
    order_tracking: string;
    pharmacists: string;
  };
}

export interface StoreLocation {
  sid: string;
  name: string;
  store_address: string;
  state: string;
  local_govt: string;
  latitude: string;
  longitude: string;
}

export interface StoreProduct {
  id: number;
  product_name: string;
  barcode: string;
  price: string;
  dept: number;
  quantity: number;
  store_name: string;
  store_sid: string;
  category_name: string;
  category_slug: string;
  category_id: number;
  updated_at: string;
}

export interface SearchResult {
  query: string;
  medicines: Medicine[];
  totalResults: number;
  executionTime?: number;
}

export interface StockResult {
  barcode: string;
  product_name: string;
  price: number;
  quantity: number;
  category_name: string;
}

export interface CartResult {
  cartId: string;
  cartUrl?: string;
  message?: string;
}

export interface StreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'context' | 'done' | 'error';
  data: Record<string, unknown>;
}

export interface StreamCallbacks {
  onToken?: (text: string) => void;
  onToolCall?: (tool: string, args: Record<string, unknown>) => void;
  onToolResult?: (tool: string, result: string) => void;
  onContext?: (context: Record<string, unknown>) => void;
  onDone?: (result: { conversationId: string; toolsUsed: string[]; sessionState: SessionState }) => void;
  onError?: (error: string) => void;
}

// ── Client ──────────────────────────────────────────────────────────────────

export class PharmAssistClient {
  private baseUrl: string;
  private apiKey?: string;
  private jwtToken?: string;
  private platform: string;
  private timeout: number;
  private conversationId: string | null = null;
  private connected = false;
  private onSessionSnapshot?: PharmAssistConfig['onSessionSnapshot'];
  private onConnectionChange?: PharmAssistConfig['onConnectionChange'];

  constructor(config: PharmAssistConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.jwtToken = config.jwtToken;
    this.platform = config.platform || 'api';
    this.timeout = config.timeout || 30_000;
    this.onSessionSnapshot = config.onSessionSnapshot;
    this.onConnectionChange = config.onConnectionChange;
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  setJwtToken(token: string): void {
    this.jwtToken = token;
  }

  // ── Session ─────────────────────────────────────────────────────────────

  getConversationId(): string | null {
    return this.conversationId;
  }

  setConversationId(id: string | null): void {
    this.conversationId = id;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Internal fetch ──────────────────────────────────────────────────────

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Platform': this.platform,
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    } else if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    }

    if (this.conversationId) {
      headers['X-Conversation-Id'] = this.conversationId;
    }

    return headers;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const json = await response.json() as ApiResponse<T>;

      // Track connection status
      const wasConnected = this.connected;
      this.connected = true;
      if (!wasConnected) this.onConnectionChange?.(true);

      // Track conversation ID from response headers
      const newConvId = response.headers.get('X-Conversation-Id');
      if (newConvId) this.conversationId = newConvId;

      return json;
    } catch (error) {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.onConnectionChange?.(false);

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Health ──────────────────────────────────────────────────────────────

  async checkHealth(): Promise<ApiResponse> {
    return this.request('GET', '/api/v1/health');
  }

  // ── Chat ────────────────────────────────────────────────────────────────

  async sendMessage(message: string): Promise<ChatResponse> {
    const res = await this.request<ChatResponse>('POST', '/api/v1/chat', {
      message,
      conversationId: this.conversationId || undefined,
      platform: this.platform,
    });

    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Chat request failed');
    }

    this.conversationId = res.data.conversationId;

    // Auto-persist session snapshot
    if (this.onSessionSnapshot && this.conversationId) {
      try {
        const snapshot = await this.getSession(this.conversationId);
        if (snapshot.success && snapshot.data) {
          await this.onSessionSnapshot(snapshot.data as SessionSnapshot);
        }
      } catch {
        // Non-critical — don't fail the chat
      }
    }

    return res.data;
  }

  // ── Streaming Chat ──────────────────────────────────────────────────────

  async sendMessageStream(message: string, callbacks: StreamCallbacks): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/chat/stream`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        message,
        conversationId: this.conversationId || undefined,
        platform: this.platform,
      }),
    });

    if (!response.ok || !response.body) {
      callbacks.onError?.(`Stream request failed: ${response.status}`);
      return;
    }

    this.connected = true;
    this.onConnectionChange?.(true);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.substring(7).trim();
            // Next line should be data
            continue;
          }

          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);

              // Determine event type from the SSE event field
              // The Hono SSE format sends event: and data: on separate lines
              // We parse the data and infer the type from its structure
              if (data.text !== undefined) {
                callbacks.onToken?.(data.text);
              } else if (data.tool && data.args) {
                callbacks.onToolCall?.(data.tool, data.args);
              } else if (data.tool && data.result) {
                callbacks.onToolResult?.(data.tool, data.result);
              } else if (data.summary !== undefined || data.cartItemCount !== undefined) {
                callbacks.onContext?.(data);
              } else if (data.conversationId) {
                this.conversationId = data.conversationId;
                callbacks.onDone?.({
                  conversationId: data.conversationId,
                  toolsUsed: data.toolsUsed || [],
                  sessionState: data.sessionState || {},
                });
              } else if (data.message && !data.conversationId) {
                callbacks.onError?.(data.message);
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error.message : 'Stream error');
    }
  }

  // ── Search ──────────────────────────────────────────────────────────────

  async searchMedicines(query: string, limit = 5): Promise<SearchResult> {
    const res = await this.request<{ query: string; medicines: Medicine[]; totalResults: number }>(
      'GET',
      `/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );

    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Search failed');
    }

    return res.data;
  }

  async batchSearch(queries: string[], limit = 5): Promise<{ results: SearchResult[] }> {
    const res = await this.request<{ results: SearchResult[] }>(
      'POST',
      '/api/v1/search/batch',
      { queries, limit },
    );

    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Batch search failed');
    }

    return res.data;
  }

  // ── Stock ───────────────────────────────────────────────────────────────

  async checkStock(barcode: string): Promise<StockResult> {
    const res = await this.request<StockResult>('GET', `/api/v1/stock/${encodeURIComponent(barcode)}`);

    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Stock check failed');
    }

    return res.data;
  }

  // ── Cart (API-level — creates order via external API) ──────────────────

  async createCart(items: Array<{ barcode: string; qty: string | number }>): Promise<CartResult> {
    const res = await this.request<CartResult>('POST', '/api/v1/cart', { items });

    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Cart creation failed');
    }

    return res.data;
  }

  // ── Session management ────────────────────────────────────────────────

  async getSession(id: string): Promise<ApiResponse<SessionSnapshot>> {
    return this.request<SessionSnapshot>('GET', `/api/v1/sessions/${id}`);
  }

  async listSessions(): Promise<ApiResponse<{ sessions: any[]; total: number }>> {
    return this.request('GET', '/api/v1/sessions');
  }

  async deleteSession(id: string): Promise<ApiResponse> {
    return this.request('DELETE', `/api/v1/sessions/${id}`);
  }

  async restoreSession(snapshot: SessionSnapshot): Promise<ApiResponse> {
    const res = await this.request('POST', '/api/v1/sessions/restore', snapshot);
    if (res.success) {
      this.conversationId = snapshot.id;
    }
    return res;
  }

  // ── Session cart (server-side cart state synced with context) ──────────

  async getSessionCart(sessionId?: string): Promise<ApiResponse<{ items: CartItem[]; itemCount: number; total: number }>> {
    const id = sessionId || this.conversationId;
    if (!id) throw new Error('No active session');
    return this.request('GET', `/api/v1/sessions/${id}/cart`);
  }

  async addToSessionCart(item: CartItem, sessionId?: string): Promise<ApiResponse> {
    const id = sessionId || this.conversationId;
    if (!id) throw new Error('No active session');
    return this.request('POST', `/api/v1/sessions/${id}/cart`, item);
  }

  async syncSessionCart(items: CartItem[], sessionId?: string): Promise<ApiResponse> {
    const id = sessionId || this.conversationId;
    if (!id) throw new Error('No active session');
    return this.request('PUT', `/api/v1/sessions/${id}/cart`, { items });
  }

  async clearSessionCart(sessionId?: string): Promise<ApiResponse> {
    const id = sessionId || this.conversationId;
    if (!id) throw new Error('No active session');
    return this.request('DELETE', `/api/v1/sessions/${id}/cart`);
  }

  async removeFromSessionCart(barcode: string, sessionId?: string): Promise<ApiResponse> {
    const id = sessionId || this.conversationId;
    if (!id) throw new Error('No active session');
    return this.request('DELETE', `/api/v1/sessions/${id}/cart/${encodeURIComponent(barcode)}`);
  }

  // ── Medicine details ──────────────────────────────────────────────────

  async getMedicine(id: string): Promise<ApiResponse<Medicine>> {
    return this.request<Medicine>('GET', `/api/v1/medicine/${encodeURIComponent(id)}`);
  }

  async getAlternatives(medicineId: string): Promise<ApiResponse> {
    return this.request('GET', `/api/v1/alternatives/${encodeURIComponent(medicineId)}`);
  }

  // ── Bot config (contact info + links) ─────────────────────────────────

  async getBotConfig(): Promise<BotConfig> {
    const res = await this.request<BotConfig>('GET', '/api/bot-config');
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Failed to fetch bot config');
    }
    return res.data;
  }

  // ── Store locations ───────────────────────────────────────────────────

  async getStoreLocations(): Promise<StoreLocation[]> {
    const res = await this.request<{ status: string; data: StoreLocation[] }>('GET', '/api/stores/locations');
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Failed to fetch store locations');
    }
    return res.data.data;
  }

  // ── Products by store ─────────────────────────────────────────────────

  async getProductsByStore(
    sid: string,
    options: { search?: string; page?: number } = {},
  ): Promise<{ store_sid: string; data: StoreProduct[]; next_page_url: string | null }> {
    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.page) params.set('page', String(options.page));
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ status: string; data: { store_sid: string; data: StoreProduct[]; next_page_url: string | null } }>(
      'GET',
      `/api/products/stores/${encodeURIComponent(sid)}${query}`,
    );
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Failed to fetch products for store');
    }
    return res.data.data;
  }

  async getProductByBarcode(sid: string, barcode: string): Promise<StoreProduct> {
    const res = await this.request<{ status: string; data: StoreProduct }>(
      'GET',
      `/api/products/stores/${encodeURIComponent(sid)}/${encodeURIComponent(barcode)}`,
    );
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Product not found');
    }
    return res.data.data;
  }

  // ── New conversation ──────────────────────────────────────────────────

  startNewConversation(): void {
    this.conversationId = null;
  }
}
