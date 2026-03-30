# PharmAssist Feature Status & External API Dependencies

**Last Updated:** 2026-03-30

This document tracks every feature from the product requirements, its current implementation status, and which external APIs are needed from the backend/infrastructure team to unblock remaining work.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| DONE | Fully implemented and tested |
| PARTIAL | Partially built; needs external API or additional work |
| STUB | Code exists but uses in-memory placeholder, not a real backend |
| NOT BUILT | No implementation exists yet |

---

## 1. Customer Features

### Medicines & Products

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1.1 | Search for medicines and health products | **DONE** | Vector search via Qdrant + `gemini-embedding-001`. Tool: `search_medicines`. Route: `GET /api/v1/search`. |
| 1.2 | Check product availability and pricing | **DONE** | Calls `MEDPLUS_API_URL/products/unified/:barcode`. Tool: `check_stock`. Route: `GET /api/v1/stock/:barcode`. |
| 1.3 | View product information and usage guidance | **PARTIAL** | `get_medicine_details` returns basic fields (name, price, qty, category). **Missing:** dosage, usage instructions, side effects, manufacturer, expiry. These fields are not in the Qdrant payload or the products API response. |
| 1.4 | Upload prescriptions (image or PDF) | **NOT BUILT** | Needs: file upload endpoint, cloud storage (S3/GCS), OCR/vision model integration (e.g., Gemini Vision for prescription parsing). |
| 1.5 | Refill previous prescriptions | **NOT BUILT** | Needs: prescription history API, customer-prescription linking, refill workflow. |
| 1.6 | Use customer location for nearby store availability | **PARTIAL** | `GET /api/stores/locations` is now integrated in the SDK (`getStoreLocations()`). `getProductsByStore(sid, { search })` enables per-store product search. Bot escalates location queries to store contacts via WhatsApp/Call. **Missing:** geolocation matching (nearest store by lat/lng). |
| 1.7 | Confirm if product is available in a specific store | **PARTIAL** | `GET /api/products/stores/{sid}?search=...` and `GET /api/products/stores/{sid}/{barcode}` are now in SDK. Bot now escalates per-store availability queries to direct store contacts (WhatsApp 08054022662). |

### Orders & Payments

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1.8 | Place orders for prescription and OTC medicines | **DONE** | `create_cart` posts to `CART_BASE_URL/bot/cart-actions`. Tool: `create_cart`. Route: `POST /api/v1/cart`. |
| 1.9 | Choose delivery or pickup options | **NOT BUILT** | Needs: delivery/pickup options API, address management. |
| 1.10 | Make payments (card, transfer, wallet) | **NOT BUILT** | Needs: payment gateway integration (Paystack/Flutterwave), wallet API. |
| 1.11 | Track order and delivery status | **NOT BUILT** | Needs: order tracking API, delivery status webhook/polling endpoint. |
| 1.12 | Receive order confirmations and receipts | **NOT BUILT** | Needs: notification service (email/SMS/push), receipt generation API. |

### Health Support

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1.13 | Ask basic health-related questions (non-diagnostic) | **DONE** | Gemini handles general health Q&A. RBAC system prompt constrains customer role to non-diagnostic answers only. Compliance rules now enforce prescription gates (RC-01), pediatric dosage blocks (RC-02), drug interaction disclaimers (RC-04), and pregnancy warnings (RC-03). |

### Support & Communication

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1.14 | Chat with a pharmacist (human handoff) | **PARTIAL** | Bot now surfaces telehealth contact panel (WhatsApp 08187122408 / Call 08113590038 / Email / pharmacist page) on `ES-01` trigger phrases and compliance blocks (RC-01, RC-02, RC-04). Frontend renders these as clickable action buttons. **Missing:** live routing API and pharmacist availability status. |
| 1.15 | Raise complaints or support tickets | **NOT BUILT** | Needs: ticketing system API (e.g., Zendesk, Freshdesk, or custom). |
| 1.16 | Receive notifications and alerts | **NOT BUILT** | Needs: push notification service (FCM/APNs), notification preferences API. |

---

## 2. Admin / Pharmacist Features

### Medicines & Products (Admin View)

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.1 | Search + check availability (same as customer) | **DONE** | Same tools, but pharmacist/admin roles get richer system prompt for clinical context. |
| 2.2 | Check stock across all stores | **NOT BUILT** | Needs: multi-store inventory API that returns per-store stock levels. |
| 2.3 | Upload and review prescriptions | **NOT BUILT** | Same as 1.4 + admin review/approval workflow. |
| 2.4 | Review and refill previous prescriptions | **NOT BUILT** | Same as 1.5 + pharmacist approval step. |
| 2.5 | Customer location-based store lookup | **NOT BUILT** | Same as 1.6. |

