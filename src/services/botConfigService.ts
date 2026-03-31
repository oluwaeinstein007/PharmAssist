// Fetches and caches /api/bot-config from the external MedPlus API.
// All contact info and links in the system prompt come from here — never hardcoded.

export interface BotContact {
  support_whatsapp: string;
  support_email: string;
  support_call: string;
  telehealth_whatsapp: string;
  telehealth_email: string;
  telehealth_call: string;
}

export interface BotLinks {
  privacy_policy: string;
  order_tracking: string;
  pharmacists: string;
}

export interface BotConfig {
  contact: BotContact;
  links: BotLinks;
}

// ── Fallback (used when API is unreachable) ────────────────────────────────

export const FALLBACK_BOT_CONFIG: BotConfig = {
  contact: {
    support_whatsapp: '08054022662',
    support_email: 'customercare@medplusng.com',
    support_call: '08054022662',
    telehealth_whatsapp: '08187122408',
    telehealth_email: 'telehealth@medplusng.com',
    telehealth_call: '08113590038',
  },
  links: {
    privacy_policy: 'https://medplusnig.com/privacy-policy',
    order_tracking: 'https://medplusnig.com/track-order',
    pharmacists: 'https://medplusnig.com/telemedicine',
  },
};

// ── Service ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class BotConfigService {
  private readonly baseUrl: string;
  private cachedConfig: BotConfig | null = null;
  private cacheExpiresAt = 0;

  constructor() {
    // BOT_API_BASE_URL takes priority; falls back to UNIFIED_PRODUCTS_BASE_URL
    this.baseUrl = (
      process.env.BOT_API_BASE_URL ||
      process.env.UNIFIED_PRODUCTS_BASE_URL ||
      ''
    ).replace(/\/$/, '');
  }

  async getConfig(): Promise<BotConfig> {
    if (this.cachedConfig && Date.now() < this.cacheExpiresAt) {
      return this.cachedConfig;
    }

    if (!this.baseUrl) {
      console.warn('[BotConfigService] BOT_API_BASE_URL not set — using fallback config');
      return FALLBACK_BOT_CONFIG;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/bot-config`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as BotConfig;
      this.cachedConfig = data;
      this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      console.log('[BotConfigService] Config loaded from API');
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BotConfigService] Failed to fetch config (${msg}) — using fallback`);
      return FALLBACK_BOT_CONFIG;
    }
  }

  /** Invalidate the cache (e.g. for testing or forced refresh) */
  invalidate(): void {
    this.cachedConfig = null;
    this.cacheExpiresAt = 0;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const botConfigService = new BotConfigService();
