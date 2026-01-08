import { EmbeddingService } from './embeddingService.js';
import { QdrantService } from '../storage/qdrantService.js';

export interface RetrievedMedicine {
  id: string;
  product_name: string;
  price: number;
  quantity: number;
  category_name: string;
  category_slug: string;
  category_id: number;
  price_updated_at: string;
  ingested_at: string;
  score: number;
}

export interface SearchResult {
  query: string;
  medicines: RetrievedMedicine[];
  totalResults: number;
  executionTime: number;
}

export class RetrievalService {
  private embeddingService: EmbeddingService;
  private qdrantService: QdrantService;

  constructor() {
    this.embeddingService = new EmbeddingService();
    this.qdrantService = new QdrantService();
  }

  /**
   * Initialize the retrieval service and Qdrant connection
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing RetrievalService...');
    try {
      await this.qdrantService.initialize();
      console.log('✅ RetrievalService initialized successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to initialize RetrievalService: ${message}`);
      throw error;
    }
  }

  /**
   * Search for medicines by name or description
   * @param query The search query (medicine name, symptom, condition, etc.)
   * @param limit Maximum number of results to return
   * @returns Array of matching medicines
   */
  async searchMedicines(query: string, limit: number = 5): Promise<SearchResult> {
    const startTime = Date.now();
    try {
      console.log(`🔍 Searching for medicines: "${query}" (limit: ${limit})`);

      // Step 1: Generate embedding for the query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      console.log(`✅ Query embedding generated`);

      // Step 2: Search in Qdrant
      const searchResults = await this.qdrantService.search(queryEmbedding, limit);
      console.log(`✅ Found ${searchResults.length} results in Qdrant`);

      // Step 3: Transform results to RetrievedMedicine format
      const medicines: RetrievedMedicine[] = searchResults.map((result: any) => ({
        id: String(result.id),
        product_name: result.payload?.product_name || 'Unknown',
        price: result.payload?.price || 0,
        quantity: result.payload?.quantity || 0,
        category_name: result.payload?.category_name || 'Unknown',
        category_slug: result.payload?.category_slug || 'unknown',
        category_id: result.payload?.category_id || 0,
        price_updated_at: result.payload?.price_updated_at || new Date().toISOString(),
        ingested_at: result.payload?.ingested_at || new Date().toISOString(),
        score: result.score || 0,
      }));

      const executionTime = Date.now() - startTime;
      console.log(`✅ Search completed in ${executionTime}ms`);

      return {
        query,
        medicines,
        totalResults: medicines.length,
        executionTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error searching medicines: ${message}`);
      return {
        query,
        medicines: [],
        totalResults: 0,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Search for medicines by exact product name
   * @param productName The product name to search for
   * @param limit Maximum number of results
   * @returns Array of matching medicines
   */
  async searchByProductName(productName: string, limit: number = 5): Promise<SearchResult> {
    console.log(`🔍 Searching for medicine by product name: "${productName}"`);
    return this.searchMedicines(productName, limit);
  }

  /**
   * Search for medicines by category
   * @param category The category name (e.g., "Pain Relief", "Cold & Flu")
   * @param limit Maximum number of results
   * @returns Array of matching medicines
   */
  async searchByCategory(category: string, limit: number = 10): Promise<SearchResult> {
    console.log(`🔍 Searching for medicines in category: "${category}"`);
    const query = `medicines in ${category} category`;
    return this.searchMedicines(query, limit);
  }

  /**
   * Get detailed information about a specific medicine
   * @param medicineId The ID of the medicine
   * @returns The medicine details or null if not found
   */
  async getMedicineById(medicineId: string): Promise<RetrievedMedicine | null> {
    try {
      console.log(`📖 Fetching medicine details for ID: ${medicineId}`);

      // Note: Qdrant doesn't have a direct "get by ID" method for all types
      // This is a placeholder implementation. In production, you might want to:
      // 1. Store a separate index/mapping of IDs
      // 2. Use scroll/retrieve functionality if available
      // 3. Query with a filter on the ID field

      // For now, we'll do a simple search that returns the medicine if it exists
      const results = await this.qdrantService.search(
        this.generateDummyVector(),
        1000
      );

      const medicine = results.find((r: any) => String(r.id) === medicineId);
      if (!medicine) {
        console.log(`⚠️  Medicine not found: ${medicineId}`);
        return null;
      }

      return {
        id: String(medicine.id),
        product_name: medicine.payload?.product_name || 'Unknown',
        price: medicine.payload?.price || 0,
        quantity: medicine.payload?.quantity || 0,
        category_name: medicine.payload?.category_name || 'Unknown',
        category_slug: medicine.payload?.category_slug || 'unknown',
        category_id: medicine.payload?.category_id || 0,
        price_updated_at: medicine.payload?.price_updated_at || new Date().toISOString(),
        ingested_at: medicine.payload?.ingested_at || new Date().toISOString(),
        score: medicine.score || 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error fetching medicine details: ${message}`);
      return null;
    }
  }

  /**
   * Get recommendations based on symptoms
   * @param symptoms Array of symptoms or condition descriptions
   * @param limit Maximum number of recommendations
   * @returns Array of recommended medicines
   */
  async getRecommendations(symptoms: string[], limit: number = 5): Promise<SearchResult> {
    const query = symptoms.join(', ');
    console.log(`💊 Getting medicine recommendations for symptoms: ${query}`);
    return this.searchMedicines(query, limit);
  }

  /**
   * Filter results by price range
   * @param medicines Array of medicines to filter
   * @param minPrice Minimum price
   * @param maxPrice Maximum price
   * @returns Filtered array of medicines
   */
  filterByPriceRange(
    medicines: RetrievedMedicine[],
    minPrice: number = 0,
    maxPrice: number = Number.MAX_VALUE
  ): RetrievedMedicine[] {
    return medicines.filter(
      medicine => medicine.price >= minPrice && medicine.price <= maxPrice
    );
  }

  /**
   * Filter results by quantity available
   * @param medicines Array of medicines to filter
   * @param minQuantity Minimum quantity available
   * @returns Filtered array with quantity >= minQuantity
   */
  filterByAvailability(
    medicines: RetrievedMedicine[],
    minQuantity: number = 1
  ): RetrievedMedicine[] {
    return medicines.filter(medicine => medicine.quantity >= minQuantity);
  }

  /**
   * Sort medicines by a specific field
   * @param medicines Array of medicines to sort
   * @param sortBy Field to sort by (price, score, quantity)
   * @param order Sort order (asc or desc)
   * @returns Sorted array
   */
  sortMedicines(
    medicines: RetrievedMedicine[],
    sortBy: 'price' | 'score' | 'quantity' = 'score',
    order: 'asc' | 'desc' = 'desc'
  ): RetrievedMedicine[] {
    const sorted = [...medicines].sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      return order === 'desc' ? Number(bValue) - Number(aValue) : Number(aValue) - Number(bValue);
    });
    return sorted;
  }

  /**
   * Generate a dummy vector for Qdrant search
   * Used when we need to retrieve results without a specific query embedding
   */
  private generateDummyVector(): number[] {
    const vectorSize = parseInt(process.env.EMBEDDING_VECTOR_SIZE || '1536', 10);
    return Array(vectorSize).fill(0);
  }
}