### Analytics & Reporting

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.6 | View sales and usage dashboards | **NOT BUILT** | Needs: analytics/reporting API with aggregated sales data. |
| 2.7 | Monitor usage and conversion rates | **NOT BUILT** | Needs: event tracking system, conversion funnel API. |
| 2.8 | Track medication demand trends | **NOT BUILT** | Needs: time-series data API for search/purchase trends. |

### System Management

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.9 | Configure workflows and responses | **NOT BUILT** | Needs: admin config API for managing chatbot behavior. |
| 2.10 | Manage FAQs and automated replies | **NOT BUILT** | Needs: content management API for FAQ CRUD. |
| 2.11 | Route chats to pharmacists or support staff | **NOT BUILT** | Same as 1.14 (human handoff). |
| 2.12 | Monitor conversations and performance | **PARTIAL** | Session listing exists (`GET /api/v1/sessions`), but only shows the current user's sessions. **Missing:** cross-user session monitoring API for admins. |

### Prescription Management

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.13 | Review uploaded prescriptions | **NOT BUILT** | Needs: prescription storage + review queue API. |
| 2.14 | Validate prescription authenticity | **NOT BUILT** | Needs: prescription validation service (OCR + regulatory DB). |
| 2.15 | Approve, modify, or reject prescriptions | **NOT BUILT** | Needs: prescription workflow API with status transitions. |
| 2.16 | Request clarification from customers | **NOT BUILT** | Needs: in-app messaging/notification between pharmacist and customer. |

### Clinical Oversight

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.17 | Provide medication counseling via chat | **PARTIAL** | Pharmacist role gets a clinical system prompt. Gemini can discuss drug info. **Missing:** structured drug interaction database for verified data. |
| 2.18 | Answer drug interaction and dosage questions | **PARTIAL** | Gemini can answer from training data. **Missing:** verified drug interaction API (e.g., DrugBank, RxNorm, or internal DB). |
| 2.19 | Flag contraindications and safety concerns | **PARTIAL** | Gemini can flag from training data. **Missing:** structured contraindication database. |
| 2.20 | Recommend OTC alternatives | **DONE** | `find_alternatives` tool exists. Pharmacist/admin roles have access. |

### Order Fulfilment Support

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.21 | Authorize dispensing of prescription medicines | **NOT BUILT** | Needs: dispensing authorization API with pharmacist approval workflow. |
| 2.22 | Confirm substitutions (with customer consent) | **NOT BUILT** | Needs: substitution approval workflow + customer notification. |
| 2.23 | Update order status after clinical review | **NOT BUILT** | Needs: order status update API. |

### Customer Communication (Pharmacist)

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.24 | Chat directly with customers | **NOT BUILT** | Same as 1.14 (human handoff / live chat). |
| 2.25 | Send medication instructions and warnings | **NOT BUILT** | Needs: messaging API + medication instruction templates. |
| 2.26 | Follow up on adverse reactions or queries | **NOT BUILT** | Needs: follow-up scheduling + notification system. |

### Compliance & Records

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.27 | Maintain digital dispensing records | **NOT BUILT** | Needs: dispensing records API with audit trail. |
| 2.28 | Document pharmacist interventions | **NOT BUILT** | Needs: intervention logging API. |
| 2.29 | Support audits and regulatory reviews | **NOT BUILT** | Needs: audit log export API, regulatory compliance reporting. |

---

## 3. What We Have Built (Infrastructure)

These are cross-cutting capabilities that support the features above:

