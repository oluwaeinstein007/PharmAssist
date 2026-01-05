import axios from 'axios';

export interface UnifiedProduct {
  success: boolean;
  message: string;
  data: {
    product_name: string;
    barcode: string;
    price: number;
    price_updated_at: string;
    quantity: number;
    category_name: string;
    category_slug: string;
    category_id: number;
    [key: string]: any;
  };
}

export class UnifiedProductsService {
  private apiBaseUrl: string;
  private apiToken: string;

  constructor() {
    this.apiBaseUrl = process.env.UNIFIED_PRODUCTS_API_URL || 'https://mshop.mptechteam.com/api/reseller/products/unified';
    this.apiToken = process.env.UNIFIED_PRODUCTS_API_TOKEN || '';

    if (!this.apiToken) {
      console.warn('UNIFIED_PRODUCTS_API_TOKEN is not set. API requests may fail.');
    }
  }

  /**
   * Fetch product details by barcode from the Unified Products API
   * @param barcode The barcode of the product
   * @returns The product data from the API
   */
  async getProductByBarcode(barcode: string): Promise<UnifiedProduct['data']> {
    try {
      const url = `${this.apiBaseUrl}/details/${barcode}`;
      console.log(`🔍 Fetching product from API: ${url}`);

      const response = await axios.get<UnifiedProduct>(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      if (!response.data.success) {
        throw new Error(`API returned unsuccessful status: ${response.data.message}`);
      }

      console.log(`✅ Product fetched successfully: ${response.data.data.product_name}`);
      return response.data.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`❌ Error fetching product by barcode ${barcode}: ${message}`);
      throw error;
    }
  }

  /**
   * Fetch product details by medicine name/ID
   * @param query Medicine name or identifier
   * @returns The product data from the API
   */
  async searchProduct(query: string): Promise<UnifiedProduct['data']> {
    try {
      // This assumes the API supports a search endpoint
      // Adjust the URL if the actual endpoint is different
      const url = `${this.apiBaseUrl}/search`;
      console.log(`🔍 Searching for product: ${query}`);

      const response = await axios.get<UnifiedProduct>(url, {
        params: { search: query },
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      if (!response.data.success) {
        throw new Error(`API returned unsuccessful status: ${response.data.message}`);
      }

      console.log(`✅ Product found: ${response.data.data.product_name}`);
      return response.data.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`❌ Error searching product for query ${query}: ${message}`);
      throw error;
    }
  }

  /**
   * Format product data as text for embedding
   * @param product The product data
   * @returns Formatted text representation
   */
  formatProductForEmbedding(product: UnifiedProduct['data']): string {
    return `
      Product: ${product.product_name}
      Barcode: ${product.barcode}
      Category: ${product.category_name}
      Price: ${product.price}
      Quantity Available: ${product.quantity}
      Last Updated: ${product.price_updated_at}
    `.trim();
  }
}
