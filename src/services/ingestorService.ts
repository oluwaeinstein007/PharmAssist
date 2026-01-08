import { UnifiedProductsService } from './unifiedProductsService.js';
import { EmbeddingService } from './embeddingService.js';
import { QdrantService } from '../storage/qdrantService.js';

export interface IngestResult {
  id: string;
  productName: string;
  success: boolean;
  message: string;
}

export interface BatchIngestResult {
  totalProducts: number;
  successful: number;
  failed: number;
  results: IngestResult[];
  message: string;
}

export class IngestorService {
  private productsService: UnifiedProductsService;
  private embeddingService: EmbeddingService;
  private qdrantService: QdrantService;

  constructor() {
    this.productsService = new UnifiedProductsService();
    this.embeddingService = new EmbeddingService();
    this.qdrantService = new QdrantService();
  }

  /**
   * Initialize the ingestor service and Qdrant connection
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing IngestorService...');
    try {
      await this.qdrantService.initialize();
      console.log('✅ IngestorService initialized successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to initialize IngestorService: ${message}`);
      throw error;
    }
  }

  /**
   * Ingest all products from the API: fetch data with pagination, generate embeddings, store in Qdrant
   * @param maxProducts Maximum number of products to ingest (default: 20 for testing)
   * @returns Result of the batch ingestion process
   */
  async ingestAllProducts(maxProducts: number = 5): Promise<BatchIngestResult> {
    try {
      console.log(`📥 Starting batch ingestion for all products from API (max: ${maxProducts})`);

      // Step 1: Fetch all products from the API with pagination
      const allProducts = await this.productsService.getAllProducts(maxProducts);
      console.log(`✅ Fetched ${allProducts.length} products from API`);

      if (allProducts.length === 0) {
        return {
          totalProducts: 0,
          successful: 0,
          failed: 0,
          results: [],
          message: 'No products found in the API',
        };
      }

      const results: IngestResult[] = [];
      let successCount = 0;
      let failureCount = 0;

      // Step 2: Ingest each product
      for (let i = 0; i < allProducts.length; i++) {
        const product = allProducts[i];
        try {
          console.log(`⏳ Ingesting product ${i + 1}/${allProducts.length}: ${product.product_name}`);

          // Format product data and generate embedding
          const productText = this.productsService.formatProductForEmbedding(product);
          const embedding = await this.embeddingService.generateEmbedding(productText);

          // Store in Qdrant
          const timestampId = Date.now() + i;
          const price = typeof product.price === 'string' ? parseFloat(product.price) : (product.price || 0);
          const quantity = typeof product.quantity === 'string' ? parseInt(product.quantity, 10) : (product.quantity || 0);
          
          const payload = {
            product_name: String(product.product_name || ''),
            price: isNaN(price) ? 0 : price,
            quantity: isNaN(quantity) ? 0 : quantity,
            category_name: String(product.category_name || ''),
            category_slug: String(product.category_slug || ''),
            category_id: parseInt(String(product.category_id), 10) || 0,
            price_updated_at: product.price_updated_at || new Date().toISOString(),
            ingested_at: new Date().toISOString(),
          };

          console.log(`  Payload for ${product.product_name}: price=${payload.price}, qty=${payload.quantity}`);

          await this.qdrantService.addChunk(String(timestampId), embedding, payload);
          console.log(`✅ Product ${i + 1}/${allProducts.length} stored in Qdrant: ${product.product_name}`);

          results.push({
            id: String(timestampId),
            productName: product.product_name,
            success: true,
            message: `Successfully ingested: ${product.product_name}`,
          });

          successCount++;

          // Add delay to avoid overwhelming the embedding service
          if (i < allProducts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ Error ingesting ${product.product_name}: ${message}`);

          results.push({
            id: `unknown_${Date.now()}`,
            productName: product.product_name,
            success: false,
            message: `Failed to ingest: ${message}`,
          });

          failureCount++;
        }
      }

      console.log(`\n📊 Batch ingestion completed: ${successCount}/${allProducts.length} successful`);

      return {
        totalProducts: allProducts.length,
        successful: successCount,
        failed: failureCount,
        results,
        message: `Ingestion complete: ${successCount} successful, ${failureCount} failed`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error in batch ingestion: ${message}`);
      return {
        totalProducts: 0,
        successful: 0,
        failed: 0,
        results: [],
        message: `Batch ingestion failed: ${message}`,
      };
    }
  }

  /**
   * Ingest a product by search query: fetch data, generate embedding, store in Qdrant
   * @param query The product name or search query
   * @returns Result of the ingestion process
   */
  async ingestProductByQuery(query: string): Promise<IngestResult> {
    try {
      console.log(`📥 Starting ingestion for query: ${query}`);

      // Step 1: Search for product
      const product = await this.productsService.searchProduct(query);
      console.log(`✅ Product found: ${product.product_name}`);

      // Step 2: Format product data and generate embedding
      const productText = this.productsService.formatProductForEmbedding(product);
      const embedding = await this.embeddingService.generateEmbedding(productText);
      console.log(`✅ Embedding generated for ${product.product_name}`);

      // Step 3: Store in Qdrant
      const id = `${product.product_name}_${Date.now()}`;
      const payload = {
        product_name: product.product_name,
        price: product.price,
        quantity: product.quantity,
        category_name: product.category_name,
        category_slug: product.category_slug,
        category_id: product.category_id,
        price_updated_at: product.price_updated_at || new Date().toISOString(),
        ingested_at: new Date().toISOString(),
      };

      await this.qdrantService.addChunk(id, embedding, payload);
      console.log(`✅ Product stored in Qdrant: ${id}`);

      return {
        id,
        productName: product.product_name,
        success: true,
        message: `Successfully ingested product: ${product.product_name}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error ingesting product by query: ${message}`);
      return {
        id: `unknown_${Date.now()}`,
        productName: 'Unknown',
        success: false,
        message: `Failed to ingest product: ${message}`,
      };
    }
  }
}