| Component | Status | Details |
|-----------|--------|---------|
| Unified API Server (Hono.js) | **DONE** | Supports Bun + Node.js. All routes mounted. |
| Authentication (JWT + API Key) | **DONE** | `authMiddleware` with JWT verification and API key support. |
| Role-Based Access Control | **DONE** | 3 roles (customer, pharmacist, admin). Tool scoping, system prompt scoping, route guards. |
| Context Engineering | **DONE** | Context windowing (20 msgs), extractive summarization, pinned facts, cart state injection, last search caching. |
| Session Management | **DONE** | In-memory store with TTL, snapshot/restore, CRUD API. |
| Session Cart (server-side) | **DONE** | Per-session cart synced with LLM context. |
| Vector Search (Qdrant) | **DONE** | `gemini-embedding-001` with 768 dimensions. Product data indexed. |
| Streaming Chat (SSE) | **DONE** | Token-by-token streaming with tool call events. |
| Frontend/Mobile SDK | **DONE** | `PharmAssistClient` + `usePharmAssist` React hook. New methods: `getBotConfig()`, `getStoreLocations()`, `getProductsByStore()`, `getProductByBarcode()`. New types exported: `BotConfig`, `StoreLocation`, `StoreProduct`. |
| Rate Limiting | **DONE** | Global + per-route rate limiters. |
| Error Handling | **DONE** | Centralized error handler with typed error codes. |
| API Documentation | **DONE** | `docs/API.md` with full endpoint reference. Updated 2026-03-30 with Bot Config, Store Locations, Store Products, Bot Compliance section, and new SDK methods. |
| Bot Config API (`/api/bot-config`) | **DONE** | Returns live contact info and links. Integrated in SDK via `getBotConfig()`. Used by system prompt for all escalation flows. |
| Session Timeout (Frontend) | **DONE** | 15-minute inactivity detection in `Chat.tsx`. Shows reconnect message with support contacts. |
| Escalation Button Rendering (Frontend) | **DONE** | `Chat.tsx` now auto-renders WhatsApp / Call / Email action buttons whenever bot response contains contact patterns. URL labels are context-aware (Track Order, Speak to Pharmacist, etc.). |
| Bot Compliance Rules (Customer Role) | **DONE** | Hard rules enforced in system prompt: RC-01 prescription gate, RC-02 pediatric block, RC-03 pregnancy warning, RC-04 drug interaction disclaimer, PD-08 pediatric product filter, ES-01 human handoff, OT-04 non-returnable meds policy, SA/PP/CA/OT escalation flows. |

---

## 4. External APIs Needed From Backend Team

This is the prioritized list of APIs we need the backend/infrastructure team to provide. Without these, the corresponding features cannot be completed.

### Priority 1: Critical (Blocks Core Customer Experience)

| # | API Needed | Purpose | Blocks Features | Expected Contract |
|---|-----------|---------|-----------------|-------------------|
| **A1** | **Multi-Store Inventory API** | Check stock per store, not just global | 1.6, 1.7, 2.2, 2.5 | `GET /api/v1/stores/:storeId/stock/:barcode` or `GET /api/v1/stock/:barcode?storeId=...` returning `{ storeId, storeName, quantity, price }` |
| **A2** | **Store Locations API** | List stores with lat/lng for geolocation matching | 1.6, 2.5 | `GET /api/v1/stores?lat=...&lng=...&radius=...` returning `[{ storeId, name, address, lat, lng, distance }]` |
| **A3** | **Product Details API (Extended)** | Full product info: dosage, usage, side effects, manufacturer, expiry | 1.3, 2.17, 2.18, 2.19 | `GET /api/v1/products/:barcode/details` returning `{ dosage, usage_instructions, side_effects, manufacturer, expiry_date, contraindications, drug_class }` |
| **A4** | **Order Tracking API** | Track order status and delivery | 1.11, 2.23 | `GET /api/v1/orders/:orderId/status` returning `{ orderId, status, estimatedDelivery, trackingUrl, items }` |
| **A5** | **Delivery/Pickup Options API** | Available delivery methods and pickup locations for an order | 1.9 | `GET /api/v1/delivery-options?storeId=...&address=...` returning `[{ type: "delivery"|"pickup", estimatedTime, cost }]` |

### Priority 2: High (Blocks Key Workflows)

| # | API Needed | Purpose | Blocks Features | Expected Contract |
|---|-----------|---------|-----------------|-------------------|
| **B1** | **Payment Gateway Integration** | Process payments (card, transfer, wallet) | 1.10 | `POST /api/v1/payments/initiate` with `{ orderId, amount, method, callbackUrl }` returning `{ paymentUrl, reference }` |
| **B2** | **Prescription Upload & Storage API** | Upload, store, and retrieve prescription images/PDFs | 1.4, 1.5, 2.3, 2.4, 2.13 | `POST /api/v1/prescriptions/upload` (multipart), `GET /api/v1/prescriptions/:id`, `GET /api/v1/customers/:id/prescriptions` |
| **B3** | **Prescription Workflow API** | Review, approve, reject, request clarification | 2.14, 2.15, 2.16 | `PATCH /api/v1/prescriptions/:id/status` with `{ status: "approved"|"rejected"|"clarification_needed", notes }` |
| **B4** | **Notification Service API** | Send push notifications, SMS, email | 1.12, 1.16, 2.16, 2.25, 2.26 | `POST /api/v1/notifications/send` with `{ userId, channel: "push"|"sms"|"email", template, data }` |
| **B5** | **Drug Interaction Database API** | Verified drug interactions, contraindications, dosage data | 2.17, 2.18, 2.19 | `GET /api/v1/drugs/:id/interactions?with=:otherId` returning `{ severity, description, recommendation }` |

### Priority 3: Medium (Blocks Admin/Operational Features)

