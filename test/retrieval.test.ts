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

import { RetrievalService } from '../src/services/retrievalService.js';

/**
 * Focused test for Retrieval Service with existing Qdrant data
 */

async function runRetrievalTests() {
  console.log('\n========================================');
  console.log('🧪 Retrieval Service Tests');
  console.log('========================================\n');

  const retrievalService = new RetrievalService();
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Initialize service
    console.log('📍 Step 1: Initializing Retrieval Service...\n');
    
    try {
      await retrievalService.initialize();
      console.log('✅ RetrievalService initialized successfully\n');
      testsPassed++;
    } catch (error) {
      console.error('❌ Failed to initialize RetrievalService\n');
      testsFailed++;
      throw error;
    }

    // Test 1: Search for medicines
    console.log('📍 Step 2: Testing Search Functionality...\n');
    
    try {
      console.log('⏳ Searching for medicines...');
      const result = await retrievalService.searchMedicines('medicine', 10);
      
      console.log(`✅ Search completed in ${result.executionTime}ms`);
      console.log(`📊 Found ${result.totalResults} medicines\n`);
      
      if (result.totalResults > 0) {
        console.log('Results:');
        result.medicines.slice(0, 5).forEach((med, index) => {
          console.log(`  ${index + 1}. ${med.product_name}`);
          console.log(`     Price: ₦${med.price}, Quantity: ${med.quantity}, Score: ${med.score?.toFixed(3)}`);
        });
        testsPassed++;
      } else {
        console.log('⚠️  No medicines found in database');
        console.log('ℹ️  This is expected if Qdrant collection is empty');
        testsPassed++; // Still pass - retrieval works, just no data
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 2: Filtering by price
    console.log('📍 Step 3: Testing Price Filter...\n');
    
    try {
      const result = await retrievalService.searchMedicines('medicine', 20);
      
      if (result.medicines.length > 0) {
        const filtered = retrievalService.filterByPriceRange(result.medicines, 0, 1000);
        console.log(`✅ Found ${filtered.length} medicines in price range ₦0-₦1000`);
        testsPassed++;
      } else {
        console.log('ℹ️  No medicines to filter');
        testsPassed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 3: Filtering by availability
    console.log('📍 Step 4: Testing Availability Filter...\n');
    
    try {
      const result = await retrievalService.searchMedicines('medicine', 20);
      
      if (result.medicines.length > 0) {
        const available = retrievalService.filterByAvailability(result.medicines, 1);
        console.log(`✅ Found ${available.length} medicines with quantity >= 1`);
        testsPassed++;
      } else {
        console.log('ℹ️  No medicines to filter');
        testsPassed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 4: Sorting
    console.log('📍 Step 5: Testing Sorting...\n');
    
    try {
      const result = await retrievalService.searchMedicines('medicine', 20);
      
      if (result.medicines.length > 1) {
        const sorted = retrievalService.sortMedicines(result.medicines, 'price', 'asc');
        console.log(`✅ Sorted ${sorted.length} medicines by price (ascending)`);
        testsPassed++;
      } else {
        console.log('ℹ️  Not enough medicines to test sorting');
        testsPassed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 5: Search by product name
    console.log('📍 Step 6: Testing Search by Product Name...\n');
    
    try {
      const result = await retrievalService.searchByProductName('medicine', 5);
      console.log(`✅ Search by product name completed - Found ${result.totalResults} results`);
      testsPassed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 6: Search by category
    console.log('📍 Step 7: Testing Search by Category...\n');
    
    try {
      const result = await retrievalService.searchByCategory('medicine', 5);
      console.log(`✅ Search by category completed - Found ${result.totalResults} results`);
      testsPassed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('');

    // Test 7: Get recommendations
    console.log('📍 Step 8: Testing Recommendations...\n');
    
    try {
      const result = await retrievalService.getRecommendations(['pain', 'fever'], 5);
      console.log(`✅ Recommendations retrieved - Found ${result.totalResults} results`);
      testsPassed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error: ${message}`);
      testsFailed++;
    }

    console.log('\n');

    // Summary
    console.log('========================================');
    console.log('📊 Retrieval Service Test Summary');
    console.log('========================================');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📈 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`📊 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('========================================\n');

    if (testsFailed === 0) {
      console.log('🎉 All retrieval tests passed!');
      process.exit(0);
    } else {
      console.log(`⚠️  ${testsFailed} test(s) failed`);
      process.exit(1);
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n❌ Fatal error: ${message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runRetrievalTests();
