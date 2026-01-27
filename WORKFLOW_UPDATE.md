# PharmAssist Workflow Update - January 27, 2026

## Overview
Updated the PharmAssist system to implement a streamlined workflow where:
1. User searches for medicines
2. Frontend automatically shows "Select & Order" buttons with barcodes
3. User selects a product and enters quantity
4. System creates cart automatically without asking for barcode

## Changes Made

### 1. Backend Services

#### CheckStockService.ts
- **Changed from**: Simple logging service
- **Changed to**: Real API client that fetches stock data using medicine_barcode
- **URL Pattern**: `${apiBaseUrl}/products/unified/{medicine_barcode}`
- **Returns**: Product details including price, quantity, category

#### RetrievalService.ts
- Added `barcode` field to `RetrievedMedicine` interface
- Updated `searchMedicines()` to include barcode in results
- Updated `getMedicineById()` to include barcode in results

### 2. Tools

#### search_meds.ts
- Updated output format to include barcode for each medicine
- Barcode now displayed prominently in search results

#### check_stock.ts
- Updated to use new `CheckStockService.checkStock()` method
- Now fetches real availability data from API using barcode
- Returns formatted stock information with product details

### 3. API Route (route.ts)

#### Gemini Tool Definition
- Changed `check_stock` parameter from `medicine_id` to `medicine_barcode`
- Updated description to reflect barcode usage

#### System Instruction
- Completely rewritten to guide the assistant to:
  - Always include barcode in search results
  - NOT ask for barcode repeatedly
  - Use barcodes from search results when creating carts
  - Let frontend handle product selection UI

### 4. Frontend Chat Component (Chat.tsx)

#### Complete Redesign - NEW WORKFLOW
The component now implements a 3-step interactive workflow:

**Step 1: Search**
- User types a search query
- Assistant returns medicines with barcodes and pricing
- Frontend automatically extracts product data

**Step 2: Select & Order**
- Green "Select & Order" buttons appear for each search result
- User clicks a button to select a product
- Selected product info displayed in a blue panel below

**Step 3: Confirm Order**
- User enters quantity (with max validation)
- User clicks "Confirm" button
- System automatically calls create_cart with barcode + quantity
- No manual barcode entry needed

#### New State Management
```typescript
interface SelectedProduct {
  barcode: string;
  name: string;
  price: number;
  quantity: number;
}
```

#### New Features
- `selectedProduct` state - stores currently selected medicine
- `quantityInput` state - stores user-entered quantity
- `handleSelectProduct()` - called when user clicks product button
- `handleConfirmOrder()` - validates and creates cart
- `handleCancelSelection()` - cancels current selection
- Product extraction logic to parse barcodes from assistant responses

#### UI Improvements
- Welcome message simplified to 3-step workflow
- Product selection buttons show medicine name and price
- Selection panel shows full product details
- Quantity input with validation (min 1, max available)
- Cancel button to go back
- Clear visual feedback at each step

## User Experience Flow

```
User Input: "Find paracetamol"
           ↓
[Assistant searches and returns results with barcodes]
           ↓
[Frontend shows "Select & Order" buttons with prices]
           ↓
User clicks product button
           ↓
[Product selected, quantity panel appears]
           ↓
User enters quantity
           ↓
User clicks "Confirm"
           ↓
[System creates cart with barcode + quantity]
           ↓
[Order confirmation shown]
```

## Benefits

1. **Simplified UX** - Users don't need to manually enter barcodes
2. **Fewer Steps** - Direct path from search to order
3. **Better Data Flow** - Barcodes flow automatically through system
4. **Intelligent Assistant** - Clear instructions prevent repetitive barcode requests
5. **Interactive Buttons** - Visual product selection with instant feedback

## Files Modified

1. `src/services/checkStockService.ts` - API implementation
2. `src/services/retrievalService.ts` - Added barcode support
3. `src/tools/search_meds.ts` - Display barcodes in results
4. `src/tools/check_stock.ts` - Use new service method
5. `frontend/src/app/api/chat/route.ts` - Updated system instruction
6. `frontend/src/components/Chat.tsx` - Complete rewrite with new workflow

## Testing Checklist

- [ ] Search returns medicines with barcodes
- [ ] Select & Order buttons appear for each product
- [ ] Clicking button shows product selection panel
- [ ] Quantity input validates correctly
- [ ] Confirm creates cart without asking for barcode
- [ ] Cancel button closes selection panel
- [ ] Can search again after ordering
- [ ] Error handling for invalid quantities
