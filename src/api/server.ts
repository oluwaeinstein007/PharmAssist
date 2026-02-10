import { Hono } from 'hono';
import type { AuthPayload } from './middleware/auth.js';
import { corsMiddleware } from './middleware/cors.js';
import { requestLogger } from './middleware/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { chatRateLimiter, searchRateLimiter, globalRateLimiter } from './middleware/rateLimiter.js';
import { handleError } from './middleware/errorHandler.js';
import { requireRole } from './rbac/requireRole.js';

import healthRoutes from './routes/health.js';
import searchRoutes from './routes/search.js';
import stockRoutes from './routes/stock.js';
import cartRoutes from './routes/cart.js';
import alternativesRoutes from './routes/alternatives.js';
import medicineRoutes from './routes/medicine.js';
import chatRoutes from './routes/chat.js';
import chatStreamRoutes from './routes/chatStream.js';
import sessionRoutes from './routes/sessions.js';

// ── Hono environment type (shared across all routes) ────────────────────────

export type AppEnv = {
  Variables: {
    requestId: string;
    auth: AuthPayload;
  };
};

// ── App creation ────────────────────────────────────────────────────────────

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ── Global middleware ───────────────────────────────────────────────────
  app.use('*', corsMiddleware);
  app.use('*', requestLogger);

  // ── Global error handler ────────────────────────────────────────────────
  app.onError(handleError);

  // ── Public routes (no auth) ─────────────────────────────────────────────
  app.route('/api/v1/health', healthRoutes);

  // ── Auth-protected routes ───────────────────────────────────────────────
  app.use('/api/v1/*', authMiddleware);
  app.use('/api/v1/*', globalRateLimiter);

  // Chat routes (stricter rate limit)
  app.use('/api/v1/chat/*', chatRateLimiter);
  app.use('/api/v1/chat', chatRateLimiter);
  app.route('/api/v1/chat', chatRoutes);
  app.route('/api/v1/chat/stream', chatStreamRoutes);

  // Search routes
  app.use('/api/v1/search/*', searchRateLimiter);
  app.use('/api/v1/search', searchRateLimiter);
  app.route('/api/v1/search', searchRoutes);

  // Session management routes (all authenticated roles can manage their own sessions)
  app.route('/api/v1/sessions', sessionRoutes);

  // Admin-only routes (future: analytics, system config, cross-user session monitoring)
  app.use('/api/v1/admin/*', requireRole('admin'));

  // Direct service routes
  app.route('/api/v1/stock', stockRoutes);
  app.route('/api/v1/cart', cartRoutes);
  app.route('/api/v1/alternatives', alternativesRoutes);
  app.route('/api/v1/medicine', medicineRoutes);

  // ── Catch-all 404 ──────────────────────────────────────────────────────
  app.notFound((c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${c.req.method} ${c.req.path} not found`,
        },
        meta: {
          requestId: c.get('requestId') || 'unknown',
          timestamp: new Date().toISOString(),
        },
      },
      404,
    );
  });

  return app;
}
