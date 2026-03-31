import { NextRequest, NextResponse } from 'next/server';
import { 
  GoogleGenerativeAI, 
  SchemaType, 
  FunctionDeclaration, 
  Schema
} from '@google/generative-ai';

const MCP_URL = process.env.MCP_URL || 'http://localhost:4000/mcp';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PRODUCTS_API_BASE_URL = (process.env.UNIFIED_PRODUCTS_BASE_URL || '').replace(/\/$/, '');

// ── Bot config (fetched live, falls back to hardcoded defaults) ─────────────

interface BotConfig {
  contact: {
    support_whatsapp: string;
    support_call: string;
    support_email: string;
    telehealth_whatsapp: string;
    telehealth_call: string;
    telehealth_email: string;
  };
  links: {
    privacy_policy: string;
    order_tracking: string;
    pharmacists: string;
  };
}

const FALLBACK_CONFIG: BotConfig = {
  contact: {
    support_whatsapp: '08054022662',
    support_call: '08054022662',
    support_email: 'customercare@medplusng.com',
    telehealth_whatsapp: '08187122408',
    telehealth_call: '08113590038',
    telehealth_email: 'telehealth@medplusng.com',
  },
  links: {
    privacy_policy: 'https://medplusnig.com/privacy-policy',
    order_tracking: 'https://medplusnig.com/track-order',
    pharmacists: 'https://medplusnig.com/telemedicine',
  },
};

let _cachedConfig: BotConfig | null = null;
let _cacheExpiresAt = 0;

async function getBotConfig(): Promise<BotConfig> {
  if (_cachedConfig && Date.now() < _cacheExpiresAt) return _cachedConfig;
  if (!PRODUCTS_API_BASE_URL) return FALLBACK_CONFIG;
  try {
    const res = await fetch(`${PRODUCTS_API_BASE_URL}/bot-config`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { success?: boolean; data?: BotConfig } | BotConfig;
    const data = (json as { data?: BotConfig }).data ?? (json as BotConfig);
    _cachedConfig = data;
    _cacheExpiresAt = Date.now() + 5 * 60 * 1000;
    return data;
  } catch {
    return FALLBACK_CONFIG;
  }
}

interface MCPResponse {
  jsonrpc: string;
  id?: number;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    tools?: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }>;
  };
  error?: { code: number; message: string };
}

// MCP Client class that handles connection per request
class MCPClient {
  private sessionId: string | null = null;

