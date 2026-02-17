import { Hono } from 'hono';
import { ChatRequestSchema, type ApiResponse } from '../types/api.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { processChat } from '../agents/pharmacyAgent.js';
import type { AppEnv } from '../server.js';

const chat = new Hono<AppEnv>();

// POST /api/v1/chat
chat.post('/', async (c) => {
  const startTime = Date.now();
  const rawBody = await c.req.json();

  // Support X-Conversation-Id header as alternative to body field
  const headerConversationId = c.req.header('X-Conversation-Id');
  if (headerConversationId && !rawBody.conversationId) {
    rawBody.conversationId = headerConversationId;
  }

  const parsed = ChatRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Invalid chat request', {
      issues: parsed.error.issues,
    });
  }

  const auth = c.get('auth');
  const { message, conversationId, platform } = parsed.data;

  const result = await processChat(
    message,
    conversationId,
    auth?.userId,
    platform,
    auth?.role,
  );

  // Set conversation ID header for mobile clients
  c.header('X-Conversation-Id', result.conversationId);

  const body: ApiResponse = {
    success: true,
    data: {
      response: result.response,
      conversationId: result.conversationId,
      toolsUsed: result.toolsUsed,
      sessionState: result.sessionState,
    },
    meta: {
      requestId: c.get('requestId') || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    },
  };

  return c.json(body);
});

export default chat;
