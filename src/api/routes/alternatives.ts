import { Hono } from 'hono';
import { AlternativesParamsSchema, type ApiResponse } from '../types/api.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { getRetrievalService } from '../agents/toolRegistry.js';
import type { AppEnv } from '../server.js';

const alternatives = new Hono<AppEnv>();

// GET /api/v1/alternatives/:medicineId
alternatives.get('/:medicineId', async (c) => {
  const startTime = Date.now();
  const parsed = AlternativesParamsSchema.safeParse({
    medicineId: c.req.param('medicineId'),
  });

  if (!parsed.success) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Invalid medicine ID', {
      issues: parsed.error.issues,
    });
  }

  const retrieval = await getRetrievalService();

  // Get the original medicine first
  const original = await retrieval.getMedicineById(parsed.data.medicineId);
  if (!original) {
    throw new ApiError(ErrorCode.NOT_FOUND, `Medicine with ID ${parsed.data.medicineId} not found`);
  }

  // Search for alternatives using the medicine name and category
  const searchQuery = `${original.product_name} ${original.category_name}`;
  const result = await retrieval.searchMedicines(searchQuery, 10);

  // Filter out the original medicine
  const alternativeMeds = result.medicines.filter(
    (med) => med.id !== parsed.data.medicineId,
  );

  const body: ApiResponse = {
    success: true,
    data: {
      original: {
        id: original.id,
        name: original.product_name,
        price: original.price,
        category: original.category_name,
      },
      alternatives: alternativeMeds,
      totalAlternatives: alternativeMeds.length,
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    },
  };

  return c.json(body);
});

export default alternatives;
