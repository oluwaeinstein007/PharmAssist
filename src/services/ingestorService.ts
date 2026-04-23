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

async function retryBatch<T>(fn: () => Promise<T>, maxRetries: number, batchNum: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1); // exponential backoff
        console.warn(`  Batch ${batchNum} attempt ${attempt}/${maxRetries} failed — retrying in ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
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
    console.log('Initializing IngestorService...');
    try {
      await this.qdrantService.initialize();
      console.log('IngestorService initialized successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to initialize IngestorService: ${message}`);
      throw error;
    }
  }

  /**
   * Ingest all products from the API using batch embeddings and batch upserts.
   *
   * Key properties:
   * - Barcode is used as the stable Qdrant point ID — re-running never creates duplicates.
   * - Products without a barcode are skipped (logged as failures).
   * - Embeddings and upserts happen in configurable batch sizes for maximum throughput.
   *
   * @param maxProducts Maximum products to fetch (0 = unlimited)
   * @param batchSize  Number of products to embed + upsert per batch (default 50)
   */
  async ingestAllProducts(
    maxProducts: number = 0,
    batchSize: number = 50,
  ): Promise<BatchIngestResult> {
    try {
      console.log(`Starting batch ingestion (max: ${maxProducts || 'unlimited'}, batchSize: ${batchSize})`);

      const allProducts = await this.productsService.getAllProducts(maxProducts);
      console.log(`Fetched ${allProducts.length} products from API`);

      if (allProducts.length === 0) {
        return { totalProducts: 0, successful: 0, failed: 0, results: [], message: 'No products found in the API' };
      }

      const results: IngestResult[] = [];
      let successCount = 0;
      let failureCount = 0;
      const ingestedAt = new Date().toISOString();
      const totalBatches = Math.ceil(allProducts.length / batchSize);

      for (let offset = 0; offset < allProducts.length; offset += batchSize) {
        const batch = allProducts.slice(offset, offset + batchSize);
        const batchNum = Math.floor(offset / batchSize) + 1;
        console.log(`\nBatch ${batchNum}/${totalBatches}: processing ${batch.length} products...`);

        // Products without a barcode cannot be deduplicated — skip them
        const validBatch = batch.filter(p => p.barcode);
        for (const p of batch.filter(pp => !pp.barcode)) {
          console.warn(`  Skipping "${p.product_name}": missing barcode`);
          results.push({ id: '', productName: p.product_name, success: false, message: 'Skipped: missing barcode' });
          failureCount++;
        }

        if (validBatch.length === 0) continue;

        try {
          const texts = validBatch.map(p => this.productsService.formatProductForEmbedding(p));
          const embeddings = await retryBatch(() => this.embeddingService.generateBatchEmbeddings(texts), 3, batchNum);

          // Build Qdrant points — barcode is the dedup key
          const points = validBatch.map((product, i) => {
            const price = typeof product.price === 'string' ? parseFloat(product.price) : (product.price || 0);
            const quantity = typeof product.quantity === 'string' ? parseInt(product.quantity, 10) : (product.quantity || 0);
            return {
              barcode: String(product.barcode),
              embedding: embeddings[i],
              payload: {
                product_name: String(product.product_name || ''),
                barcode: String(product.barcode),
                price: isNaN(price) ? 0 : price,
                quantity: isNaN(quantity) ? 0 : quantity,
                category_name: String(product.category_name || ''),
                category_slug: String(product.category_slug || ''),
                category_id: parseInt(String(product.category_id), 10) || 0,
                price_updated_at: product.price_updated_at || ingestedAt,
                ingested_at: ingestedAt,
              },
            };
          });

          // Retry only the Qdrant upsert
          await retryBatch(() => this.qdrantService.addChunksBatch(points), 5, batchNum);

          for (const product of validBatch) {
            results.push({ id: String(product.barcode), productName: product.product_name, success: true, message: `Ingested: ${product.product_name}` });
            successCount++;
          }

          console.log(`  Batch ${batchNum}/${totalBatches} done — ${validBatch.length} upserted`);
        } catch (batchError) {
          const message = batchError instanceof Error ? batchError.message : 'Unknown error';
          console.error(`  Batch ${batchNum} failed after all retries: ${message}`);
          for (const product of validBatch) {
            results.push({ id: String(product.barcode), productName: product.product_name, success: false, message });
            failureCount++;
          }
        }
      }

      console.log(`\nIngestion complete: ${successCount} successful, ${failureCount} failed`);
      return {
        totalProducts: allProducts.length,
        successful: successCount,
        failed: failureCount,
        results,
        message: `Ingestion complete: ${successCount} successful, ${failureCount} failed`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error in batch ingestion: ${message}`);
      return { totalProducts: 0, successful: 0, failed: 0, results: [], message: `Batch ingestion failed: ${message}` };
    }
  }

  /**
   * Ingest a single product by search query: fetch, embed, and upsert to Qdrant.
   * Uses barcode as the stable point ID to prevent duplicates.
   */
  async ingestProductByQuery(query: string): Promise<IngestResult> {
    try {
      console.log(`Starting ingestion for query: ${query}`);

      const product = await this.productsService.searchProduct(query);
      console.log(`Product found: ${product.product_name}`);

      if (!product.barcode) {
        return { id: '', productName: product.product_name, success: false, message: 'Skipped: missing barcode' };
      }

      const productText = this.productsService.formatProductForEmbedding(product);
      const embedding = await this.embeddingService.generateEmbedding(productText);

      const barcode = String(product.barcode);
      const payload = {
        product_name: product.product_name,
        barcode,
        price: product.price,
        quantity: product.quantity,
        category_name: product.category_name,
        category_slug: product.category_slug,
        category_id: product.category_id,
        price_updated_at: product.price_updated_at || new Date().toISOString(),
        ingested_at: new Date().toISOString(),
      };

      await this.qdrantService.addChunk(barcode, embedding, payload);
      console.log(`Product stored in Qdrant with barcode ID: ${barcode}`);

      return { id: barcode, productName: product.product_name, success: true, message: `Successfully ingested: ${product.product_name}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error ingesting product by query: ${message}`);
      return { id: '', productName: 'Unknown', success: false, message: `Failed to ingest product: ${message}` };
    }
  }
}
