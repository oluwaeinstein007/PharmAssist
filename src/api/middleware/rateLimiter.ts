import { createMiddleware } from 'hono/factory';
import { ApiError, ErrorCode } from '../types/errors.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 60_000);

interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 60_000,
    maxRequests = 60,
    keyPrefix = 'global',
  } = options;

  return createMiddleware(async (c, next) => {
    // Derive key from auth userId, API key, or IP
    const auth = c.get('auth') as { userId?: string } | undefined;
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const identifier = auth?.userId || ip;
    const key = `${keyPrefix}:${identifier}`;

    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      throw new ApiError(ErrorCode.RATE_LIMITED, `Rate limit exceeded. Try again in ${retryAfter}s`);
    }

    return next();
  });
}

export const globalRateLimiter = createRateLimiter({ maxRequests: 120, keyPrefix: 'global' });
export const chatRateLimiter = createRateLimiter({ maxRequests: 30, keyPrefix: 'chat' });
export const searchRateLimiter = createRateLimiter({ maxRequests: 120, keyPrefix: 'search' });
