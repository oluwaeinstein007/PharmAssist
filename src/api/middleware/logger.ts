import { createMiddleware } from 'hono/factory';

export const requestLogger = createMiddleware(async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const requestId = crypto.randomUUID();

  // Attach requestId to context for downstream use
  c.set('requestId', requestId);

  console.log(`[API] → ${method} ${path} (${requestId})`);

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  const level = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✅';

  console.log(`[API] ${level} ${method} ${path} ${status} ${duration}ms (${requestId})`);
});
