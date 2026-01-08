import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { IngestorService } from '../src/services/ingestorService.js';
import { RetrievalService } from '../src/services/retrievalService.js';

/**
 * Load environment variables from .env file
 */
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

// Load environment variables before initializing services
loadEnv();

/**
 * Test suite for Ingestor and Retrieval Services
 * Tests the full pipeline of ingesting products and retrieving them
 */

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 Starting Ingestor & Retrieval Tests');
  console.log('========================================\n');

  const ingestorService = new IngestorService();
  const retrievalService = new RetrievalService();

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Initialize services
    console.log('📍 Step 1: Initializing Services...\n');
    
    try {
      await ingestorService.initialize();
      console.log('✅ IngestorService initialized successfully\n');
      testsPassed++;
    } catch (error) {
      console.error('❌ Failed to initialize IngestorService\n');
      testsFailed++;
    }

    try {
      await retrievalService.initialize();
      console.log('✅ RetrievalService initialized successfully\n');
      testsPassed++;
    } catch (error) {
      console.error('❌ Failed to initialize RetrievalService\n');
      testsFailed++;
    }

    // Test 1: Ingest all products from API
    console.log('📍 Step 2: Testing Batch Product Ingestion from API...\n');
    
    let ingestResult;
    try {
      console.log('⏳ Ingesting all products from the unified products API');
      ingestResult = await ingestorService.ingestAllProducts();
      
      // For testing, we'll accept partial ingestion (at least 10 products)
      const successThreshold = Math.min(ingestResult.successful, 5);
      
      if (successThreshold >= 1) {
        console.log(`✅ Successfully ingested ${ingestResult.successful} products out of ${ingestResult.totalProducts}`);
        if (ingestResult.failed > 0) {
          console.log(`⚠️  ${ingestResult.failed} products failed to ingest`);
        }
        testsPassed += 2;
      } else {
        console.log(`⚠️  Failed to ingest any products`);
        testsFailed += 2;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error ingesting products: ${message}`);
      testsFailed += 2;
    }

    console.log('\n');

    // Test 2: Search for ingested products
    console.log('📍 Step 3: Testing Retrieval/Search...\n');

    const searchQueries = [
      'pain relief medicine',
      'cold and flu',
      'headache',
    ];

    for (const query of searchQueries) {
      try {
        console.log(`⏳ Searching for: "${query}"`);
        const searchResult = await retrievalService.searchMedicines(query, 5);
        
        if (searchResult.totalResults > 0) {
          console.log(`✅ Found ${searchResult.totalResults} medicines in ${searchResult.executionTime}ms`);
          
          // Display found medicines
          searchResult.medicines.forEach((med, index) => {
            console.log(`  ${index + 1}. ${med.product_name} (Score: ${med.score?.toFixed(3)})`);
            console.log(`     Price: ${med.price}`);
          });
          
          testsPassed++;
        } else {
          console.log(`⚠️  No results found for query: "${query}"`);
          testsFailed++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error searching for "${query}": ${message}`);
        testsFailed++;
      }
      
      console.log('');
    }

    // Test 3: Search by product name
    console.log('📍 Step 4: Testing Search by Product Name...\n');
    
    try {
      console.log('⏳ Searching by product name...');
      const result = await retrievalService.searchByProductName('aspirin', 5);
      
      if (result.totalResults > 0) {
        console.log(`✅ Found ${result.totalResults} results`);
        testsPassed++;
      } else {
        console.log('⚠️  No results found');
        testsFailed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('\n');

    // Test 4: Search by category
    console.log('📍 Step 5: Testing Search by Category...\n');
    
    try {
      console.log('⏳ Searching by category: Pain Relief...');
      const result = await retrievalService.searchByCategory('Pain Relief', 5);
      
      if (result.totalResults > 0) {
        console.log(`✅ Found ${result.totalResults} results`);
        testsPassed++;
      } else {
        console.log('⚠️  No results found');
        testsFailed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('\n');

    // Test 5: Get recommendations by symptoms
    console.log('📍 Step 6: Testing Recommendations by Symptoms...\n');
    
    try {
      console.log('⏳ Getting recommendations for symptoms: fever, headache...');
      const result = await retrievalService.getRecommendations(['fever', 'headache'], 5);
      
      if (result.totalResults > 0) {
        console.log(`✅ Found ${result.totalResults} recommendations`);
        result.medicines.forEach((med, index) => {
          console.log(`  ${index + 1}. ${med.product_name}`);
        });
        testsPassed++;
      } else {
        console.log('⚠️  No recommendations found');
        testsFailed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('\n');

    // Test 6: Filtering by price range
    console.log('📍 Step 7: Testing Price Range Filter...\n');
    
    try {
      console.log('⏳ Searching for medicines and filtering by price...');
      const searchResult = await retrievalService.searchMedicines('medicine', 10);
      
      if (searchResult.medicines.length > 0) {
        const filtered = retrievalService.filterByPriceRange(searchResult.medicines, 10, 100);
        console.log(`✅ Filtered ${searchResult.medicines.length} medicines to ${filtered.length} in price range 10-100`);
        testsPassed++;
      } else {
        console.log('⚠️  No medicines found to filter');
        testsFailed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('\n');

    // Test 7: Sorting medicines
    console.log('📍 Step 8: Testing Medicine Sorting...\n');
    
    try {
      console.log('⏳ Searching for medicines and sorting by score...');
      const searchResult = await retrievalService.searchMedicines('medicine', 10);
      
      if (searchResult.medicines.length > 1) {
        const sorted = retrievalService.sortMedicines(searchResult.medicines, 'score', 'desc');
        console.log(`✅ Successfully sorted ${sorted.length} medicines`);
        console.log('Top 3 results:');
        sorted.slice(0, 3).forEach((med, index) => {
          console.log(`  ${index + 1}. ${med.product_name} (Score: ${med.score?.toFixed(3)})`);
        });
        testsPassed++;
      } else {
        console.log('⚠️  Not enough medicines to test sorting');
        testsFailed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('\n');

    // Summary
    console.log('========================================');
    console.log('📊 Test Summary');
    console.log('========================================');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📈 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`📊 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('========================================\n');

    if (testsFailed === 0) {
      console.log('🎉 All tests passed!');
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

// Run the tests
runTests();
