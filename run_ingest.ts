import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { IngestorService } from './src/services/ingestorService.js';

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
 * Run script to ingest all products without limit
 */
async function main() {
  console.log('🚀 Starting Product Ingestion...\n');
  
  const ingestorService = new IngestorService();
  
  try {
    // Initialize the service
    await ingestorService.initialize();
    
    // Ingest all products without limit (0 = unlimited)
    const result = await ingestorService.ingestAllProducts(0);
    
    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('📊 Ingestion Summary');
    console.log('='.repeat(60));
    console.log(`Total Products: ${result.totalProducts}`);
    console.log(`Successful: ${result.successful}`);
    console.log(`Failed: ${result.failed}`);
    console.log(`Message: ${result.message}`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Ingestion failed: ${message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
