import { Hono } from 'hono';
import type { ApiResponse } from '../types/api.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { conversationStore, type SessionSnapshot, type SessionCartItem } from '../sessions/conversationStore.js';
import type { AppEnv } from '../server.js';

const sessions = new Hono<AppEnv>();

// GET /api/v1/sessions — list all sessions for the authenticated user
sessions.get('/', async (c) => {
  const auth = c.get('auth');
  const userId = auth?.userId;

  if (!userId) {
    throw new ApiError(ErrorCode.UNAUTHORIZED, 'User ID required to list sessions');
  }

  const userSessions = conversationStore.listByUser(userId);

  const body: ApiResponse = {
    success: true,
    data: {
      sessions: userSessions.map((s) => ({
        id: s.id,
        turnCount: s.turnCount,
        cartItemCount: s.cart.length,
        pinnedFactCount: s.pinnedFacts.length,
        hasSummary: !!s.contextSummary,
        createdAt: new Date(s.createdAt).toISOString(),
        lastActiveAt: new Date(s.lastActiveAt).toISOString(),
        platform: s.metadata.platform,
      })),
      total: userSessions.length,
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

// GET /api/v1/sessions/:id — get full session snapshot (for mobile restore)
sessions.get('/:id', async (c) => {
  const id = c.req.param('id');
  const snapshot = conversationStore.getSnapshot(id);

  if (!snapshot) {
    throw new ApiError(ErrorCode.CONVERSATION_NOT_FOUND, `Session ${id} not found or expired`);
  }

  const body: ApiResponse = {
    success: true,
    data: snapshot,
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

// POST /api/v1/sessions/restore — restore a session from a client-cached snapshot
sessions.post('/restore', async (c) => {
  const rawBody = await c.req.json();

  if (!rawBody || !rawBody.id) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Session snapshot with id is required');
  }

  const snapshot = rawBody as SessionSnapshot;
  const session = conversationStore.restoreFromSnapshot(snapshot);

  const body: ApiResponse = {
    success: true,
    data: {
      id: session.id,
      restored: true,
      turnCount: session.turnCount,
      cartItemCount: session.cart.length,
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

// DELETE /api/v1/sessions/:id — delete a session
sessions.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = conversationStore.delete(id);

  const body: ApiResponse = {
    success: true,
    data: { id, deleted },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

// ── Session cart management ─────────────────────────────────────────────────

// GET /api/v1/sessions/:id/cart — get cart for a session
sessions.get('/:id/cart', async (c) => {
  const id = c.req.param('id');
  const session = conversationStore.get(id);

  if (!session) {
    throw new ApiError(ErrorCode.CONVERSATION_NOT_FOUND, `Session ${id} not found or expired`);
  }

  const total = session.cart.reduce((s, item) => s + item.price * item.quantity, 0);

  const body: ApiResponse = {
    success: true,
    data: {
      items: session.cart,
      itemCount: session.cart.length,
      total,
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

// POST /api/v1/sessions/:id/cart — add item to session cart
sessions.post('/:id/cart', async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json();

  if (!rawBody?.barcode || !rawBody?.name) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'barcode and name are required');
  }

  const item: SessionCartItem = {
    barcode: String(rawBody.barcode),
    name: String(rawBody.name),
    price: Number(rawBody.price) || 0,
    quantity: Number(rawBody.quantity) || 1,
    addedAt: Date.now(),
  };

  conversationStore.addCartItem(id, item);

  const session = conversationStore.get(id);
  if (!session) {
    throw new ApiError(ErrorCode.CONVERSATION_NOT_FOUND, `Session ${id} not found or expired`);
  }

  const body: ApiResponse = {
    success: true,
    data: {
      items: session.cart,
      itemCount: session.cart.length,
      total: session.cart.reduce((s, i) => s + i.price * i.quantity, 0),
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

// PUT /api/v1/sessions/:id/cart — replace entire cart
sessions.put('/:id/cart', async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json();

  if (!Array.isArray(rawBody?.items)) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'items array is required');
  }

  const items: SessionCartItem[] = rawBody.items.map((i: any) => ({
    barcode: String(i.barcode),
    name: String(i.name),
    price: Number(i.price) || 0,
    quantity: Number(i.quantity) || 1,
    addedAt: Date.now(),
  }));

  conversationStore.updateCart(id, items);

  const body: ApiResponse = {
    success: true,
    data: {
      items,
      itemCount: items.length,
      total: items.reduce((s, i) => s + i.price * i.quantity, 0),
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

// DELETE /api/v1/sessions/:id/cart — clear cart
sessions.delete('/:id/cart', async (c) => {
  const id = c.req.param('id');
  conversationStore.clearCart(id);

  const body: ApiResponse = {
    success: true,
    data: { cleared: true },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

// DELETE /api/v1/sessions/:id/cart/:barcode — remove single item
sessions.delete('/:id/cart/:barcode', async (c) => {
  const id = c.req.param('id');
  const barcode = c.req.param('barcode');
  conversationStore.removeCartItem(id, barcode);

  const session = conversationStore.get(id);

  const body: ApiResponse = {
    success: true,
    data: {
      removed: barcode,
      items: session?.cart || [],
      itemCount: session?.cart.length || 0,
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

export default sessions;
