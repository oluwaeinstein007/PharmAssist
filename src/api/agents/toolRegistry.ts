import {
  SchemaType,
  type FunctionDeclaration,
  type Schema,
} from '@google/generative-ai';
import { RetrievalService } from '../../services/retrievalService.js';
import { CheckStockService } from '../../services/checkStockService.js';
import { CreateCartService, type CartItem } from '../../services/createCartService.js';
import { LogPurchaseService } from '../../services/logPurchaseService.js';
import { FindAlternativesService } from '../../services/logPurchaseService.js';
import { NotifyAdminService } from '../../services/notifyAdminService.js';

// ── Shared service singletons ───────────────────────────────────────────────

let _retrievalService: RetrievalService | null = null;
let _retrievalInitialized = false;

export async function getRetrievalService(): Promise<RetrievalService> {
  if (!_retrievalService) {
    _retrievalService = new RetrievalService();
  }
  if (!_retrievalInitialized) {
    await _retrievalService.initialize();
    _retrievalInitialized = true;
  }
  return _retrievalService;
}

// ── Tool definition type ────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  geminiDeclaration: FunctionDeclaration;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// ── Tool definitions ────────────────────────────────────────────────────────

const searchMedicinesTool: ToolDefinition = {
  name: 'search_medicines',
  geminiDeclaration: {
    name: 'search_medicines',
    description:
      'Search for medicines by name, symptom, or condition. Use this to find medicines for treating symptoms like fever, headache, malaria, cough, cold, pain, etc.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            'The medicine name, symptom, or condition to search for (e.g., "paracetamol", "fever", "malaria")',
        } as Schema,
      },
      required: ['query'],
    } as Schema,
  } as FunctionDeclaration,
  execute: async (args) => {
    const retrieval = await getRetrievalService();
    const query = String(args.query || '');
    const searchResult = await retrieval.searchMedicines(query, 5);

    if (searchResult.medicines.length === 0) {
      return `No medicines found for "${query}".`;
    }

    let response = `Found ${searchResult.medicines.length} medicine(s) for "${query}":\n\n`;
    searchResult.medicines.forEach((med, index) => {
      const inStock = med.quantity && med.quantity > 0 ? 'In Stock' : 'Out of Stock';
      response += `${index + 1}. **${med.product_name}**\n   Price: ₦${med.price}\n   Status: ${inStock}\n   Category: ${med.category_name}\n   Match Score: ${(med.score * 100).toFixed(1)}%\n`;
    });
    response += `\nSearch completed in ${searchResult.executionTime}ms`;
    return response;
  },
};

const checkStockTool: ToolDefinition = {
  name: 'check_stock',
  geminiDeclaration: {
    name: 'check_stock',
    description:
      'Check the stock availability and price of a specific medicine by its barcode. Use this after selecting a medicine from search results to verify availability before ordering.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_barcode: {
          type: SchemaType.STRING,
          description: 'The barcode of the medicine to check stock for',
        } as Schema,
      },
      required: ['medicine_barcode'],
    } as Schema,
  } as FunctionDeclaration,
  execute: async (args) => {
    const service = new CheckStockService();
    const result = await service.checkStock({
      medicine_barcode: String(args.medicine_barcode || ''),
    });

    if (!result.success) {
      return `Failed to check stock: ${result.error}`;
    }

    const { data } = result;
    const inStock = data?.quantity && data.quantity > 0;
    return `Stock Check Result:\n\n**Product:** ${data?.product_name}\n**Category:** ${data?.category_name}\n**Price:** ₦${data?.price}\n**Status:** ${inStock ? 'In stock and ready to order!' : 'Out of stock'}`;
  },
};

const findAlternativesTool: ToolDefinition = {
  name: 'find_alternatives',
  geminiDeclaration: {
    name: 'find_alternatives',
    description:
      'Find alternative medicines for a specific medicine by its ID. Use this when a medicine is out of stock or user wants options.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine to find alternatives for',
        } as Schema,
      },
      required: ['medicine_id'],
    } as Schema,
  } as FunctionDeclaration,
  execute: async (args) => {
    const service = new FindAlternativesService();
    const result = await service.addLog({
      name: String(args.medicine_name || ''),
      medicine_id: String(args.medicine_id || ''),
      customer_id: String(args.customer_id || 'system'),
      purchase_date: new Date().toISOString(),
      quantity: Number(args.quantity) || 1,
      total_price: Number(args.total_price) || 0,
    });
    return `Alternatives search initiated: ${result}`;
  },
};

const getMedicineDetailsTool: ToolDefinition = {
  name: 'get_medicine_details',
  geminiDeclaration: {
    name: 'get_medicine_details',
    description:
      'Get detailed information about a specific medicine including dosage, side effects, and usage instructions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine to get details for',
        } as Schema,
      },
      required: ['medicine_id'],
    } as Schema,
  } as FunctionDeclaration,
  execute: async (args) => {
    const retrieval = await getRetrievalService();
    const med = await retrieval.getMedicineById(String(args.medicine_id || ''));
    if (!med) {
      return `Medicine with ID ${args.medicine_id} not found.`;
    }
    const inStock = med.quantity && med.quantity > 0 ? 'In Stock' : 'Out of Stock';
    return `Medicine Details:\n\nName: ${med.product_name}\nPrice: ₦${med.price}\nStatus: ${inStock}\nCategory: ${med.category_name}`;
  },
};

