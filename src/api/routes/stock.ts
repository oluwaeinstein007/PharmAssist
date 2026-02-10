import { Hono } from 'hono';
import { StockParamsSchema, type ApiResponse } from '../types/api.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { CheckStockService } from '../../services/checkStockService.js';
import type { AppEnv } from '../server.js';

const stock = new Hono<AppEnv>();

// GET /api/v1/stock/:barcode
stock.get('/:barcode', async (c) => {
  const startTime = Date.now();
  const parsed = StockParamsSchema.safeParse({ barcode: c.req.param('barcode') });

  if (!parsed.success) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Invalid barcode', {
      issues: parsed.error.issues,
    });
  }

  const service = new CheckStockService();
  const result = await service.checkStock({ medicine_barcode: parsed.data.barcode });

  if (!result.success) {
    throw new ApiError(ErrorCode.SERVICE_UNAVAILABLE, result.error || 'Stock check failed');
  }

  const body: ApiResponse = {
    success: true,
    data: result.data,
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    },
  };

  return c.json(body);
});

export default stock;
