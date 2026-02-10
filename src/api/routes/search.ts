import { Hono } from 'hono';
import { SearchQuerySchema, BatchSearchRequestSchema, type ApiResponse } from '../types/api.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { getRetrievalService } from '../agents/toolRegistry.js';
import type { AppEnv } from '../server.js';

const search = new Hono<AppEnv>();

// GET /api/v1/search?q=paracetamol&limit=5
search.get('/', async (c) => {
  const startTime = Date.now();
  const parsed = SearchQuerySchema.safeParse({
    q: c.req.query('q'),
    limit: c.req.query('limit'),
  });

  if (!parsed.success) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Invalid search parameters', {
      issues: parsed.error.issues,
    });
  }

  const { q, limit } = parsed.data;
  const retrieval = await getRetrievalService();
  const result = await retrieval.searchMedicines(q, limit);

  const body: ApiResponse = {
    success: true,
    data: {
      query: result.query,
      medicines: result.medicines,
      totalResults: result.totalResults,
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    },
  };

  return c.json(body);
});

// POST /api/v1/search/batch — search multiple queries at once
search.post('/batch', async (c) => {
  const startTime = Date.now();
  const rawBody = await c.req.json();
  const parsed = BatchSearchRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Invalid batch search parameters', {
      issues: parsed.error.issues,
    });
  }

  const { queries, limit } = parsed.data;
  const retrieval = await getRetrievalService();

  const results = await Promise.all(
    queries.map(async (q) => {
      try {
        return await retrieval.searchMedicines(q, limit);
      } catch {
        return { query: q, medicines: [], totalResults: 0, executionTime: 0 };
      }
    }),
  );

  const body: ApiResponse = {
    success: true,
    data: { results },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    },
  };

  return c.json(body);
});

export default search;
