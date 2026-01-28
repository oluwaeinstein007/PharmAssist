export interface StockCheck {
  medicine_barcode: string;
}

export interface StockResponse {
  success: boolean;
  data?: {
    barcode: string;
    product_name: string;
    price: number;
    quantity: number;
    category_name: string;
  };
  error?: string;
}

export class CheckStockService {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = process.env.MEDPLUS_API_URL || 'https://api.medplus.me';
  }

  async checkStock(check: StockCheck): Promise<StockResponse> {
    try {
      console.log(`[CheckStockService] Checking stock for medicine barcode: ${check.medicine_barcode}`);
      
      const url = `${this.apiBaseUrl}/products/unified/${check.medicine_barcode}`;
      console.log(`[CheckStockService] Fetching from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `API returned status ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json();
      
      return {
        success: true,
        data: {
          barcode: data.barcode,
          product_name: data.product_name,
          price: data.price,
          quantity: data.quantity,
          category_name: data.category_name,
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`[CheckStockService] Error: ${message}`);
      return {
        success: false,
        error: message
      };
    }
  }
}
