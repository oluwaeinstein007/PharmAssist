import { randomUUID as cryptoRandomUUID } from "crypto";

const randomUUID = () => {
  try {
    return cryptoRandomUUID();
  } catch (error) {
    // Fallback for environments where crypto.randomUUID is unavailable
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

export interface CartItem {
  barcode: string;
  qty: string | number;
}

export interface CreateCartRequest {
  uid: string;
  items: CartItem[];
}

export interface CreateCartResponse {
  success: boolean;
  message?: string;
  cartId?: string;
  error?: string;
}

export class CreateCartService {
  private readonly apiBaseUrl: string;
  private readonly apiEndpoint: string;

  constructor() {
    this.apiBaseUrl = process.env.UNIFIED_PRODUCTS_BASE_URL || 'https://cc.medplusnig.com/api';
    this.apiEndpoint = `${this.apiBaseUrl}/bot/cart-actions`;
  }

  async createCart(items: CartItem[]): Promise<CreateCartResponse> {
    const uid = randomUUID();
    const payload: CreateCartRequest = {
      uid,
      items: items.map(item => ({
        barcode: item.barcode,
        qty: typeof item.qty === "number" ? String(item.qty) : item.qty,
      })),
    };

    console.log(`[CreateCartService] Creating cart with UID: ${uid}`);
    console.log(`[CreateCartService] Payload:`, JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(this.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed with status ${response.status}: ${errorText}`
        );
      }

      const result = await response.json();
      console.log(`[CreateCartService] Cart created successfully:`, result);

      return {
        success: true,
        message: "Cart created successfully",
        cartId: uid,
        ...result,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(`[CreateCartService] Error creating cart: ${message}`);
      return {
        success: false,
        error: message,
      };
    }
  }
}
