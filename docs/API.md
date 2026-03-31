# PharmAssist Unified API Documentation

## Overview

The PharmAssist Unified API is a Hono.js-based REST API that bundles the pharmacy chat assistant, medicine search, cart management, and session management into a single server. It supports both Bun and Node.js runtimes.

**Base URL:** `http://localhost:5050/api/v1`

---

## Table of Contents

- [Authentication](#authentication)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [Health](#health)
- [Chat](#chat)
- [Chat Streaming](#chat-streaming)
- [Search](#search)
- [Stock](#stock)
- [Cart](#cart)
- [Sessions](#sessions)
- [Session Cart](#session-cart)
- [Alternatives](#alternatives)
- [Medicine Details](#medicine-details)
- [Bot Configuration](#bot-configuration)
- [Store Locations](#store-locations)
- [Store Products](#store-products)
- [Context Engineering](#context-engineering)
- [Bot Compliance & Safety Rules](#bot-compliance--safety-rules)
- [SDK Integration](#sdk-integration)
- [Error Handling](#error-handling)

---

## Authentication

All endpoints under `/api/v1/*` (except `/api/v1/health`) require authentication when `AUTH_ENABLED` is not set to `false`.

### API Key

```
X-API-Key: your-api-key
```

### JWT Bearer Token

```
Authorization: Bearer your-jwt-token
```

Set `AUTH_ENABLED=false` to disable authentication in development.

---

## Role-Based Access Control (RBAC)

The API enforces role-based access control at three levels:

1. **Route level** -- Certain API routes are restricted to specific roles
2. **Tool level** -- The chat agent only exposes tools permitted for the user's role
3. **System prompt level** -- The LLM receives a role-specific system prompt that governs what topics it will discuss

### Roles

| Role | Label | Description |
|------|-------|-------------|
| `customer` | Customer | End users searching for and ordering medicines |
| `pharmacist` | Pharmacist | Licensed pharmacists and clinical staff |
| `admin` | Administrator | Back-office staff with full operational access |

### How Roles Are Determined

**JWT tokens:** The `role` field in the JWT payload is used.

```json
{
  "sub": "user-123",
  "userId": "user-123",
  "role": "pharmacist"
}
```

**API key + X-Role header:** When using API key auth, include the `X-Role` header.

```
X-API-Key: your-key
X-Role: pharmacist
```

**Dev mode (`AUTH_ENABLED=false`):** Use the `X-Role` header to test different roles. Defaults to `customer`.

```bash
curl -X POST http://localhost:5050/api/v1/chat \
  -H 'Content-Type: application/json' \
  -H 'X-Role: pharmacist' \
  -d '{"message": "What are the drug interactions for amoxicillin?"}'
```

### Tool Access by Role

| Tool | Customer | Pharmacist | Admin |
|------|----------|------------|-------|
| `search_medicines` | Yes | Yes | Yes |
| `check_stock` | Yes | Yes | Yes |
| `create_cart` | Yes | Yes | Yes |
| `get_medicine_details` | Yes | Yes | Yes |
| `find_alternatives` | Yes | Yes | Yes |
| `get_store_locations` | Yes | Yes | Yes |
| `search_store_products` | Yes | Yes | Yes |
| `log_purchase` | No | Yes | Yes |
| `notify_admin` | No | Yes | Yes |

### Chatbot Behavior by Role

**Customer:**
- Can search medicines, check stock, create carts, find alternatives
- Can ask basic health questions (non-diagnostic)
- Cannot receive clinical advice, dosage recommendations, or drug interaction details
- If clinical advice is needed, the chatbot recommends speaking with a pharmacist

**Pharmacist:**
- All customer capabilities plus clinical tools
- Can discuss drug interactions, contraindications, dosage guidance
- Can log purchases and notify admin about stock issues
- Receives detailed clinical information from the LLM
- Cannot access admin analytics or system configuration

**Admin:**
- All pharmacist capabilities
- Can access operational insights and inventory management topics
- Can monitor sessions and conversations
- Future: access to `/api/v1/admin/*` routes for analytics and system config

### Route Access by Role

| Route Pattern | Customer | Pharmacist | Admin |
|---------------|----------|------------|-------|
| `/api/v1/chat` | Yes | Yes | Yes |
| `/api/v1/search` | Yes | Yes | Yes |
| `/api/v1/stock` | Yes | Yes | Yes |
| `/api/v1/cart` | Yes | Yes | Yes |
| `/api/v1/sessions` | Yes | Yes | Yes |
| `/api/v1/alternatives` | Yes | Yes | Yes |
| `/api/v1/medicine` | Yes | Yes | Yes |
| `/api/v1/admin/*` | No | No | Yes |

### Error Response for Forbidden Access

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "This endpoint requires one of the following roles: admin. Your role: customer"
  }
}
```

---

## Response Envelope

All responses follow a consistent envelope format:

```json
{
  "success": true,
  "data": { ... },
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-02-10T12:00:00.000Z",
    "executionTimeMs": 150
  }
}
```

---

## Health

### GET /api/v1/health

Check server status, dependency connectivity, and active session count.

**Authentication:** None required

**Response:**

```json
{
  "success": true,
  "data": {
    "service": "PharmAssist API",
    "version": "1.0.0",
    "status": "healthy",
    "uptime": 52.41,
    "dependencies": {
      "qdrant": "connected",
      "gemini": "configured"
    },
    "sessions": {
      "active": 3
    }
  }
}
```

---

## Chat

### POST /api/v1/chat

Send a message to the PharmAssist AI agent. The agent can search medicines, check stock, create carts, and more via tool calling. Context from previous turns (summary, pinned facts, cart state, last search results) is automatically injected.

**Rate Limit:** Stricter than global limit (configured in `rateLimiter.ts`)

**Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `X-Conversation-Id` | No | Resume an existing conversation |

**Request Body:**

```json
{
  "message": "Find me some paracetamol",
  "conversationId": "uuid (optional, or use X-Conversation-Id header)",
  "platform": "web | ios | android | api (optional, default: api)"
}
```

- `message` (string, required): 1-4000 characters
- `conversationId` (uuid, optional): Omit to start a new conversation
- `platform` (enum, optional): Identifies the client platform

**Response:**

```json
{
  "success": true,
  "data": {
    "response": "Here are the medicines I found for paracetamol:\n\n1. **Paracetamol 500mg**\n   Barcode: 123456\n   Price: N350\n   Available: 49 units\n...",
    "conversationId": "32f68523-46bb-40a6-a1af-9ab3dbf84c29",
    "toolsUsed": ["search_medicines"],
    "sessionState": {
      "turnCount": 1,
      "cartItemCount": 0,
      "pinnedFactCount": 0,
      "hasSummary": false
    }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-02-10T12:17:02.405Z",
    "executionTimeMs": 5126
  }
}
```

**Response Headers:**

| Header | Description |
|--------|-------------|
| `X-Conversation-Id` | The conversation ID for subsequent requests |

**Session State Fields:**

| Field | Description |
|-------|-------------|
| `turnCount` | Number of user messages in this session |
| `cartItemCount` | Number of items in the session cart |
| `pinnedFactCount` | Number of auto-extracted key facts (e.g. user conditions) |
| `hasSummary` | Whether older messages have been summarized |

---

## Chat Streaming

### POST /api/v1/chat/stream

Same as `/api/v1/chat` but returns an SSE (Server-Sent Events) stream for real-time token-by-token responses.

**Request Body:** Same as `/api/v1/chat`

**Response:** SSE stream with the following event types:

| Event | Data | Description |
|-------|------|-------------|
| `context` | `{ summary, cartItemCount, pinnedFacts, turnCount }` | Server-side context state (emitted first if context exists) |
| `token` | `{ text: "partial..." }` | Incremental text token from the LLM |
| `tool_call` | `{ tool: "search_medicines", args: {...} }` | Tool invocation notification |
| `tool_result` | `{ tool: "search_medicines", result: "..." }` | Tool execution result (truncated to 500 chars) |
| `done` | `{ conversationId, toolsUsed, sessionState }` | Stream complete |
| `error` | `{ message: "error description" }` | Error occurred |

**Example SSE output:**

```
event: context
data: {"summary":null,"cartItemCount":0,"pinnedFacts":[],"turnCount":1}
id: 0

event: tool_call
data: {"tool":"search_medicines","args":{"query":"paracetamol"}}
id: 1

event: tool_result
data: {"tool":"search_medicines","result":"Found 5 medicine(s)..."}
id: 2

event: token
data: {"text":"Here are the medicines"}
id: 3

event: token
data: {"text":" I found for paracetamol:"}
id: 4

event: done
data: {"conversationId":"uuid","toolsUsed":["search_medicines"],"sessionState":{"turnCount":1,"cartItemCount":0,"pinnedFactCount":0,"hasSummary":false}}
id: 5
```

---

## Search

### GET /api/v1/search

Search for medicines by name, symptom, or condition using vector similarity search.

**Query Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `q` | Yes | Search query string |
| `limit` | No | Max results (1-50, default: 5) |

**Example:** `GET /api/v1/search?q=paracetamol&limit=5`

Note: In zsh, quote the URL to avoid glob expansion: `curl -s 'http://localhost:5050/api/v1/search?q=paracetamol'`

**Response:**

```json
{
  "success": true,
  "data": {
    "query": "paracetamol",
    "medicines": [
      {
        "id": "1769558114081",
        "product_name": "PARACETAMOL 500MG *96TABS",
        "price": 1200,
        "quantity": 340,
        "category_name": "PAIN RELIEF",
        "category_slug": "pain-relief",
        "barcode": "8901175044306",
        "score": 0.85
      }
    ],
    "totalResults": 5
  }
}
```

### POST /api/v1/search/batch

Search for multiple queries in a single request.

**Request Body:**

```json
{
  "queries": ["paracetamol", "ibuprofen", "amoxicillin"],
  "limit": 5
}
```

- `queries` (string[], required): 1-6 queries per batch
- `limit` (number, optional): Max results per query (1-20, default: 5)

---

## Stock

### GET /api/v1/stock/:barcode

Check real-time stock availability for a specific medicine by barcode.

**Example:** `GET /api/v1/stock/8901175044306`

**Response:**

```json
{
  "success": true,
  "data": {
    "barcode": "8901175044306",
    "product_name": "PARACETAMOL 500MG *96TABS",
    "price": 1200,
    "quantity": 340,
    "category_name": "PAIN RELIEF"
  }
}
```

---

## Cart

### POST /api/v1/cart

Create a shopping cart via the external cart API. This places an actual order.

**Request Body:**

```json
{
  "items": [
    { "barcode": "8901175044306", "qty": "2" },
    { "barcode": "5015525016028", "qty": "1" }
  ]
}
```

- `items` (array, required): 1-50 items, each with `barcode` (string) and `qty` (string or number)

**Response:**

```json
{
  "success": true,
  "data": {
    "cartId": "cart-uuid",
    "cartUrl": "https://checkout.example.com/cart/cart-uuid"
  }
}
```

---

## Sessions

Session management endpoints for listing, inspecting, restoring, and deleting conversation sessions.

### GET /api/v1/sessions

List all active sessions for the authenticated user.

**Response:**

```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "32f68523-46bb-40a6-a1af-9ab3dbf84c29",
        "turnCount": 3,
        "cartItemCount": 1,
        "pinnedFactCount": 1,
        "hasSummary": false,
        "createdAt": "2026-02-10T12:16:57.282Z",
        "lastActiveAt": "2026-02-10T12:19:06.735Z",
        "platform": "api"
      }
    ],
    "total": 1
  }
}
```

### GET /api/v1/sessions/:id

Get a full session snapshot. This includes the context summary, pinned facts, cart state, last search results, and recent messages. Designed for mobile session restore.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "32f68523-...",
    "contextSummary": "User asked: \"Find paracetamol\"\nUsed search_medicines...",
    "pinnedFacts": [
      { "key": "user_condition", "value": "malaria", "createdAt": 1770725840625 }
    ],
    "cart": [
      { "barcode": "8901175044306", "name": "PARACETAMOL 500MG", "price": 1200, "quantity": 2, "addedAt": 1770725934696 }
    ],
    "lastSearchResults": "Found 5 medicine(s) for \"fever\":\n...",
    "recentMessages": [
      { "role": "user", "parts": [{"text": "Find fever medicine"}], "timestamp": 1770725817282 },
      { "role": "model", "parts": [{"text": "Here are the medicines..."}], "toolCalls": [...], "timestamp": 1770725822405 }
    ],
    "turnCount": 2,
    "createdAt": 1770725817282,
    "lastActiveAt": 1770725840625,
    "metadata": {
      "userId": "anonymous",
      "platform": "api",
      "toolsUsed": ["search_medicines", "get_medicine_details"]
    }
  }
}
```

### POST /api/v1/sessions/restore

Restore a session from a client-cached snapshot. Used when a mobile app resumes from background. If the session is still active on the server, the existing session is returned without overwriting.

**Request Body:** A full `SessionSnapshot` object (same structure as the GET response data).

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "32f68523-...",
    "restored": true,
    "turnCount": 2,
    "cartItemCount": 1
  }
}
```

### DELETE /api/v1/sessions/:id

Delete a session and all its associated data.

**Response:**

```json
{
  "success": true,
  "data": { "id": "32f68523-...", "deleted": true }
}
```

---

## Session Cart

Server-side cart management that is synced with the AI agent's context. When items are added here, the agent becomes aware of the cart contents on the next chat turn.

### GET /api/v1/sessions/:id/cart

Get the current cart for a session.

**Response:**

```json
{
  "success": true,
  "data": {
    "items": [
      { "barcode": "8901175044306", "name": "PARACETAMOL 500MG", "price": 1200, "quantity": 2, "addedAt": 1770725934696 }
    ],
    "itemCount": 1,
    "total": 2400
  }
}
```

### POST /api/v1/sessions/:id/cart

Add an item to the session cart. If the barcode already exists, the quantity is incremented.

**Request Body:**

```json
{
  "barcode": "8901175044306",
  "name": "PARACETAMOL 500MG",
  "price": 1200,
  "quantity": 2
}
```

### PUT /api/v1/sessions/:id/cart

Replace the entire cart with a new set of items.

**Request Body:**

```json
{
  "items": [
    { "barcode": "8901175044306", "name": "PARACETAMOL 500MG", "price": 1200, "quantity": 2 }
  ]
}
```

### DELETE /api/v1/sessions/:id/cart

Clear all items from the session cart.

### DELETE /api/v1/sessions/:id/cart/:barcode

Remove a single item from the session cart by barcode.

---

## Alternatives

### GET /api/v1/alternatives/:medicineId

Find alternative medicines for a given medicine ID.

---

## Medicine Details

### GET /api/v1/medicine/:id

Get detailed information about a specific medicine by its ID.

---

---

## Bot Configuration

### GET /api/bot-config

Returns contact information (support and telehealth) and key links used by the bot for escalation and navigation.

**Authentication:** None required

**Response:**

```json
{
  "contact": {
    "support_whatsapp": "08054022662",
    "support_email": "customercare@medplusng.com",
    "support_call": "08054022662",
    "telehealth_whatsapp": "08187122408",
    "telehealth_email": "telehealth@medplusng.com",
    "telehealth_call": "08113590038"
  },
  "links": {
    "privacy_policy": "https://medplusnig.com/privacy-policy",
    "order_tracking": "https://medplusnig.com/track-order",
    "pharmacists": "https://medplusnig.com/telemedicine"
  }
}
```

**SDK:**

```typescript
const config = await client.getBotConfig();
console.log(config.contact.support_whatsapp);
console.log(config.links.order_tracking);
```

**Live Injection:** The `/api/bot-config` response is automatically fetched by `BotConfigService` (with 5-minute TTL cache and fallback to `FALLBACK_BOT_CONFIG`) and injected into the customer system prompt at runtime via `buildCustomerSystemPrompt(config)`. All contact numbers and links in bot escalation flows (RC-01, ES-01, SA-01, OT-04, etc.) come from this API — they are never hardcoded in the running prompt.

**Server env var:** Set `BOT_API_BASE_URL` (or `UNIFIED_PRODUCTS_BASE_URL`) to enable live fetch.
**Frontend env var:** Set `BOT_API_BASE_URL` (or `NEXT_PUBLIC_API_URL`) to enable live fetch in `frontend/src/app/api/chat/route.ts`.

---

## Store Locations

### GET /api/stores/locations

Returns all MedPlus store branches with addresses and coordinates.

**Authentication:** None required

**Response:**

```json
{
  "status": "success",
  "data": [
    {
      "sid": "STR001",
      "name": "Lagos Main Store",
      "store_address": "123 Herbert Macaulay Way, Yaba, Lagos",
      "state": "Lagos",
      "local_govt": "Yaba",
      "latitude": "6.5244",
      "longitude": "3.3792"
    }
  ]
}
```

**SDK:**

```typescript
const stores = await client.getStoreLocations();
// stores: StoreLocation[]
```

**Bot Tool:** `get_store_locations` — the chat agent calls this tool automatically when a customer asks where MedPlus stores are or wants to find stores by state. The `sid` field in the result is stored as an `[internal:sid=...]` tag for use with `search_store_products`.

---

## Store Products

### GET /api/products/stores/{sid}

Returns paginated product inventory for a specific store branch.

**Path Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `sid` | Yes | Store SID (from `/api/stores/locations`) |

**Query Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `search` | No | Filter by product name or barcode |
| `page` | No | Page number for pagination |

**Response:**

```json
{
  "status": "success",
  "data": {
    "store_sid": "STR001",
    "data": [
      {
        "id": 1234,
        "product_name": "Paracetamol 500mg Tablets",
        "barcode": "6001234567890",
        "price": "1500.00",
        "quantity": 150,
        "store_name": "Lagos Main Store",
        "store_sid": "STR001",
        "category_name": "Pain Relief",
        "category_slug": "pain-relief",
        "category_id": 5,
        "updated_at": "2026-02-16T10:30:00.000000Z"
      }
    ],
    "per_page": 50,
    "next_page_url": "...",
    "prev_page_url": null
  }
}
```

**SDK:**

```typescript
const result = await client.getProductsByStore('STR001', { search: 'paracetamol' });
// result.data: StoreProduct[]
```

**Bot Tool:** `search_store_products` — the chat agent calls this tool when a customer asks whether a specific product is available at a particular store. The agent first calls `get_store_locations` to find the store SID, then calls `search_store_products` with that SID and the product query.

### GET /api/products/stores/{sid}/{barcode}

Returns a single product for a specific store and barcode.

**Error Response (404):**

```json
{ "message": "The requested resource product information was not found" }
```

**SDK:**

```typescript
const product = await client.getProductByBarcode('STR001', '6001234567890');
// product: StoreProduct
```

---

## Context Engineering

The API implements several mechanisms to prevent context decay in long conversations:

### How It Works

1. **Context Windowing** -- Only the most recent 20 messages are sent to the LLM as chat history. Older messages are not discarded but summarized.

2. **Extractive Summarization** -- When the conversation exceeds 30 messages, older messages are compressed into a rolling summary. This is done in-process (no LLM call) by extracting user intents and tool outcomes.

3. **Pinned Facts** -- Key facts are auto-extracted from user messages (e.g., "I have malaria" pins `user_condition: malaria`). These survive context windowing and are always visible to the agent.

4. **Cart State Injection** -- The session cart is injected into the LLM context on every turn. The agent can answer "What's in my cart?" without calling any tool.

5. **Last Search Results** -- The most recent search results are cached and injected into context, allowing the agent to resolve references like "the first one" or "add that to cart".

### Context Block Format

On each turn, the agent prepends a structured context block to the user message:

```
[CONTEXT -- do not repeat this to the user, use it to inform your responses]
[CONVERSATION SUMMARY]
User asked: "Find paracetamol"
Used search_medicines with {"query":"paracetamol"}
Found 5 medicine(s) in a search.

[KEY FACTS]
- user_condition: malaria

[CURRENT CART -- 1 item(s), total: N2400.00]
- PARACETAMOL 500MG (barcode: 8901175044306, qty: 2, price: N1200)

[LAST SEARCH RESULTS]
1. **PARACETAMOL 500MG** ...
[END CONTEXT]
```

### Session Lifecycle

- **TTL:** 1 hour of inactivity (configurable)
- **Cleanup:** Expired sessions are garbage-collected every 60 seconds
- **Snapshots:** Sessions can be serialized to JSON for client-side caching and later restored via `POST /api/v1/sessions/restore`

---

---

## Bot Compliance & Safety Rules

The customer-role system prompt enforces the following hard rules. These cannot be overridden at the application layer.

### Prescription Gate (RC-01)
Any request to purchase antibiotics, controlled substances, or other prescription-only drugs without mentioning a prescription triggers a hard block. The bot responds with a mandatory "PRESCRIPTION REQUIRED" message and surfaces telehealth contact options. This rule fires even on misspelled drug names (e.g. `amoxcillin`).

### Pediatric Dosage Block (RC-02)
The bot will never provide dosage information for children. It redirects to a pharmacist via WhatsApp 08187122408.

### Drug Interaction Warning (RC-04)
Questions about mixing medications or taking drugs with alcohol result in a brief disclaimer only, followed by a mandatory "Speak to a Pharmacist" button. The customer must acknowledge before the purchase flow continues.

### Pregnancy Disclaimer (RC-03)
Any query mentioning pregnancy appends a mandatory consultation prompt for a pharmacist or doctor.

### Pediatric Product Filter (PD-08)
Queries for children (e.g. "for 5 year old") trigger a filter that excludes adult NSAIDs and Aspirin. Only pediatric-safe products are shown.

### Human Handoff (ES-01)
Phrases like "speak to a human", "real person", or "connect me" immediately surface the full agent contact panel: WhatsApp 08054022662 | Call 08054022662 | Email customercare@medplusng.com.

### Return Policy (OT-04)
The bot states medications are **non-returnable once dispensed**, and links to the full policy page.

### Session Timeout (Frontend)
The frontend chat interface has a 15-minute inactivity timeout. After timeout, the user is shown a reconnect message with support contact details.

### Escalation Buttons (Frontend)
Any bot response containing `WhatsApp:`, `Call:`, or `Email:` patterns automatically renders clickable action buttons (green WhatsApp button, blue Call button, grey Email button) in the chat UI.

---

## SDK Integration

The project includes a client SDK at `src/api/sdk/` for frontend and mobile integration.

### Platform-Agnostic Client

```typescript
import { PharmAssistClient } from './src/api/sdk';

const client = new PharmAssistClient({
  baseUrl: 'http://localhost:5050',
  apiKey: 'your-api-key',
  platform: 'web',
});

// Send a message
const result = await client.sendMessage('Find paracetamol');
console.log(result.response);
console.log(result.conversationId);

// Search directly (bypasses LLM)
const search = await client.searchMedicines('ibuprofen');

// Session management
const snapshot = await client.getSession(result.conversationId);
await client.restoreSession(snapshot.data);
```

### React Hook (Web and React Native)

```tsx
import { usePharmAssist } from './src/api/sdk';

function ChatScreen() {
  const {
    messages,
    sendMessage,
    isLoading,
    cart,
    addToCart,
    checkout,
    extractProducts,
    startNewConversation,
  } = usePharmAssist({
    baseUrl: 'http://localhost:5050',
    apiKey: 'your-api-key',
    platform: 'ios',
    streaming: true,
    // React Native: pass AsyncStorage for session persistence
    storage: AsyncStorage,
  });

  // Messages are managed automatically
  // Cart syncs with server-side session context
  // Session auto-restores from storage on mount
}
```

### New SDK Methods (v1.1)

```typescript
// Bot config & contact info
const config = await client.getBotConfig();
// config.contact.support_whatsapp, config.links.order_tracking, etc.

// Store locations
const stores = await client.getStoreLocations();
// stores: StoreLocation[] — each has sid, name, store_address, state, lat/lng

// Products by store (with optional search + pagination)
const result = await client.getProductsByStore('STR001', { search: 'paracetamol', page: 1 });
// result.data: StoreProduct[], result.next_page_url

// Single product by store + barcode
const product = await client.getProductByBarcode('STR001', '6001234567890');
// product: StoreProduct
```

### New SDK Types

```typescript
// BotConfig — returned by getBotConfig()
interface BotConfig {
  contact: {
    support_whatsapp: string;
    support_email: string;
    support_call: string;
    telehealth_whatsapp: string;
    telehealth_email: string;
    telehealth_call: string;
  };
  links: {
    privacy_policy: string;
    order_tracking: string;
    pharmacists: string;
  };
}

// StoreLocation — returned by getStoreLocations()
interface StoreLocation {
  sid: string;
  name: string;
  store_address: string;
  state: string;
  local_govt: string;
  latitude: string;
  longitude: string;
}

// StoreProduct — returned by getProductsByStore() / getProductByBarcode()
interface StoreProduct {
  id: number;
  product_name: string;
  barcode: string;
  price: string;
  quantity: number;
  store_name: string;
  store_sid: string;
  category_name: string;
  category_slug: string;
  updated_at: string;
}
```

### Key SDK Features

- **Auto session persistence:** Pass a `storage` adapter (e.g., AsyncStorage) and sessions are cached/restored automatically
- **Streaming support:** Set `streaming: true` for token-by-token responses
- **Cart sync:** Local cart state is synced with the server session, so the AI agent is always aware of cart contents
- **Product extraction:** `extractProducts(content)` parses barcodes, prices, and names from assistant responses
- **Connection monitoring:** `onConnectionChange` callback fires when connectivity changes
- **Bot config access:** `getBotConfig()` fetches live contact info and links for escalation flows
- **Store inventory:** `getStoreLocations()` + `getProductsByStore()` enable location-specific stock queries

---

## Error Handling

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body or parameters failed validation |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONVERSATION_NOT_FOUND` | 404 | Session expired or does not exist |
| `RATE_LIMITED` | 429 | Too many requests |
| `LLM_ERROR` | 500 | Gemini API error or misconfiguration |
| `TOOL_ERROR` | 500 | Tool execution failure |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Error Response Example

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid chat request",
    "details": {
      "issues": [
        { "code": "too_small", "path": ["message"], "message": "Message cannot be empty" }
      ]
    }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-02-10T12:00:00.000Z"
  }
}
```

---

## Running the Server

### Development (Node.js)

```bash
AUTH_ENABLED=false API_PORT=5050 pnpm tsx src/api/index.ts
```

### Development (Bun)

```bash
AUTH_ENABLED=false API_PORT=5050 bun src/api/index.ts
```

### Docker

```bash
docker compose up api
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `5000` | Server port |
| `API_HOST` | `0.0.0.0` | Server bind address |
| `AUTH_ENABLED` | `true` | Enable/disable authentication |
| `API_KEYS` | -- | Comma-separated valid API keys |
| `JWT_SECRET` | -- | Secret for JWT verification |
| `GEMINI_API_KEY` | -- | Google Gemini API key |
| `GOOGLE_API_KEY` | -- | Google API key (alternative to GEMINI_API_KEY) |
| `GEMINI_CHAT_MODEL` | `gemini-2.0-flash` | Gemini model for chat |
| `EMBEDDING_PROVIDER` | `google` | Embedding provider (`google`, `anthropic`, `none`) |
| `GOOGLE_EMBEDDING_MODEL` | `gemini-embedding-001` | Embedding model name |
| `EMBEDDING_VECTOR_SIZE` | `768` | Embedding dimensions (must match Qdrant collection) |
| `QDRANT_HOST` | -- | Qdrant server URL |
| `QDRANT_KEY` | -- | Qdrant API key |
| `UNIFIED_PRODUCTS_BASE_URL` | -- | External products API base URL |
| `CART_BASE_URL` | -- | External cart API base URL |
| `BEARER_TOKEN` | -- | Bearer token for external APIs |
