import { UnifiedProductsService } from './unifiedProductsService.js';
import { EmbeddingService } from './embeddingService.js';
import { QdrantService } from '../storage/qdrantService.js';

export interface IngestResult {
  id: string;
  productName: string;
  barcode: string;
  success: boolean;
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
   * Ingest a product by barcode: fetch data, generate embedding, store in Qdrant
   * @param barcode The barcode of the product to ingest
   * @returns Result of the ingestion process
   */
  async ingestProductByBarcode(barcode: string): Promise<IngestResult> {
    try {
      console.log(`📥 Starting ingestion for barcode: ${barcode}`);

      // Step 1: Fetch product data from Unified Products API
      const product = await this.productsService.getProductByBarcode(barcode);
      console.log(`✅ Product fetched: ${product.product_name}`);

      // Step 2: Format product data and generate embedding
      const productText = this.productsService.formatProductForEmbedding(product);
      const embedding = await this.embeddingService.generateEmbedding(productText);
      console.log(`✅ Embedding generated for ${product.product_name}`);

      // Step 3: Store in Qdrant
      const id = `${product.barcode}_${Date.now()}`;
      const payload = {
        product_name: product.product_name,
        barcode: product.barcode,
        price: product.price,
        quantity: product.quantity,
        category_name: product.category_name,
        category_slug: product.category_slug,
        category_id: product.category_id,
        price_updated_at: product.price_updated_at,
        ingested_at: new Date().toISOString(),
      };

      await this.qdrantService.addChunk(id, embedding, payload);
      console.log(`✅ Product stored in Qdrant: ${id}`);

      return {
        id,
        productName: product.product_name,
        barcode: product.barcode,
        success: true,
        message: `Successfully ingested product: ${product.product_name}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error ingesting product by barcode: ${message}`);
      return {
        id: `${barcode}_error`,
        productName: 'Unknown',
        barcode,
        success: false,
        message: `Failed to ingest product: ${message}`,
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
      const id = `${product.barcode}_${Date.now()}`;
      const payload = {
        product_name: product.product_name,
        barcode: product.barcode,
        price: product.price,
        quantity: product.quantity,
        category_name: product.category_name,
        category_slug: product.category_slug,
        category_id: product.category_id,
        price_updated_at: product.price_updated_at,
        ingested_at: new Date().toISOString(),
      };

      await this.qdrantService.addChunk(id, embedding, payload);
      console.log(`✅ Product stored in Qdrant: ${id}`);

      return {
        id,
        productName: product.product_name,
        barcode: product.barcode,
        success: true,
        message: `Successfully ingested product: ${product.product_name}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error ingesting product by query: ${message}`);
      return {
        id: `${query}_error`,
        productName: 'Unknown',
        barcode: 'Unknown',
        success: false,
        message: `Failed to ingest product: ${message}`,
      };
    }
  }

  /**
   * Ingest multiple products by barcodes
   * @param barcodes Array of barcodes to ingest
   * @returns Array of ingestion results
   */
  async ingestMultipleProducts(barcodes: string[]): Promise<IngestResult[]> {
    console.log(`📥 Starting batch ingestion for ${barcodes.length} products`);
    
    const results: IngestResult[] = [];
    for (const barcode of barcodes) {
      const result = await this.ingestProductByBarcode(barcode);
      results.push(result);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Batch ingestion complete: ${successCount}/${barcodes.length} succeeded`);
    
    return results;
  }
}
