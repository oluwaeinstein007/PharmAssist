import { GoogleGenAI } from '@google/genai';

export class EmbeddingService {
  private googleClient?: GoogleGenAI;
  private provider: 'anthropic' | 'google' | 'none';
  private embeddingModel: string = 'gemini-embedding-001';

  constructor() {
    const provider = process.env.EMBEDDING_PROVIDER || 'anthropic';
    this.provider = provider as 'anthropic' | 'google' | 'none';

    // Both 'anthropic' and 'google' providers use Google's embedding API
    // (Anthropic has no native embedding endpoint)
    if (this.provider === 'anthropic' || this.provider === 'google') {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('GOOGLE_API_KEY or GEMINI_API_KEY not set. Embeddings will not work.');
      } else {
        this.googleClient = new GoogleGenAI({ apiKey });
      }
      this.embeddingModel = process.env.GOOGLE_EMBEDDING_MODEL || 'gemini-embedding-001';
    }

    console.log(`Embedding service initialized with provider: ${this.provider}`);
  }

  /**
   * Generate embedding for a single text. Delegates to generateBatchEmbeddings.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateBatchEmbeddings([text]);
    return results[0];
  }

  /**
   * Generate embeddings for multiple texts in a single API call.
   * @param texts Array of texts to embed
   * @returns Array of embedding vectors, in the same order as input
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    if (this.provider === 'none') {
      return texts.map(t => this.generateDummyEmbedding(t));
    }

    if (this.provider === 'anthropic' || this.provider === 'google') {
      return this.generateGoogleBatchEmbeddings(texts);
    }

    throw new Error(`Unknown embedding provider: ${this.provider}`);
  }

  /**
   * Generate embeddings for multiple texts using Google's embedContent API.
   * The API supports ContentListUnion (array of strings) and returns one embedding per content.
   */
  private async generateGoogleBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.googleClient) {
      throw new Error('Google client not initialized. Check your API key.');
    }

    try {
      const result = await this.googleClient.models.embedContent({
        model: this.embeddingModel,
        contents: texts as any,
      });

      const embeddings = result.embeddings;

      if (!embeddings || embeddings.length === 0) {
        throw new Error('Empty embeddings returned from Google API');
      }

      if (embeddings.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${embeddings.length}`);
      }

      console.log(`Batch of ${embeddings.length} embeddings generated (${embeddings[0]?.values?.length ?? 0} dims each)`);
      return embeddings.map(e => {
        if (!e.values || e.values.length === 0) throw new Error('Empty embedding in batch result');
        return e.values;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error generating Google batch embeddings: ${message}`);
      throw error;
    }
  }

  /**
   * Generate a deterministic dummy embedding based on text hash
   * Useful for testing without API calls
   */
  private generateDummyEmbedding(text: string): number[] {
    const vectorSize = parseInt(process.env.EMBEDDING_VECTOR_SIZE || '3072', 10);
    const hash = this.hashString(text);
    
    const embedding: number[] = [];
    for (let i = 0; i < vectorSize; i++) {
      const seed = hash + i;
      embedding.push(Math.sin(seed) * Math.cos(seed + 1));
    }

    // Normalize the vector
    return this.normalizeVector(embedding);
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Normalize vector to unit length
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map(val => val / magnitude);
  }
}
