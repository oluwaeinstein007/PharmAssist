import { Hono } from 'hono';
import { CreateCartRequestSchema, type ApiResponse } from '../types/api.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { CreateCartService } from '../../services/createCartService.js';
import type { AppEnv } from '../server.js';

const cart = new Hono<AppEnv>();

// POST /api/v1/cart
cart.post('/', async (c) => {
  const startTime = Date.now();
  const rawBody = await c.req.json();
  const parsed = CreateCartRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Invalid cart request', {
      issues: parsed.error.issues,
    });
  }

  const service = new CreateCartService();
  const result = await service.createCart(
    parsed.data.items.map((item) => ({
      barcode: item.barcode,
      qty: item.qty,
    })),
  );

  if (!result.success) {
    throw new ApiError(ErrorCode.TOOL_EXECUTION_FAILED, result.error || 'Cart creation failed');
  }

  const body: ApiResponse = {
    success: true,
    data: {
      cartId: result.cartId,
      cartUrl: result.cartUrl,
      message: result.message,
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    },
  };

  return c.json(body);
});

export default cart;
