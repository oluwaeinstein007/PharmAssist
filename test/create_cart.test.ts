import { CreateCartTool } from '../src/tools/create_cart.js';
import { CreateCartService } from '../src/services/createCartService.js';

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 Starting Create Cart Tool Tests');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  // Patch CreateCartService.createCart to avoid network calls
  CreateCartService.prototype.createCart = async function (items) {
    console.log('[Test] createCart called with items:', JSON.stringify(items));
    return {
      success: true,
      cartId: 'test-cart-123',
      cartUrl: 'https://example.com/cart/test-cart-123',
    };
  } as any;

  // Test 1: Single item input
  try {
    console.log('📍 Test 1: Single item input');
    const result = await CreateCartTool.execute({ items: { barcode: '111222333', qty: 2 } as any });
    if (typeof result === 'string' && result.includes('Cart created successfully')) {
      console.log('✅ Passed single item test');
      passed++;
    } else {
      console.error('❌ Failed single item test: unexpected result', result);
      failed++;
    }
  } catch (error) {
    console.error('❌ Failed single item test with error:', error);
    failed++;
  }

  // Test 2: Multiple items input
  try {
    console.log('📍 Test 2: Multiple items input');
    const result = await CreateCartTool.execute({ items: [
      { barcode: 'aaa', qty: 1 },
      { barcode: 'bbb', qty: '3' },
    ] as any });

    if (typeof result === 'string' && result.includes('Cart created successfully') && result.includes('aaa') && result.includes('bbb')) {
      console.log('✅ Passed multiple items test');
      passed++;
    } else {
      console.error('❌ Failed multiple items test: unexpected result', result);
      failed++;
    }
  } catch (error) {
    console.error('❌ Failed multiple items test with error:', error);
    failed++;
  }

  console.log('\n========================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});