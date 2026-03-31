// Calls the MedPlus Store Locations and Store Products APIs.
// Used by get_store_locations and search_store_products tools.

export interface StoreLocation {
  sid: string;
  name: string;
  store_address: string;
  state: string;
  local_govt: string;
  latitude: string;
  longitude: string;
}

export interface StoreProduct {
  id: number;
  product_name: string;
  barcode: string;
  price: string;
  dept: number;
  quantity: number;
  store_name: string;
  store_sid: string;
  category_name: string;
  category_slug: string;
  category_id: number;
  updated_at: string;
}

export interface StoreProductsResult {
  store_sid: string;
  data: StoreProduct[];
  next_page_url: string | null;
  per_page: number;
  from: number;
  to: number;
}

// ── Service ────────────────────────────────────────────────────────────────

export class StoreService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = (process.env.UNIFIED_PRODUCTS_BASE_URL || '').replace(/\/$/, '');
  }

  async getStoreLocations(): Promise<StoreLocation[]> {
    if (!this.baseUrl) {
      throw new Error('UNIFIED_PRODUCTS_BASE_URL is not configured');
    }

    const res = await fetch(`${this.baseUrl}/stores/locations`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Store locations API returned ${res.status}`);
    }

    const body = await res.json() as { success?: boolean; status?: string; data: StoreLocation[] };
    return body.data ?? [];
  }

  async getProductsByStore(
    sid: string,
    options: { search?: string; page?: number } = {},
  ): Promise<StoreProductsResult> {
    if (!this.baseUrl) {
      throw new Error('UNIFIED_PRODUCTS_BASE_URL is not configured');
    }

    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.page) params.set('page', String(options.page));
    const query = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(
      `${this.baseUrl}/products/stores/${encodeURIComponent(sid)}${query}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!res.ok) {
      throw new Error(`Store products API returned ${res.status}`);
    }

    const body = await res.json() as { success?: boolean; status?: string; data: StoreProductsResult };
    return body.data;
  }

  async getProductByBarcode(sid: string, barcode: string): Promise<StoreProduct | null> {
    if (!this.baseUrl) {
      throw new Error('UNIFIED_PRODUCTS_BASE_URL is not configured');
    }

    const res = await fetch(
      `${this.baseUrl}/products/stores/${encodeURIComponent(sid)}/${encodeURIComponent(barcode)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Store product API returned ${res.status}`);

    const body = await res.json() as { success?: boolean; status?: string; data: StoreProduct };
    return body.data;
  }
}
