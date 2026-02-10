import { cors } from 'hono/cors';

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map((o) => o.trim());

export const corsMiddleware = cors({
  origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Conversation-Id', 'X-Platform'],
  exposeHeaders: ['X-Request-Id', 'X-Conversation-Id'],
  maxAge: 86400,
  credentials: true,
});