  private async parseSSEResponse(response: Response): Promise<MCPResponse> {
    const text = await response.text();
    
    if (text.startsWith('{')) {
      return JSON.parse(text);
    }
    
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.substring(6);
        if (jsonStr.trim()) {
          return JSON.parse(jsonStr);
        }
      }
    }
    
    throw new Error('No valid JSON found in SSE response');
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<MCPResponse> {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(this.sessionId && { 'mcp-session-id': this.sessionId })
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`MCP request failed: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 200)}`);
    }

    const sessionHeader = response.headers.get('mcp-session-id');
    if (sessionHeader) {
      this.sessionId = sessionHeader;
    }

    return this.parseSSEResponse(response);
  }

  async initialize(): Promise<boolean> {
    try {
      const initResponse = await this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { sampling: {} },
        clientInfo: { name: 'PharmAssist Chat API', version: '1.0.0' }
      });

      if (initResponse.result) {
        await this.request('notifications/initialized', {});
        return true;
      }
      return false;
    } catch (error) {
      console.error('MCP initialization failed:', error);
      return false;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      const response = await this.request('tools/call', { name, arguments: args });
      
      if (response.error) {
        return `Error: ${response.error.message}`;
      }
      
      if (response.result?.content) {
        return response.result.content.map(c => c.text || JSON.stringify(c)).join('\n');
      }
      
      return 'No response from tool';
    } catch (error) {
      console.error(`Tool call failed for ${name}:`, error);
      return `Error calling tool: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

// Define tools for Gemini function calling
const pharmacyTools: FunctionDeclaration[] = [
  {
    name: 'search_medicines',
    description: 'Search for medicines by name, symptom, or condition. Use this to find medicines for treating symptoms like fever, headache, malaria, cough, cold, pain, etc.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'The medicine name, symptom, or condition to search for (e.g., "paracetamol", "fever", "malaria")'
        } as Schema
      },
      required: ['query']
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'check_stock',
    description: 'Check the stock availability and price of a specific medicine by its barcode. Use this after selecting a medicine from search results to verify availability before ordering.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_barcode: {
          type: SchemaType.STRING,
          description: 'The barcode of the medicine to check stock for'
        } as Schema
      },
      required: ['medicine_barcode']
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'find_alternatives',
    description: 'Find alternative medicines for a specific medicine by its ID. Use this when a medicine is out of stock or user wants options.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine to find alternatives for'
        } as Schema
      },
      required: ['medicine_id']
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'get_medicine_details',
    description: 'Get detailed information about a specific medicine including dosage, side effects, and usage instructions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine to get details for'
        } as Schema
      },
      required: ['medicine_id']
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'create_cart',
    description: 'Create a shopping cart with medicine items. Each item requires a barcode and quantity. Accepts either a single item object or an array of items.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              barcode: {
                type: SchemaType.STRING,
                description: 'The barcode of the medicine'
              } as Schema,
              qty: {
                type: SchemaType.STRING,
                description: 'The quantity of the medicine (string or number accepted)'
              } as Schema
            },
            required: ['barcode', 'qty']
          } as Schema
        } as Schema
      },
      required: ['items']
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'get_store_locations',
    description: 'Get MedPlus store locations. Use this when a customer asks where stores are, or when checking product availability in a specific area. After getting locations, if the customer asked about a product, IMMEDIATELY call search_store_products — do NOT ask the customer to choose a store.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        location: {
          type: SchemaType.STRING,
          description: 'Optional: filter by state, LGA, area, or store name (e.g., "Yaba", "Lagos", "Ikeja"). Leave empty to get all stores.'
        } as Schema
      },
      required: []
    } as Schema
  } as FunctionDeclaration,
  {
    name: 'search_store_products',
    description: 'Search for products available at a specific MedPlus store by its store SID. Use this to check if a product is in stock at a particular branch.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        store_sid: {
          type: SchemaType.STRING,
          description: 'The store SID from get_store_locations results (from [internal:sid=...] tag)'
        } as Schema,
        search: {
          type: SchemaType.STRING,
          description: 'Optional: product name to search for within the store'
        } as Schema,
        page: {
          type: SchemaType.NUMBER,
          description: 'Optional: page number (default 1)'
        } as Schema
      },
      required: ['store_sid']
    } as Schema
  } as FunctionDeclaration
];

// Map Gemini function names to MCP tool names
const toolMapping: Record<string, string> = {
  'search_medicines': 'SEARCH_MEDS',
  'check_stock': 'CHECK_STOCK',
  'find_alternatives': 'FIND_ALTERNATIVES',
  'get_medicine_details': 'GET_MEDICINE_DETAILS',
  'create_cart': 'CREATE_CART'
};

function mapArguments(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (toolName) {
    case 'search_medicines':
      return { name: args.query };
    case 'create_cart':
      return { items: args.items };
    default:
      return args;
  }
}

async function callStoreApi(toolName: string, args: Record<string, unknown>): Promise<string> {
  if (!PRODUCTS_API_BASE_URL) {
    return 'Store locations service is temporarily unavailable. Please contact us: WhatsApp 08054022662 | Call 08054022662';
  }

  try {
    if (toolName === 'get_store_locations') {
      const res = await fetch(`${PRODUCTS_API_BASE_URL}/stores/locations`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { success?: boolean; data: Array<{ sid: string | number; name: string; store_address: string; state: string; local_govt: string }> };
      const locations = body.data ?? [];
      if (locations.length === 0) return 'No store locations found.';

      const filter = args.location ? String(args.location).toLowerCase() : '';
      const filtered = filter
        ? locations.filter((s) =>
            (s.state?.toLowerCase() ?? '').includes(filter) ||
            (s.local_govt?.toLowerCase() ?? '').includes(filter) ||
            (s.name?.toLowerCase() ?? '').includes(filter) ||
            (s.store_address?.toLowerCase() ?? '').includes(filter),
          )
        : locations;

      if (filtered.length === 0) {
        return `No stores found matching "${args.location}". Available states: ${[...new Set(locations.map((s: { state: string }) => s.state))].join(', ')}`;
      }

      let out = `Found ${filtered.length} MedPlus store(s)${filter ? ` matching "${args.location}"` : ''}:\n\n`;
      filtered.forEach((store: { sid: string | number; name: string; store_address: string; state: string; local_govt: string }, i: number) => {
        out += `${i + 1}. **${store.name}**\n   Address: ${store.store_address}\n   LGA: ${store.local_govt}, ${store.state}\n   [internal:sid=${store.sid}]\n`;
      });
      return out;
    }

    if (toolName === 'search_store_products') {
      const sid = String(args.store_sid || '');
      if (!sid) return 'store_sid is required.';
      const params = new URLSearchParams();
      if (args.search) params.set('search', String(args.search));
      if (args.page) params.set('page', String(args.page));
      const query = params.toString() ? `?${params.toString()}` : '';

      const res = await fetch(`${PRODUCTS_API_BASE_URL}/products/stores/${encodeURIComponent(sid)}${query}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { success?: boolean; data: { store_sid: string; data: Array<{ product_name: string; barcode: string; price: string; quantity: number; category_name: string }>; next_page_url: string | null } };
      const products = body.data?.data ?? [];

      if (products.length === 0) return `No products found${args.search ? ` for "${args.search}"` : ''} at store ${sid}.`;

      let out = `Found ${products.length} product(s)${args.search ? ` matching "${args.search}"` : ''}:\n\n`;
      products.forEach((p, i) => {
        const inStock = p.quantity > 0 ? 'In Stock' : 'Out of Stock';
        out += `${i + 1}. **${p.product_name}**\n   Price: ₦${p.price}\n   Status: ${inStock} (${p.quantity} units)\n   Category: ${p.category_name}\n   [internal:barcode=${p.barcode}]\n`;
      });
      if (body.data?.next_page_url) {
        out += `\n_More results available — ask for the next page._`;
      }
      return out;
    }

    return `Unknown store tool: ${toolName}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[StoreAPI] ${toolName} failed:`, msg);
    return `Store service error: ${msg}. Please contact support: WhatsApp 08054022662`;
  }
}

