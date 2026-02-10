import { z } from 'zod';

// ── Chat ────────────────────────────────────────────────────────────────────

export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(4000, 'Message too long'),
  conversationId: z.string().uuid().optional(),
  platform: z.enum(['web', 'ios', 'android', 'api']).optional().default('api'),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  response: z.string(),
  conversationId: z.string(),
  toolsUsed: z.array(z.string()).optional(),
  timestamp: z.string(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

// ── Search ──────────────────────────────────────────────────────────────────

export const SearchQuerySchema = z.object({
  q: z.string().min(1, 'Query cannot be empty'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(5),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

// ── Stock ───────────────────────────────────────────────────────────────────

export const StockParamsSchema = z.object({
  barcode: z.string().min(1, 'Barcode is required'),
});
export type StockParams = z.infer<typeof StockParamsSchema>;

// ── Cart ────────────────────────────────────────────────────────────────────

export const CartItemSchema = z.object({
  barcode: z.string().min(1),
  qty: z.union([z.string(), z.number()]).transform((v) => (typeof v === 'number' ? String(v) : v)),
});

export const CreateCartRequestSchema = z.object({
  items: z.array(CartItemSchema).min(1, 'At least one item is required').max(50),
});
export type CreateCartRequest = z.infer<typeof CreateCartRequestSchema>;

// ── Alternatives ────────────────────────────────────────────────────────────

export const AlternativesParamsSchema = z.object({
  medicineId: z.string().min(1, 'Medicine ID is required'),
});
export type AlternativesParams = z.infer<typeof AlternativesParamsSchema>;

// ── Medicine Details ────────────────────────────────────────────────────────

export const MedicineParamsSchema = z.object({
  id: z.string().min(1, 'Medicine ID is required'),
});
export type MedicineParams = z.infer<typeof MedicineParamsSchema>;

// ── Batch Search ────────────────────────────────────────────────────────────

export const BatchSearchRequestSchema = z.object({
  queries: z.array(z.string().min(1)).min(1).max(6, 'Maximum 6 queries per batch'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});
export type BatchSearchRequest = z.infer<typeof BatchSearchRequestSchema>;

// ── Generic API envelope ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId: string;
    timestamp: string;
    executionTimeMs?: number;
  };
}
