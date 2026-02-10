import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

export class EmbeddingService {
  private anthropicClient?: Anthropic;
  private googleClient?: GoogleGenAI;
  private provider: 'anthropic' | 'google' | 'none';
  private embeddingModel: string = 'gemini-embedding-001';
  private embeddingDimensions: number = 3072;

  constructor() {
    const provider = process.env.EMBEDDING_PROVIDER || 'anthropic';
    this.provider = provider as 'anthropic' | 'google' | 'none';

    if (this.provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn('ANTHROPIC_API_KEY not set. Embeddings will not work with Anthropic provider.');
      } else {
        this.anthropicClient = new Anthropic({ apiKey });
      }
      this.embeddingModel = process.env.ANTHROPIC_EMBEDDING_MODEL || 'text-embedding-3-small';
      this.embeddingDimensions = parseInt(process.env.EMBEDDING_VECTOR_SIZE || '3072', 10);
    } else if (this.provider === 'google') {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('GOOGLE_API_KEY or GEMINI_API_KEY not set. Embeddings will not work with Google provider.');
      } else {
        this.googleClient = new GoogleGenAI({ apiKey });
      }
      this.embeddingModel = process.env.GOOGLE_EMBEDDING_MODEL || 'gemini-embedding-001';
      this.embeddingDimensions = parseInt(process.env.EMBEDDING_VECTOR_SIZE || '3072', 10);
    }

    console.log(`Embedding service initialized with provider: ${this.provider}`);
  }

  /**
   * Generate embedding for a given text using the configured provider
   * @param text The text to embed
   * @returns Array of embedding numbers
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.provider === 'none') {
      // Return a dummy embedding for testing purposes
      return this.generateDummyEmbedding(text);
    }

    if (this.provider === 'anthropic') {
      return this.generateAnthropicEmbedding(text);
    } else if (this.provider === 'google') {
      return this.generateGoogleEmbedding(text);
    }

    throw new Error(`Unknown embedding provider: ${this.provider}`);
  }

  /**
   * Generate embedding using Anthropic's API
   */
  private async generateAnthropicEmbedding(text: string): Promise<number[]> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized. Check your API key.');
    }

    try {
      // Note: Anthropic doesn't have a native embedding API in the current SDK
      // This is a placeholder - you may need to use a different approach or provider
      console.warn('Anthropic native embeddings not available. Using Google instead.');
      return this.generateGoogleEmbedding(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error generating Anthropic embedding: ${message}`);
      throw error;
    }
  }

  /**
   * Generate embedding using Google's API (@google/genai SDK — uses v1 endpoint)
   */
  private async generateGoogleEmbedding(text: string): Promise<number[]> {
    if (!this.googleClient) {
      throw new Error('Google client not initialized. Check your API key.');
    }

    try {
      const result = await this.googleClient.models.embedContent({
        model: this.embeddingModel,
        contents: text,
      });

      const embedding = result.embeddings?.[0]?.values;

      if (!embedding || embedding.length === 0) {
        throw new Error('Empty embedding returned from Google API');
      }

      console.log(`Embedding generated (${embedding.length} dimensions)`);
      return embedding;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error generating Google embedding: ${message}`);
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
