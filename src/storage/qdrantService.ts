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
      this.collectionName = 'documents';
      this.vectorSize = parseInt(process.env.EMBEDDING_VECTOR_SIZE || '1536', 10);
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
    this.collectionName = 'pharm_cluster'; // Default collection name
    // Allow embedding dimension to be configured via env, otherwise default to 1536
    const envVec = process.env.EMBEDDING_VECTOR_SIZE || '1536';
    this.vectorSize = envVec ? parseInt(envVec, 10) : 1536;
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

  // Method to add a document chunk with its embedding to Qdrant
  async addChunk(id: string, embedding: number[], payload: any): Promise<void> {
    try {
      const numericId = parseInt(id, 10);
      if (isNaN(numericId)) {
        throw new Error(`Invalid numeric ID: ${id}`);
      }
      
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: numericId,
            vector: embedding,
            payload: payload,
          },
        ],
      });
      console.log(`🧩 Chunk added to Qdrant: ${id}`);
    } catch (error: any) {
      console.error(`Error adding chunk ${id} to Qdrant: ${error.message}`);
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
