/**
 * usePharmAssist — React hook for PharmAssist API integration
 *
 * Works in both React (web) and React Native.
 * Provides chat, search, cart, and session management with automatic
 * context persistence and session restore.
 *
 * Usage:
 *   const { sendMessage, messages, isLoading, cart, ... } = usePharmAssist({
 *     baseUrl: 'https://api.example.com',
 *     apiKey: 'your-key',
 *   });
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  PharmAssistClient,
  type PharmAssistConfig,
  type ChatResponse,
  type SessionState,
  type SessionSnapshot,
  type CartItem,
  type Medicine,
  type StreamCallbacks,
} from './pharmassist-client.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  toolsUsed?: string[];
}

export interface ProductOption {
  barcode: string;
  name: string;
  price: number;
  available: number;
}

export interface UsePharmAssistOptions extends PharmAssistConfig {
  /** Restore a previous session on mount */
  initialSessionSnapshot?: SessionSnapshot;
  /** Storage adapter for persisting sessions (e.g. AsyncStorage for RN) */
  storage?: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  };
  /** Enable streaming mode (default: false) */
  streaming?: boolean;
}

export interface UsePharmAssistReturn {
  // ── Chat ──────────────────────────────────────────────────────────────
  messages: Message[];
  sendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  isConnected: boolean;

  // ── Session ───────────────────────────────────────────────────────────
  conversationId: string | null;
  sessionState: SessionState | null;
  startNewConversation: () => void;
  restoreSession: (snapshot: SessionSnapshot) => Promise<void>;

  // ── Cart (synced with server context) ─────────────────────────────────
  cart: CartItem[];
  addToCart: (item: CartItem) => Promise<void>;
  removeFromCart: (barcode: string) => Promise<void>;
  updateCart: (items: CartItem[]) => Promise<void>;
  clearCart: () => Promise<void>;
  checkout: () => Promise<{ cartId: string; cartUrl?: string } | null>;
  cartTotal: number;

  // ── Search (direct, bypasses LLM) ────────────────────────────────────
  searchMedicines: (query: string, limit?: number) => Promise<Medicine[]>;

  // ── Stock ─────────────────────────────────────────────────────────────
  checkStock: (barcode: string) => Promise<{ product_name: string; price: number; quantity: number } | null>;

  // ── Product extraction helper ─────────────────────────────────────────
  extractProducts: (content: string) => ProductOption[];

  // ── Client ref (for advanced usage) ───────────────────────────────────
  client: PharmAssistClient;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = 'pharmassist_session';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function extractProductsFromContent(content: string): ProductOption[] {
  const products: ProductOption[] = [];
  const productBlocks = content.split(/\n(?=\d+\.)/);

  for (const block of productBlocks) {
    let nameMatch = block.match(/\d+\.\s*\*\*([^*]+)\*\*/);
    if (!nameMatch) {
      nameMatch = block.match(/\d+\.\s*([^\n]+)/);
    }

    const barcodeMatch = block.match(/\[internal:barcode=([^\]]+)\]/);
    const priceMatch = block.match(/Price:\s*[₦N]?([\d.]+)/);
    const quantityMatch = block.match(/\[internal:qty=(\d+)\]/);

    if (nameMatch && barcodeMatch) {
      products.push({
        barcode: barcodeMatch[1].trim(),
        name: nameMatch[1].trim().replace(/\*\*/g, ''),
        price: parseFloat(priceMatch?.[1] || '0'),
        available: parseInt(quantityMatch?.[1] || '0'),
      });
    }
  }

