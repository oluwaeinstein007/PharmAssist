import { createMiddleware } from 'hono/factory';
import { jwtVerify, type JWTPayload } from 'jose';
import { ApiError, ErrorCode } from '../types/errors.js';
import type { UserRole } from '../rbac/roles.js';

const VALID_ROLES: UserRole[] = ['customer', 'pharmacist', 'admin'];

function normalizeRole(raw?: string): UserRole {
  const r = (raw || 'customer').toLowerCase();
  // Map legacy 'user' role to 'customer'
  if (r === 'user') return 'customer';
  return VALID_ROLES.includes(r as UserRole) ? (r as UserRole) : 'customer';
}

const API_KEYS = new Set(
  (process.env.API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean)
);

const JWT_SECRET = process.env.JWT_SECRET || '';
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';

export interface AuthPayload {
  userId?: string;
  role?: string;
  platform?: string;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  // Skip auth if disabled (development mode)
  if (!AUTH_ENABLED) {
    // In dev mode, allow X-Role header to test different roles
    const devRole = normalizeRole(c.req.header('X-Role') || 'customer');
    c.set('auth', { userId: 'anonymous', role: devRole, platform: 'dev' } satisfies AuthPayload);
    return next();
  }

  // Try X-API-Key header first (server-to-server / mobile)
  const apiKey = c.req.header('X-API-Key');
  if (apiKey) {
    if (API_KEYS.size === 0) {
      // No API keys configured — allow any key in dev-like setups
      const headerRole = normalizeRole(c.req.header('X-Role'));
      c.set('auth', { userId: 'api-key-user', role: headerRole, platform: 'api' } satisfies AuthPayload);
      return next();
    }
    if (API_KEYS.has(apiKey)) {
      // API key users can specify role via X-Role header (validated by JWT in production)
      const headerRole = normalizeRole(c.req.header('X-Role'));
      c.set('auth', { userId: 'api-key-user', role: headerRole, platform: 'api' } satisfies AuthPayload);
      return next();
    }
    throw new ApiError(ErrorCode.UNAUTHORIZED, 'Invalid API key');
  }

  // Try Bearer token (JWT)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    if (!JWT_SECRET) {
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'JWT_SECRET not configured on server');
    }

    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, secret) as { payload: JWTPayload & { userId?: string; role?: string } };

      c.set('auth', {
        userId: payload.userId || payload.sub || 'jwt-user',
        role: normalizeRole(payload.role),
        platform: c.req.header('X-Platform') || 'unknown',
      } satisfies AuthPayload);

      return next();
    } catch {
      throw new ApiError(ErrorCode.UNAUTHORIZED, 'Invalid or expired JWT token');
    }
  }

  throw new ApiError(ErrorCode.UNAUTHORIZED, 'Missing authentication. Provide X-API-Key or Authorization: Bearer <token>');
});
