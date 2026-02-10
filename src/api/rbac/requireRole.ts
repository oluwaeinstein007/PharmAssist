import { createMiddleware } from 'hono/factory';
import { ApiError, ErrorCode } from '../types/errors.js';
import type { UserRole } from './roles.js';

/**
 * Middleware that restricts access to routes based on the authenticated user's role.
 * Must be applied AFTER authMiddleware so that c.get('auth') is populated.
 *
 * Usage:
 *   app.use('/api/v1/admin/*', requireRole('admin'));
 *   app.use('/api/v1/clinical/*', requireRole('pharmacist', 'admin'));
 */
export function requireRole(...allowed: UserRole[]) {
  return createMiddleware(async (c, next) => {
    const auth = c.get('auth') as { role?: string } | undefined;
    const role = (auth?.role || 'customer') as UserRole;

    if (!allowed.includes(role)) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        `This endpoint requires one of the following roles: ${allowed.join(', ')}. Your role: ${role}`,
      );
    }

    return next();
  });
}