  return products;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePharmAssist(options: UsePharmAssistOptions): UsePharmAssistReturn {
  const clientRef = useRef<PharmAssistClient | null>(null);

  // Initialize client once
  if (!clientRef.current) {
    clientRef.current = new PharmAssistClient({
      ...options,
      onSessionSnapshot: async (snapshot) => {
        if (options.storage) {
          await options.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
        }
        options.onSessionSnapshot?.(snapshot);
      },
      onConnectionChange: (connected) => {
        setIsConnected(connected);
        options.onConnectionChange?.(connected);
      },
    });
  }
  const client = clientRef.current;

  // ── State ───────────────────────────────────────────────────────────────

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      type: 'system',
      content: `Welcome to PharmAssist!\n\nJust tell me what you need — "Find paracetamol" or "I want 2 aspirin" — and I'll help you find and order medicines.`,
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // ── Connection check on mount ───────────────────────────────────────────

  useEffect(() => {
    client.checkHealth().then(() => setIsConnected(true)).catch(() => setIsConnected(false));
  }, [client]);

  // ── Session restore on mount ────────────────────────────────────────────

  useEffect(() => {
    const restore = async () => {
      // Try explicit snapshot first
      if (options.initialSessionSnapshot) {
        await restoreSession(options.initialSessionSnapshot);
        return;
      }

      // Try storage
      if (options.storage) {
        try {
          const stored = await options.storage.getItem(SESSION_STORAGE_KEY);
          if (stored) {
            const snapshot = JSON.parse(stored) as SessionSnapshot;
            // Only restore if less than 1 hour old
            if (Date.now() - snapshot.lastActiveAt < 60 * 60 * 1000) {
              await restoreSession(snapshot);
            }
          }
        } catch {
          // Ignore storage errors
        }
      }
    };

    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Message helpers ─────────────────────────────────────────────────────

  const addMessage = useCallback((content: string, type: Message['type'], extra?: Partial<Message>): string => {
    const id = generateId();
    setMessages((prev) => [
      ...prev,
      { id, type, content, timestamp: new Date(), ...extra },
    ]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>): void => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg)),
    );
  }, []);

  // ── Send message ────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    addMessage(text, 'user');
    const loadingId = addMessage('Thinking...', 'assistant', { isLoading: true });
    setIsLoading(true);

