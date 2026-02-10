import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ChatRequestSchema } from '../types/api.js';
import { ApiError, ErrorCode } from '../types/errors.js';
import { processChatStream } from '../agents/pharmacyAgent.js';
import type { AppEnv } from '../server.js';

const chatStream = new Hono<AppEnv>();

// POST /api/v1/chat/stream — SSE streaming chat
chatStream.post('/', async (c) => {
  const rawBody = await c.req.json();

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

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    const generator = processChatStream(
      message,
      conversationId,
      auth?.userId,
      platform,
    );

    for await (const event of generator) {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event.data),
        id: String(eventId++),
      });
    }
  });
});

export default chatStream;