| # | API Needed | Purpose | Blocks Features | Expected Contract |
|---|-----------|---------|-----------------|-------------------|
| **C1** | **Analytics/Reporting API** | Sales dashboards, usage metrics, demand trends | 2.6, 2.7, 2.8 | `GET /api/v1/analytics/sales?from=...&to=...`, `GET /api/v1/analytics/search-trends`, `GET /api/v1/analytics/conversion` |
| **C2** | **Live Chat Routing API** | Route conversations to available pharmacists | 1.14, 2.11, 2.24 | `POST /api/v1/chat/handoff` with `{ conversationId, reason }`, `GET /api/v1/pharmacists/available` |
| **C3** | **Ticketing/Support API** | Create and manage support tickets | 1.15 | `POST /api/v1/tickets` with `{ customerId, subject, description, priority }`, `GET /api/v1/tickets/:id` |
| **C4** | **Dispensing Records API** | Digital dispensing log with audit trail | 2.21, 2.27, 2.28, 2.29 | `POST /api/v1/dispensing/log` with `{ prescriptionId, pharmacistId, items, notes }`, `GET /api/v1/dispensing/audit?from=...&to=...` |
| **C5** | **Admin Configuration API** | Manage chatbot workflows, FAQs, automated replies | 2.9, 2.10 | `GET/PUT /api/v1/admin/config`, `CRUD /api/v1/admin/faqs` |
| **C6** | **Order Status Update API** | Allow pharmacists to update order status after review | 2.22, 2.23 | `PATCH /api/v1/orders/:orderId/status` with `{ status, pharmacistId, notes }` |

---

## 5. APIs Already Integrated (Working)

These external APIs are already connected and functional:

| API | Base URL (env var) | What It Does | Used By |
|-----|-------------------|--------------|---------|
| **Unified Products API** | `UNIFIED_PRODUCTS_BASE_URL` | Paginated product listing, ingestion into Qdrant | `unifiedProductsService.ts`, `ingestorService.ts` |
| **Stock Check API** | `MEDPLUS_API_URL` | Single-product stock lookup by barcode | `checkStockService.ts` |
| **Cart Actions API** | `CART_BASE_URL` | Create shopping cart with items | `createCartService.ts` |
| **Qdrant Vector DB** | `QDRANT_HOST` | Vector similarity search for medicines | `qdrantService.ts` |
| **Google Gemini API** | `GEMINI_API_KEY` | LLM chat + tool calling | `pharmacyAgent.ts` |
| **Google Embedding API** | `GOOGLE_API_KEY` | `gemini-embedding-001` for vector embeddings | `embeddingService.ts` |

---

## 6. Services That Are Currently Stubbed (In-Memory Only)

These services exist in code but do NOT call any real backend. They store data in memory and lose it on restart:

| Service | File | What It Does Now | What It Needs |
|---------|------|-----------------|---------------|
| **LogPurchaseService** | `src/services/logPurchaseService.ts` | Stores purchase logs in an in-memory array | Real purchase logging API or database |
| **FindAlternativesService** | `src/services/logPurchaseService.ts` | Returns a stub log ID, no actual alternatives logic | Real alternatives lookup API (possibly semantic search by category/drug class) |
| **NotifyAdminService** | `src/services/notifyAdminService.ts` | Logs to console, returns a stub notification ID | Real notification/alerting API (Slack, email, push, or internal dashboard) |

---

## 7. Summary Scorecard

| Category | Total Features | Done | Partial | Stub | Not Built |
|----------|---------------|------|---------|------|-----------|
| **Customer: Medicines & Products** | 7 | 2 | 4 | 0 | 1 |
| **Customer: Orders & Payments** | 5 | 1 | 0 | 0 | 4 |
| **Customer: Health Support** | 1 | 1 | 0 | 0 | 0 |
| **Customer: Support & Communication** | 3 | 0 | 1 | 0 | 2 |
| **Admin: Medicines & Products** | 5 | 1 | 0 | 0 | 4 |
| **Admin: Analytics & Reporting** | 3 | 0 | 0 | 0 | 3 |
| **Admin: System Management** | 4 | 0 | 1 | 0 | 3 |
| **Admin: Prescription Management** | 4 | 0 | 0 | 0 | 4 |
| **Admin: Clinical Oversight** | 4 | 1 | 2 | 0 | 1 |
| **Admin: Order Fulfilment** | 3 | 0 | 0 | 0 | 3 |
| **Admin: Customer Communication** | 3 | 0 | 0 | 0 | 3 |
| **Admin: Compliance & Records** | 3 | 0 | 0 | 0 | 3 |
| **TOTAL** | **45** | **6** | **8** | **0** | **31** |

**Bottom line (updated 2026-03-30):** 6 features are fully done, 8 are partially done (up from 5 — improved by store location/product SDK integration, human handoff escalation UI, and bot compliance rules), and 31 remain blocked waiting for external APIs listed in Section 4.