    try {
      if (options.streaming) {
        // Streaming mode
        let fullText = '';
        const toolsUsed: string[] = [];

        await client.sendMessageStream(text, {
          onToken: (token) => {
            fullText += token;
            updateMessage(loadingId, { content: fullText, isLoading: true });
          },
          onToolCall: (tool) => {
            toolsUsed.push(tool);
          },
          onToolResult: () => {
            // Tool results are incorporated into the streamed text
          },
          onContext: () => {
            // Context is handled server-side
          },
          onDone: (result) => {
            setConversationId(result.conversationId);
            setSessionState(result.sessionState);
            updateMessage(loadingId, {
              content: fullText || 'No response received',
              isLoading: false,
              toolsUsed: result.toolsUsed,
            });
          },
          onError: (error) => {
            updateMessage(loadingId, {
              content: `Error: ${error}`,
              isLoading: false,
              type: 'error',
            } as Partial<Message>);
          },
        });
      } else {
        // Non-streaming mode
        const result = await client.sendMessage(text);
        setConversationId(result.conversationId);
        if (result.sessionState) setSessionState(result.sessionState);

        updateMessage(loadingId, {
          content: result.response,
          isLoading: false,
          toolsUsed: result.toolsUsed,
        });
      }

      setIsConnected(true);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      updateMessage(loadingId, {
        content: `Failed: ${errMsg}`,
        isLoading: false,
        type: 'error',
      } as Partial<Message>);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, client, options.streaming, addMessage, updateMessage]);

  // ── Session management ──────────────────────────────────────────────────

  const startNewConversation = useCallback(() => {
    client.startNewConversation();
    setConversationId(null);
    setSessionState(null);
    setCart([]);
    setMessages([
      {
        id: 'welcome',
        type: 'system',
        content: 'New conversation started. How can I help you?',
        timestamp: new Date(),
      },
    ]);

    if (options.storage) {
      options.storage.removeItem(SESSION_STORAGE_KEY).catch(() => {});
    }
  }, [client, options.storage]);

  const restoreSession = useCallback(async (snapshot: SessionSnapshot) => {
    try {
      await client.restoreSession(snapshot);
      setConversationId(snapshot.id);
      setCart(snapshot.cart || []);

      // Rebuild messages from snapshot
      const restored: Message[] = [
        {
          id: 'restored',
          type: 'system',
          content: 'Previous conversation restored.',
          timestamp: new Date(),
        },
      ];

      for (const msg of snapshot.recentMessages.slice(-10)) {
        restored.push({
          id: generateId(),
          type: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.parts.map((p) => p.text).join(''),
          timestamp: new Date(msg.timestamp),
        });
      }

      setMessages(restored);
    } catch (error) {
      console.error('[usePharmAssist] Session restore failed:', error);
    }
  }, [client]);

  // ── Cart (synced with server session) ───────────────────────────────────

  const addToCart = useCallback(async (item: CartItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.barcode === item.barcode);
      if (existing) {
        return prev.map((c) =>
          c.barcode === item.barcode
            ? { ...c, quantity: c.quantity + item.quantity }
            : c,
        );
      }
      return [...prev, item];
    });

    // Sync with server
    if (conversationId) {
      try {
        await client.addToSessionCart(item);
      } catch {
        // Local state is source of truth; server sync is best-effort
      }
    }
  }, [client, conversationId]);

  const removeFromCart = useCallback(async (barcode: string) => {
    setCart((prev) => prev.filter((c) => c.barcode !== barcode));

    if (conversationId) {
      try {
        await client.removeFromSessionCart(barcode);
      } catch {}
    }
  }, [client, conversationId]);

  const updateCartFn = useCallback(async (items: CartItem[]) => {
    setCart(items);

    if (conversationId) {
      try {
        await client.syncSessionCart(items);
      } catch {}
    }
  }, [client, conversationId]);

  const clearCartFn = useCallback(async () => {
    setCart([]);

    if (conversationId) {
      try {
        await client.clearSessionCart();
      } catch {}
    }
  }, [client, conversationId]);

  const checkout = useCallback(async (): Promise<{ cartId: string; cartUrl?: string } | null> => {
    if (cart.length === 0) return null;

    setIsLoading(true);
    try {
      const result = await client.createCart(
        cart.map((c) => ({ barcode: c.barcode, qty: c.quantity })),
      );

      addMessage(
        `Cart created successfully!\n${cart.map((c) => `${c.name} (qty: ${c.quantity})`).join('\n')}${result.cartUrl ? `\n\nCheckout: ${result.cartUrl}` : ''}`,
        'system',
      );

      setCart([]);
      if (conversationId) {
        try { await client.clearSessionCart(); } catch {}
      }

      return { cartId: result.cartId, cartUrl: result.cartUrl };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Checkout failed';
      addMessage(`Checkout failed: ${errMsg}`, 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [cart, client, conversationId, addMessage]);

  // ── Direct search (bypasses LLM) ───────────────────────────────────────

  const searchMedicines = useCallback(async (query: string, limit = 5): Promise<Medicine[]> => {
    const result = await client.searchMedicines(query, limit);
    return result.medicines;
  }, [client]);

  // ── Stock check ─────────────────────────────────────────────────────────

  const checkStock = useCallback(async (barcode: string) => {
    try {
      return await client.checkStock(barcode);
    } catch {
      return null;
    }
  }, [client]);

  // ── Product extraction ──────────────────────────────────────────────────

  const extractProducts = useCallback((content: string): ProductOption[] => {
    return extractProductsFromContent(content);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    isConnected,
    conversationId,
    sessionState,
    startNewConversation,
    restoreSession,
    cart,
    addToCart,
    removeFromCart,
    updateCart: updateCartFn,
    clearCart: clearCartFn,
    checkout,
    cartTotal,
    searchMedicines,
    checkStock,
    extractProducts,
    client,
  };
}
