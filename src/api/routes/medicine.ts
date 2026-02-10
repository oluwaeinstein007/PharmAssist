import { Hono } from 'hono';
import { MedicineParamsSchema, type ApiResponse } from '../types/api.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { getRetrievalService } from '../agents/toolRegistry.js';
import type { AppEnv } from '../server.js';

const medicine = new Hono<AppEnv>();

// GET /api/v1/medicine/:id
medicine.get('/:id', async (c) => {
  const startTime = Date.now();
  const parsed = MedicineParamsSchema.safeParse({ id: c.req.param('id') });

  if (!parsed.success) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Invalid medicine ID', {
      issues: parsed.error.issues,
    });
  }

  const retrieval = await getRetrievalService();
  const med = await retrieval.getMedicineById(parsed.data.id);

  if (!med) {
    throw new ApiError(ErrorCode.NOT_FOUND, `Medicine with ID ${parsed.data.id} not found`);
  }

  const body: ApiResponse = {
    success: true,
    data: med,
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    },
  };

  return c.json(body);
});

export default medicine;
