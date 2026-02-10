import type { Context } from 'hono';
import { ApiError, ErrorCode, ErrorStatusMap } from '../types/errors.js';
import type { ApiResponse } from '../types/api.js';

export function handleError(err: Error, c: Context): Response {
  const requestId = c.get('requestId') || 'unknown';

  if (err instanceof ApiError) {
    const body: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(body, err.statusCode as any);
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    const body: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: { issues: (err as any).issues || (err as any).errors },
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(body, ErrorStatusMap[ErrorCode.VALIDATION_ERROR] as any);
  }

  // Unexpected errors
  console.error(`[API] Unhandled error (${requestId}):`, err);

  const body: ApiResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message || 'Unknown error',
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
  return c.json(body, 500);
}
