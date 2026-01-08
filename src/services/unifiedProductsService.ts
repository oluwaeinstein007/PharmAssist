import axios from 'axios';

export interface UnifiedProduct {
  product_name: string;
  price: string | number;
  price_updated_at?: string;
  quantity: string | number;
  category_name: string;
  category_slug: string;
  category_id: number;
  barcode?: string;
  [key: string]: any;
}

export interface PaginationMeta {
  current_page: number;
  data: UnifiedProduct[];
  first_page_url?: string;
  from?: number;
  last_page?: number;
  last_page_url?: string;
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to?: number;
  total?: number;
}

export interface PaginatedResponse {
  success: boolean;
  message: string;
  data: PaginationMeta;
}

export class UnifiedProductsService {
  private apiBaseUrl: string;
  private apiToken: string;

  constructor() {
    this.apiBaseUrl = process.env.UNIFIED_PRODUCTS_BASE_URL || 'https://cc.medplusnig.com/api';
    // this.apiToken = process.env.UNIFIED_PRODUCTS_API_TOKEN || '';
    this.apiToken = process.env.BEARER_TOKEN || '';

    if (!this.apiToken) {
      console.warn('BEARER_TOKEN is not set. API requests may fail.');
    }
  }

  /**
   * Fetch all products from the Unified Products API with pagination
   * @param maxProducts Maximum number of products to fetch (0 = unlimited)
   * @returns All products from all pages (up to maxProducts if specified)
   */
  async getAllProducts(maxProducts: number = 0): Promise<UnifiedProduct[]> {
    try {
      console.log(`📥 Fetching all products from API with pagination${maxProducts > 0 ? ` (max: ${maxProducts})` : ''}`);
      const allProducts: UnifiedProduct[] = [];
      let currentPage = 1;
      let hasNextPage = true;

      while (hasNextPage && (maxProducts === 0 || allProducts.length < maxProducts)) {
        const url = `${this.apiBaseUrl}/products/unified?page=${currentPage}`;
        console.log(`🔍 Fetching page ${currentPage}: ${url}`);

        try {
          const response = await axios.get<PaginatedResponse>(url, {
            headers: {
              'Authorization': `Bearer ${this.apiToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          });

          if (!response.data.success) {
            throw new Error(`API returned unsuccessful status: ${response.data.message}`);
          }

          // Products are nested in response.data.data
          const pageProducts = response.data.data.data;
          console.log(`✅ Page ${currentPage}: Retrieved ${pageProducts.length} products (Total so far: ${allProducts.length + pageProducts.length})`);

          // Add products, but respect maxProducts limit
          if (maxProducts > 0) {
            const remaining = maxProducts - allProducts.length;
            allProducts.push(...pageProducts.slice(0, remaining));
          } else {
            allProducts.push(...pageProducts);
          }

          // Check if we've reached our limit or if there's no next page
          if (maxProducts > 0 && allProducts.length >= maxProducts) {
            console.log(`📌 Reached product limit of ${maxProducts}. Stopping pagination.`);
            hasNextPage = false;
          } else {
            hasNextPage = response.data.data.next_page_url !== null;
            if (hasNextPage) {
              currentPage++;
              // Add delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } catch (pageError) {
          const pageMessage = pageError instanceof Error ? pageError.message : 'Unknown error';
          console.warn(`⚠️  Error fetching page ${currentPage}: ${pageMessage}. Stopping pagination.`);
          // Stop pagination if we hit an error (e.g., API failure on later pages)
          hasNextPage = false;
        }
      }

      console.log(`✅ Successfully fetched ${allProducts.length} products from ${currentPage} page(s)`);
      return allProducts;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`❌ Error fetching all products: ${message}`);
      throw error;
    }
  }

  /**
   * Fetch a single page of products
   * @param page Page number (default: 1)
   * @returns Paginated product data from the API
   */
  async getProducts(page: number = 1): Promise<PaginatedResponse> {
    try {
      const url = `${this.apiBaseUrl}/products/unified?page=${page}`;
      console.log(`🔍 Fetching products from API: ${url}`);

      const response = await axios.get<PaginatedResponse>(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      if (!response.data.success) {
        throw new Error(`API returned unsuccessful status: ${response.data.message}`);
      }

      console.log(`✅ Page ${page} fetched successfully with ${response.data.data.data.length} products`);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`❌ Error fetching products: ${message}`);
      throw error;
    }
  }

  /**
   * Fetch product details by medicine name/ID
   * @param query Medicine name or identifier
   * @returns The product data matching the query
   */
  async searchProduct(query: string): Promise<UnifiedProduct> {
    try {
      console.log(`🔍 Searching for product: ${query}`);

      // Fetch all products and filter by name
      const allProducts = await this.getAllProducts();
      const product = allProducts.find(
        p => p.product_name.toLowerCase().includes(query.toLowerCase())
      );

      if (!product) {
        throw new Error(`Product not found for query: ${query}`);
      }

      console.log(`✅ Product found: ${product.product_name}`);
      return product;
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
  formatProductForEmbedding(product: UnifiedProduct): string {
    return `
      Product: ${product.product_name}
      Category: ${product.category_name}
      Price: ${product.price}
      Quantity Available: ${product.quantity}
      Last Updated: ${product.price_updated_at}
    `.trim();
  }
}