const createCartTool: ToolDefinition = {
  name: 'create_cart',
  geminiDeclaration: {
    name: 'create_cart',
    description:
      'Create a shopping cart with medicine items. Each item requires a barcode and quantity. Accepts an array of items.',
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
                description: 'The barcode of the medicine',
              } as Schema,
              qty: {
                type: SchemaType.STRING,
                description: 'The quantity of the medicine (string or number accepted)',
              } as Schema,
            },
            required: ['barcode', 'qty'],
          } as Schema,
        } as Schema,
      },
      required: ['items'],
    } as Schema,
  } as FunctionDeclaration,
  execute: async (args) => {
    const service = new CreateCartService();
    const rawItems = Array.isArray(args.items) ? args.items : [args.items];
    const cartItems: CartItem[] = rawItems.map((item: any) => ({
      barcode: String(item.barcode),
      qty: item.qty,
    }));

    const result = await service.createCart(cartItems);

    if (result.success) {
      let response = `Cart created successfully!\nCart ID: ${result.cartId}`;
      if (result.cartUrl) {
        response += `\n\nComplete your transaction here: ${result.cartUrl}`;
      }
      return response;
    }
    throw new Error(result.error || 'Failed to create cart');
  },
};

const logPurchaseTool: ToolDefinition = {
  name: 'log_purchase',
  geminiDeclaration: {
    name: 'log_purchase',
    description:
      'Log a medicine purchase for analytics and inventory management.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_name: {
          type: SchemaType.STRING,
          description: 'The name of the medicine purchased',
        } as Schema,
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine purchased',
        } as Schema,
        customer_id: {
          type: SchemaType.STRING,
          description: 'The ID of the customer',
        } as Schema,
        quantity: {
          type: SchemaType.NUMBER,
          description: 'The quantity purchased',
        } as Schema,
        total_price: {
          type: SchemaType.NUMBER,
          description: 'The total price of the purchase',
        } as Schema,
      },
      required: ['medicine_name', 'medicine_id', 'customer_id', 'quantity', 'total_price'],
    } as Schema,
  } as FunctionDeclaration,
  execute: async (args) => {
    const service = new LogPurchaseService();
    const logId = await service.addLog({
      name: String(args.medicine_name || ''),
      medicine_id: String(args.medicine_id || ''),
      customer_id: String(args.customer_id || ''),
      purchase_date: new Date().toISOString(),
      quantity: Number(args.quantity) || 1,
      total_price: Number(args.total_price) || 0,
    });
    return `Purchase logged: ${logId}`;
  },
};

const notifyAdminTool: ToolDefinition = {
  name: 'notify_admin',
  geminiDeclaration: {
    name: 'notify_admin',
    description:
      'Notify admin when medicine is out of stock or low inventory.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        medicine_name: {
          type: SchemaType.STRING,
          description: 'The name of the medicine',
        } as Schema,
        medicine_id: {
          type: SchemaType.STRING,
          description: 'The ID of the medicine',
        } as Schema,
        reason: {
          type: SchemaType.STRING,
          description: 'The reason for notification (e.g., out of stock, low inventory)',
        } as Schema,
        priority: {
          type: SchemaType.STRING,
          description: 'The priority level (high, medium, low)',
        } as Schema,
      },
      required: ['medicine_name', 'medicine_id', 'reason', 'priority'],
    } as Schema,
  } as FunctionDeclaration,
  execute: async (args) => {
    const service = new NotifyAdminService();
    const notifId = await service.addLog({
      name: String(args.medicine_name || ''),
      medicine_id: String(args.medicine_id || ''),
      reason: String(args.reason || ''),
      priority: String(args.priority || 'medium'),
    });
    return `Admin notified: ${notifId}`;
  },
};

// ── Registry ────────────────────────────────────────────────────────────────

export const toolRegistry: ToolDefinition[] = [
  searchMedicinesTool,
  checkStockTool,
  findAlternativesTool,
  getMedicineDetailsTool,
  createCartTool,
  logPurchaseTool,
  notifyAdminTool,
];

export const toolMap = new Map<string, ToolDefinition>(
  toolRegistry.map((t) => [t.name, t])
);

export function getGeminiDeclarations(allowedTools?: string[]): FunctionDeclaration[] {
  if (!allowedTools) return toolRegistry.map((t) => t.geminiDeclaration);
  return toolRegistry
    .filter((t) => allowedTools.includes(t.name))
    .map((t) => t.geminiDeclaration);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  allowedTools?: string[],
): Promise<string> {
  // Role-based tool gating: reject if tool is not in the allowed list
  if (allowedTools && !allowedTools.includes(name)) {
    console.warn(`[ToolRegistry] Tool ${name} blocked by role policy`);
    return `Tool ${name} is not available for your account role.`;
  }

  const tool = toolMap.get(name);
  if (!tool) {
    return `Unknown tool: ${name}`;
  }

  try {
    console.log(`[ToolRegistry] Executing ${name} with:`, JSON.stringify(args).substring(0, 200));
    const result = await tool.execute(args);
    console.log(`[ToolRegistry] ${name} result:`, result.substring(0, 200));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ToolRegistry] ${name} failed:`, message);
    return `Tool ${name} failed: ${message}`;
  }
}