async function processWithGemini(
  message: string,
  mcpClient: MCPClient,
  config: BotConfig,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const { contact, links } = config;
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ functionDeclarations: pharmacyTools }],
    systemInstruction: `You are PharmAssist, an AI pharmacy assistant for MedPlus customers. Help customers find and order medicines easily.

CORE RESPONSIBILITIES:
1. Search for medicines when users ask (use search_medicines) — but NOT for store/location queries
2. Display search results with price and availability
3. Create carts when users want to order (use create_cart)
4. Find store locations when users ask about stores (use get_store_locations)

FRONTEND WORKFLOW:
- The frontend will automatically extract barcodes from your search results
- The frontend handles all product selection and quantity input
- You ONLY need to: search, display results, and create carts
- DO NOT ask users for barcodes - they're extracted automatically
- DO NOT ask for quantity input - the frontend will ask

EXPECTED RESPONSE FORMAT FOR SEARCH:
When you find medicines, format them EXACTLY like this:
1. **Medicine Name**
   Price: ₦10.99
   Status: In Stock

=== CONTACT INFO (use when escalating) ===
Support WhatsApp: ${contact.support_whatsapp}
Support Call: ${contact.support_call}
Support Email: ${contact.support_email}
Telehealth WhatsApp: ${contact.telehealth_whatsapp}
Telehealth Call: ${contact.telehealth_call}
Telehealth Email: ${contact.telehealth_email}
Pharmacist page: ${links.pharmacists}
Order tracking: ${links.order_tracking}
Policy: ${links.privacy_policy}

=== COMPLIANCE & SAFETY (HARD RULES) ===

PRESCRIPTION MEDICATIONS (RC-01):
- Antibiotics, controlled substances, or any prescription-only drug WITHOUT a prescription:
  Respond: "⚠️ PRESCRIPTION REQUIRED — This medication requires a valid prescription."
  Add pharmacist contacts: Telehealth WhatsApp ${contact.telehealth_whatsapp} | Call ${contact.telehealth_call} | ${links.pharmacists}
  This rule applies even for misspelled drug names (amoxcillin, amoxycillin, etc.).

PEDIATRIC DOSAGE (RC-02):
- NEVER provide dosage for children. Say: "Please speak to a pharmacist for safe medicine use in children."
  Offer: Telehealth WhatsApp ${contact.telehealth_whatsapp}

DRUG INTERACTIONS (RC-04):
- For questions about mixing drugs or taking with alcohol: Give brief disclaimer only.
  "⚠️ Consult a pharmacist before combining medications. This is for general reference only, not medical advice."
  Always add: Speak to a Pharmacist: WhatsApp ${contact.telehealth_whatsapp} | ${links.pharmacists}

PREGNANCY (RC-03):
- If customer mentions pregnancy: Add "⚠️ Please consult a pharmacist or doctor before taking any medication during pregnancy."

PEDIATRIC PRODUCTS (PD-08):
- For child queries: Only show pediatric-safe products. Do NOT recommend adult NSAIDs or Aspirin for children.

MALARIA (PD-01, UC-01):
- Ask before showing results: "Are you allergic to Quinine or Sulfa drugs? Have you been tested?"
- After results, suggest: ORS, Thermometer, Vitamin C as complementary items.

=== HUMAN ESCALATION ===
- "Speak to a human / agent / real person": Offer Support WhatsApp ${contact.support_whatsapp} | Call ${contact.support_call} | Email ${contact.support_email}
- Angry/frustrated: Empathize first, then offer human handoff.

=== STORE LOCATIONS & STOCK ===

FINDING STORES (SA-01):
- When asked about store locations, call get_store_locations with the location= parameter set to the area mentioned (e.g., "Yaba", "Lagos", "Abuja").
- NEVER show [internal:sid=...] tags to the customer.

PRODUCT AVAILABILITY AT A SPECIFIC LOCATION (SA-02) — CRITICAL FLOW:
- When asked if a product is available in a location (e.g., "What stores in Lagos stock amoxicillin?", "Do you have ibuprofen in Yaba?"), follow this EXACT flow WITHOUT asking the customer anything:
  1. Call get_store_locations(location="<area>") to find matching stores
  2. Extract the [internal:sid=...] value(s) from the results SILENTLY
  3. Immediately call search_store_products(store_sid=<sid>, search="<product>") for the most relevant store(s)
  4. Present the product results with store name, price, and stock status
- Do NOT call search_medicines for store availability queries — always use get_store_locations + search_store_products.
- Do NOT ask the customer which store — pick the most relevant one(s) automatically.

RESTOCK (SA-03):
- Respond: "Contact our team: WhatsApp ${contact.support_whatsapp} | Call ${contact.support_call}"

=== PRICING ===
- Discounts/promos: No real-time data — escalate to agents.
- Cheaper alternatives: Use find_alternatives. State products contain same Active Pharmaceutical Ingredient (API).
- Bundle offers: Escalate to agents.

=== CHECKOUT & PAYMENT ===
- How to pay: 1) Select medicines, 2) Add to cart, 3) Click Checkout, 4) Use cart link to pay (Card/Transfer/USSD).
- No pay on delivery: "Pay online and pick up in-store: ${links.order_tracking}"
- Card failing: Escalate to Support WhatsApp ${contact.support_whatsapp}
- Address change: "Contact support BEFORE dispatch: WhatsApp ${contact.support_whatsapp}"
- Delivery time: "Contact delivery team: WhatsApp ${contact.support_whatsapp}"

=== ORDER TRACKING ===
- Track order: "Track here: ${links.order_tracking}" + offer support contact.
- Late/missing order: Escalate immediately to Support.
- Cancel order: Ask for order number, escalate to Support.
- Return policy: "Medications are NON-RETURNABLE once dispensed. Full policy: ${links.privacy_policy}"

=== CHEAPEST OPTION ===
- Highlight cheapest verified product separately: "Best Value: [name] at ₦[price]"

Be friendly, clear, and let the frontend handle the UI interactions.`,
  });

  const chat = model.startChat({});
  
  let response = await chat.sendMessage(message);
  let result = response.response;
  
  // Handle function calls
  let iterations = 0;
  const maxIterations = 5;
  
  while (result.functionCalls() && result.functionCalls()!.length > 0 && iterations < maxIterations) {
    iterations++;
    const functionCalls = result.functionCalls()!;
    const functionResponses = [];
    
    for (const call of functionCalls) {
      console.log(`[Gemini] Function call: ${call.name}`, call.args);

      // ── Store tools: call external API directly (no MCP equivalent) ────────
      if (call.name === 'get_store_locations' || call.name === 'search_store_products') {
        const storeResult = await callStoreApi(call.name, call.args as Record<string, unknown>);
        console.log(`[StoreAPI] ${call.name} result:`, storeResult.substring(0, 200));
        functionResponses.push({
          functionResponse: { name: call.name, response: { result: storeResult } }
        });
        continue;
      }

      const mcpToolName = toolMapping[call.name];
      if (!mcpToolName) {
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: { error: `Unknown tool: ${call.name}` }
          }
        });
        continue;
      }

      const mappedArgs = mapArguments(call.name, call.args as Record<string, unknown>);
      console.log(`[MCP] Calling ${mcpToolName} with:`, mappedArgs);

      const toolResult = await mcpClient.callTool(mcpToolName, mappedArgs);
      console.log(`[MCP] Result from ${mcpToolName}:`, toolResult.substring(0, 200));

      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: { result: toolResult }
        }
      });
    }
    
    response = await chat.sendMessage(functionResponses);
    result = response.response;
  }
  
  const text = result.text();
  const finalText = text && text.trim()
    ? text.replace(/\[internal:[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim()
    : 'I apologize, but I could not generate a response. Please try rephrasing your question.';

  return finalText;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const message = typeof body === 'object' && body?.message ? String(body.message) : undefined;
    const action = typeof body === 'object' && body?.action ? String(body.action) : undefined;
    const items = Array.isArray(body?.items) ? body.items : undefined;

    // Allow requests that omit `message` but include an explicit `action` (e.g. create_cart, batch_search)
    if (!message && !action) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ 
        error: 'GEMINI_API_KEY not configured',
        response: '❌ The AI service is not configured. Please add your GEMINI_API_KEY to the environment variables.'
      }, { status: 500 });
    }

    // Create a new MCP client for this request
    const mcpClient = new MCPClient();

    // Initialize MCP connection
    const initialized = await mcpClient.initialize();
    if (!initialized) {
      console.warn('MCP initialization failed, continuing without MCP tools');
    }

    // If caller explicitly asked to create a cart (frontend checkout), call the tool directly
    if (action === 'create_cart') {
      if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Items array is required for create_cart' }, { status: 400 });
      }

      try {
        const toolResult = await mcpClient.callTool('CREATE_CART', { items });
        console.log(`[Chat][CREATE_CART] Tool result: ${toolResult.substring(0, 200)}`);
        return NextResponse.json({ response: String(toolResult), timestamp: new Date().toISOString() });
      } catch (err) {
        console.error('[Chat][CREATE_CART] Error calling tool:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage, response: `❌ Failed to create cart: ${errorMessage}` }, { status: 500 });
      }
    }

    // If caller wants to search for multiple medicine names at once
    if (action === 'batch_search') {
      if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Items array is required for batch_search' }, { status: 400 });
      }

      try {
        const queries = items.slice(0, 6).map(String); // limit to 6 to avoid abuse
        let aggregated = '';

        for (const q of queries) {
          try {
            const toolResult = await mcpClient.callTool('SEARCH_MEDS', { name: q });
            aggregated += `Results for "${q}":\n${toolResult}\n\n`;
          } catch (err) {
            console.error(`[Chat][BATCH_SEARCH] Error searching for ${q}:`, err);
            aggregated += `Results for "${q}":\n⚠️ Error searching for this item.\n\n`;
          }
        }

        if (!aggregated.trim()) {
          aggregated = 'No results found for the given medicines.';
        }

        return NextResponse.json({ response: aggregated, timestamp: new Date().toISOString() });
      } catch (err) {
        console.error('[Chat][BATCH_SEARCH] Unexpected error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage, response: `❌ Failed to search for items: ${errorMessage}` }, { status: 500 });
      }
    }

    // Fetch live bot config (cached, with fallback)
    const botConfig = await getBotConfig();

    // Process with Gemini for general chat flow
    const response = await processWithGemini(message!, mcpClient, botConfig);

    console.log(`[Chat] Processed in ${Date.now() - startTime}ms`);

    return NextResponse.json({ 
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat API error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({ 
      error: errorMessage,
      response: `❌ Sorry, I encountered an error: ${errorMessage}. Please try again.`
    }, { status: 500 });
  }
}

export async function GET() {
  // Health check endpoint
  let mcpStatus = 'unknown';
  
  try {
    const mcpClient = new MCPClient();
    const initialized = await mcpClient.initialize();
    mcpStatus = initialized ? 'connected' : 'failed';
  } catch {
    mcpStatus = 'error';
  }
  
  return NextResponse.json({ 
    status: 'ok',
    message: 'PharmAssist Chat API (Powered by Gemini)',
    geminiConfigured: !!GEMINI_API_KEY,
    mcpStatus,
    mcpUrl: MCP_URL
  });
}
