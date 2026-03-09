import { QdrantClient } from '@qdrant/js-client-rest';

export class QdrantService {

  private client: QdrantClient;
  private collectionName: string;
  private vectorSize: number;
  private enabled: boolean;

  constructor() {
    const qdrantHost = process.env.QDRANT_HOST;
    const qdrantKey = process.env.QDRANT_KEY;
    const enabledFlag = process.env.QDRANT_ENABLED ?? 'true';
    this.enabled = String(enabledFlag).toLowerCase() !== 'false';

    if (!this.enabled) {
      console.log('Qdrant disabled via QDRANT_ENABLED=false; skipping Qdrant initialization.');
      // Provide defaults so rest of service can be constructed
      this.client = {} as any;
      this.collectionName = process.env.QDRANT_COLLECTION_NAME || 'pharm_assist_cluster';
      this.vectorSize = parseInt(process.env.EMBEDDING_VECTOR_SIZE || '3072', 10);
      return;
    }

    if (!qdrantHost) {
      throw new Error("QDRANT_HOST environment variable is not set.");
    }
    if (!qdrantKey) {
      throw new Error("QDRANT_KEY environment variable is not set.");
    }

    // Initialize Qdrant client with URL and API key from environment variables
    this.client = new QdrantClient({
      url: qdrantHost,
      apiKey: qdrantKey,
    });

    // Default collection name and vector size
    this.collectionName = process.env.QDRANT_COLLECTION_NAME || 'pharm_assist_cluster'; // Default collection name
    // Allow embedding dimension to be configured via env, otherwise default to 3072
    this.vectorSize = parseInt(process.env.EMBEDDING_VECTOR_SIZE || '3072', 10);
  }

  async initialize(): Promise<void> {
    if (!this.enabled) {
      console.log('QdrantService.initialize: Qdrant is disabled; skipping initialization.');
      return;
    }

    // Read API key from env here as well for fallback host attempts
    const qdrantKey = process.env.QDRANT_KEY;

    try {
      // Check if collection exists, create if not
      const collectionsResponse = await this.client.getCollections();
      const collectionExists = collectionsResponse.collections.some(
        (col) => col.name === this.collectionName
      );

      if (!collectionExists) {
        console.log(`Creating Qdrant collection: ${this.collectionName}`);
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine', // Or 'Euclid', 'Dot'
          },
        });
        console.log(`Collection '${this.collectionName}' created.`);
      } else {
        console.log(`Qdrant collection '${this.collectionName}' already exists.`);
      }
    } catch (error: any) {
      console.warn('getCollections failed:', error?.message ?? error);

      // Try to create the collection directly on the current client (some hosted endpoints
      // may not expose listing but allow creation). If that fails, attempt host variants
      // (e.g. remove explicit port) and retry creating the collection.
      const tryCreate = async (client: QdrantClient) => {
        try {
          await client.createCollection(this.collectionName, {
            vectors: { size: this.vectorSize, distance: 'Cosine' },
          });
          console.log(`Collection '${this.collectionName}' created via fallback createCollection.`);
          return true;
        } catch (err: any) {
          return false;
        }
      };

      // First, attempt create on the existing client
      if (await tryCreate(this.client)) return;

      // Build host variants to try (remove explicit port, try without port, try forcing https)
      const originalHost = process.env.QDRANT_HOST || '';
      const hostCandidates: string[] = [];
      try {
        const parsed = new URL(originalHost);
        // candidate: same without port
        parsed.port = '';
        hostCandidates.push(parsed.toString().replace(/\/$/, ''));
        // candidate: force https without port
        parsed.protocol = 'https:';
        hostCandidates.push(parsed.toString().replace(/\/$/, ''));
      } catch (e) {
        // fallback heuristics
        if (originalHost) {
          hostCandidates.push(originalHost.replace(/:\d+/, ''));
        }
      }

      for (const candidate of hostCandidates) {
        if (!candidate || candidate === originalHost) continue;
        try {
          const altClient = new QdrantClient({ url: candidate, apiKey: qdrantKey as string });
          if (await tryCreate(altClient)) {
            // switch to using this client going forward
            this.client = altClient;
            console.log(`Switched Qdrant host to '${candidate}' and created collection.`);
            return;
          }
        } catch (err) {
          // ignore and try next
        }
      }

      console.error('Error initializing Qdrant client or collection:', error.message ?? error);
      throw error;
    }
  }

  /**
   * Convert a barcode string to a stable numeric Qdrant point ID.
   * - Numeric barcodes (EAN-8, EAN-13, UPC) are used directly as integers.
   * - Non-numeric barcodes are hashed to a 32-bit unsigned integer.
   */
  private barcodeToId(barcode: string): number {
    const parsed = parseInt(barcode, 10);
    if (!isNaN(parsed) && parsed > 0 && String(parsed) === barcode) {
      return parsed;
    }
    // djb2 hash for non-numeric barcodes
    let hash = 5381;
    for (let i = 0; i < barcode.length; i++) {
      hash = ((hash << 5) + hash) ^ barcode.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash || 1;
  }

  // Single-point upsert — delegates to addChunksBatch
  async addChunk(barcode: string, embedding: number[], payload: any): Promise<void> {
    await this.addChunksBatch([{ barcode, embedding, payload }]);
  }

  /**
   * Batch upsert multiple points in a single Qdrant request.
   * Uses barcode as the deterministic stable point ID — re-ingesting the same
   * barcode will overwrite the existing entry rather than create a duplicate.
   */
  async addChunksBatch(
    points: Array<{ barcode: string; embedding: number[]; payload: any }>
  ): Promise<void> {
    if (points.length === 0) return;
    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: points.map(p => ({
          id: this.barcodeToId(p.barcode),
          vector: p.embedding,
          payload: p.payload,
        })),
      });
      console.log(`🧩 Upserted ${points.length} point(s) to Qdrant`);
    } catch (error: any) {
      console.error(`Error upserting batch to Qdrant: ${error.message}`);
      throw error;
    }
  }

  // Method to search for similar chunks
  async search(queryEmbedding: number[], limit: number = 3): Promise<any[]> {
    try {
      const searchResult = await this.client.search(this.collectionName, {
        vector: queryEmbedding,
        limit: limit,
        with_payload: true,
      });
      return searchResult;
    } catch (error: any) {
      console.error('Error searching Qdrant:', error.message);
      throw error;
    }
  }
}
