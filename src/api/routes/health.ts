import { Hono } from 'hono';
import type { ApiResponse } from '../types/api.js';
import { conversationStore } from '../sessions/conversationStore.js';
import type { AppEnv } from '../server.js';

const health = new Hono<AppEnv>();

health.get('/', async (c) => {
  const startTime = Date.now();

  // Check Qdrant connectivity
  let qdrantStatus = 'unknown';
  try {
    const { QdrantService } = await import('../../storage/qdrantService.js');
    const qdrant = new QdrantService();
    await qdrant.initialize();
    qdrantStatus = 'connected';
  } catch {
    qdrantStatus = 'error';
  }

  // Check Gemini API key presence
  const geminiConfigured = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  const body: ApiResponse = {
    success: true,
    data: {
      service: 'PharmAssist API',
      version: '1.0.0',
      status: 'healthy',
      uptime: process.uptime(),
      dependencies: {
        qdrant: qdrantStatus,
        gemini: geminiConfigured ? 'configured' : 'missing_key',
      },
      sessions: {
        active: conversationStore.size,
      },
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    },
  };

  return c.json(body);
});

export default health;
