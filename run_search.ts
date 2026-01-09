import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { RetrievalService } from './src/services/retrievalService.js';

/**
 * Load environment variables from .env file
 */
function loadEnv() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, '.env');

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
 * Run script to test retrieval functionality
 */
async function main() {
  console.log('🚀 Starting Retrieval Testing...\n');
  
  const retrievalService = new RetrievalService();
  
  // Test queries
  const testQueries = [
    'paracetamol',
    'antibiotics',
    'cough syrup',
    'blood pressure medication',
    'diabetes care',
    'pregnant care',
    'malaria treatment',
    'pain relief',
    'vitamins and supplements',
    'allergy medicine'
  ];
  
  try {
    // Initialize the service
    await retrievalService.initialize();
    
    console.log('='.repeat(60));
    console.log('🔍 Running Search Tests');
    console.log('='.repeat(60) + '\n');
    
    // Run searches
    for (const query of testQueries) {
      console.log(`\n📌 Testing Query: "${query}"`);
      console.log('-'.repeat(60));
      
      const result = await retrievalService.searchMedicines(query, 5);
      
      console.log(`✅ Results: ${result.totalResults} medicines found in ${result.executionTime}ms`);
      
      if (result.medicines.length > 0) {
        result.medicines.forEach((medicine, index) => {
          console.log(`  ${index + 1}. ${medicine.product_name} - Price: ₦${medicine.price}, Qty: ${medicine.quantity}, Score: ${medicine.score.toFixed(4)}`);
        });
      } else {
        console.log('  No medicines found for this query');
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Retrieval Testing Complete');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Retrieval testing failed: ${message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
