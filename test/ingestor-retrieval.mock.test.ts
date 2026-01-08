import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
function loadEnv() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, '../.env');

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');

      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

import { RetrievalService, RetrievedMedicine } from '../src/services/retrievalService.js';
import { QdrantService } from '../src/storage/qdrantService.js';

/**
 * Mock test suite for Ingestor and Retrieval Services
 * Tests using mock data to validate the core functionality
 */

async function runMockTests() {
  console.log('\n========================================');
  console.log('🧪 Running Mock Data Tests');
  console.log('========================================\n');

  const retrievalService = new RetrievalService();
  const qdrantService = new QdrantService();

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Initialize services
    console.log('📍 Step 1: Initializing Services...\n');
    
    try {
      await retrievalService.initialize();
      console.log('✅ RetrievalService initialized successfully\n');
      testsPassed++;
    } catch (error) {
      console.error('❌ Failed to initialize RetrievalService\n');
      testsFailed++;
    }

    // Add mock medicines to Qdrant for testing
    console.log('📍 Step 2: Adding Mock Medicines to Qdrant...\n');
    
    const mockMedicines = [
      {
        id: 'mock_001',
        product_name: 'Aspirin 500mg',
        price: 45,
        quantity: 100,
        category_name: 'Pain Relief',
        category_slug: 'pain-relief',
        category_id: 1,
      },
      {
        id: 'mock_002',
        product_name: 'Paracetamol 500mg',
        price: 35,
        quantity: 150,
        category_name: 'Pain Relief',
        category_slug: 'pain-relief',
        category_id: 1,
      },
      {
        id: 'mock_003',
        product_name: 'Ibuprofen 200mg',
        price: 55,
        quantity: 80,
        category_name: 'Pain Relief',
        category_slug: 'pain-relief',
        category_id: 1,
      },
      {
        id: 'mock_004',
        product_name: 'Cough Syrup',
        price: 65,
        quantity: 60,
        category_name: 'Cold & Flu',
        category_slug: 'cold-flu',
        category_id: 2,
      },
      {
        id: 'mock_005',
        product_name: 'Antihistamine Tablet',
        price: 40,
        quantity: 120,
        category_name: 'Cold & Flu',
        category_slug: 'cold-flu',
        category_id: 2,
      },
    ];

    // Generate dummy embeddings and add to Qdrant
    const embeddingSize = parseInt(process.env.EMBEDDING_VECTOR_SIZE || '768', 10);
    
    for (const medicine of mockMedicines) {
      try {
        // Generate a simple hash-based embedding for consistent testing
        const embedding = generateDeterministicEmbedding(medicine.product_name, embeddingSize);
        
        const payload = {
          product_name: medicine.product_name,
          barcode: medicine.barcode,
          price: medicine.price,
          quantity: medicine.quantity,
          category_name: medicine.category_name,
          category_slug: medicine.category_slug,
          category_id: medicine.category_id,
          price_updated_at: new Date().toISOString(),
          ingested_at: new Date().toISOString(),
        };

        await qdrantService.addChunk(medicine.id, embedding, payload);
        console.log(`✅ Added mock medicine: ${medicine.product_name}`);
        testsPassed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Failed to add mock medicine: ${message}`);
        testsFailed++;
      }
    }

    console.log('\n');

    // Test 1: Search for pain relief medicines
    console.log('📍 Step 3: Testing Search Functionality...\n');
    
    try {
      console.log('⏳ Searching for pain relief medicines...');
      const result = await retrievalService.searchMedicines('pain relief', 5);
      
      if (result.totalResults > 0) {
        console.log(`✅ Found ${result.totalResults} pain relief medicines`);
        result.medicines.forEach((med, index) => {
          console.log(`  ${index + 1}. ${med.product_name} - ₦${med.price}`);
        });
        testsPassed++;
      } else {
        console.log('⚠️  No pain relief medicines found');
        testsFailed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 2: Test price filtering
    console.log('📍 Step 4: Testing Price Filter...\n');
    
    try {
      console.log('⏳ Searching for medicines and filtering by price (40-60)...');
      const result = await retrievalService.searchMedicines('medicine', 20);
      
      if (result.medicines.length > 0) {
        const filtered = retrievalService.filterByPriceRange(result.medicines, 40, 60);
        console.log(`✅ Found ${filtered.length} medicines in price range ₦40-₦60`);
        
        if (filtered.length > 0) {
          filtered.forEach((med, index) => {
            console.log(`  ${index + 1}. ${med.product_name} - ₦${med.price}`);
          });
          testsPassed++;
        } else {
          console.log('⚠️  No medicines in the specified price range');
          testsFailed++;
        }
      } else {
        console.log('⚠️  No medicines found');
        testsFailed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 3: Test availability filter
    console.log('📍 Step 5: Testing Availability Filter...\n');
    
    try {
      console.log('⏳ Searching for medicines and filtering by availability...');
      const result = await retrievalService.searchMedicines('medicine', 20);
      
      if (result.medicines.length > 0) {
        const available = retrievalService.filterByAvailability(result.medicines, 100);
        console.log(`✅ Found ${available.length} medicines with quantity >= 100`);
        
        if (available.length > 0) {
          available.forEach((med, index) => {
            console.log(`  ${index + 1}. ${med.product_name} - Stock: ${med.quantity}`);
          });
          testsPassed++;
        } else {
          console.log('ℹ️  No medicines with sufficient stock');
          testsFailed++;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 4: Test sorting functionality
    console.log('📍 Step 6: Testing Sorting Functionality...\n');
    
    try {
      console.log('⏳ Searching and sorting by price (ascending)...');
      const result = await retrievalService.searchMedicines('medicine', 20);
      
      if (result.medicines.length > 1) {
        const sortedByPrice = retrievalService.sortMedicines(result.medicines, 'price', 'asc');
        console.log(`✅ Sorted ${sortedByPrice.length} medicines by price (ascending)`);
        
        sortedByPrice.slice(0, 3).forEach((med, index) => {
          console.log(`  ${index + 1}. ${med.product_name} - ₦${med.price}`);
        });
        testsPassed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 5: Test category search
    console.log('📍 Step 7: Testing Category Search...\n');
    
    try {
      console.log('⏳ Searching for Cold & Flu medicines...');
      const result = await retrievalService.searchByCategory('Cold & Flu', 10);
      
      if (result.totalResults > 0) {
        console.log(`✅ Found ${result.totalResults} Cold & Flu medicines`);
        result.medicines.forEach((med, index) => {
          console.log(`  ${index + 1}. ${med.product_name}`);
        });
        testsPassed++;
      } else {
        console.log('⚠️  No Cold & Flu medicines found');
        testsFailed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 6: Test combined filtering
    console.log('📍 Step 8: Testing Combined Filtering (Price + Availability + Sorting)...\n');
    
    try {
      console.log('⏳ Complex filtering: Price ₦30-₦60, Stock >= 50, sorted by availability...');
      const result = await retrievalService.searchMedicines('medicine', 20);
      
      if (result.medicines.length > 0) {
        let filtered = retrievalService.filterByPriceRange(result.medicines, 30, 60);
        filtered = retrievalService.filterByAvailability(filtered, 50);
        const sorted = retrievalService.sortMedicines(filtered, 'quantity', 'desc');
        
        console.log(`✅ Found ${sorted.length} medicines matching all criteria`);
        
        if (sorted.length > 0) {
          sorted.forEach((med, index) => {
            console.log(`  ${index + 1}. ${med.product_name} - ₦${med.price}, Stock: ${med.quantity}`);
          });
          testsPassed++;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('\n');

    // Summary
    console.log('========================================');
    console.log('📊 Mock Test Summary');
    console.log('========================================');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📈 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`📊 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('========================================\n');

    if (testsFailed === 0) {
      console.log('🎉 All mock tests passed!');
      process.exit(0);
    } else {
      console.log(`⚠️  ${testsFailed} test(s) failed`);
      process.exit(1);
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n❌ Fatal error during testing: ${message}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Generate a deterministic embedding based on text for consistent testing
 */
function generateDeterministicEmbedding(text: string, size: number): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const embedding: number[] = [];
  let seed = Math.abs(hash);

  for (let i = 0; i < size; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    embedding.push((seed / 233280) * 2 - 1);
  }

  return embedding;
}

// Run the tests
runMockTests();
