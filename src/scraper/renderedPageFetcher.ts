import { readLimitedText } from '../services/safeUrl';

export type RenderProvider = 'scraperapi' | 'scrapingbee' | 'brightdata';
export type RenderFailureCode =
  | 'RENDER_PROVIDER_NOT_CONFIGURED'
  | 'RENDER_TIMEOUT'
  | 'RENDER_RATE_LIMITED'
  | 'RENDER_ACCESS_DENIED'
  | 'RENDER_UPSTREAM_ERROR'
  | 'RENDER_INVALID_RESPONSE';

export interface RenderedPageResult {
  html: string;
  provider: RenderProvider;
}

export class RenderedPageError extends Error {
  constructor(public readonly code: RenderFailureCode, public readonly provider?: RenderProvider) {
    super(code);
    this.name = 'RenderedPageError';
  }
}

interface ProviderRequest {
  provider: RenderProvider;
  url: string;
  init: RequestInit;
}

function countryCode(): string {
  return /^[a-z]{2}$/i.test(process.env.AYROVIX_SCRAPER_COUNTRY || '')
    ? String(process.env.AYROVIX_SCRAPER_COUNTRY).toLowerCase()
    : 'fr';
}

function timeoutMs(): number {
  const configured = Number(process.env.AYROVIX_RENDER_TIMEOUT_MS || 18_000);
  return Number.isFinite(configured) ? Math.min(45_000, Math.max(5_000, configured)) : 18_000;
}

function providerOrder(): RenderProvider[] {
  const preferred = String(process.env.AYROVIX_RENDER_PROVIDER || 'auto').trim().toLowerCase();
  const available: RenderProvider[] = [];
  if (process.env.SCRAPERAPI_KEY?.trim()) available.push('scraperapi');
  if (process.env.SCRAPINGBEE_API_KEY?.trim()) available.push('scrapingbee');
  if (process.env.BRIGHTDATA_API_TOKEN?.trim() && process.env.BRIGHTDATA_UNLOCKER_ZONE?.trim()) available.push('brightdata');
  if (preferred !== 'auto' && available.includes(preferred as RenderProvider)) {
    return [preferred as RenderProvider, ...available.filter((item) => item !== preferred)];
  }
  return available;
}

function requestFor(provider: RenderProvider, targetUrl: string): ProviderRequest {
  const country = countryCode();
  if (provider === 'scraperapi') {
    const params = new URLSearchParams({
      api_key: String(process.env.SCRAPERAPI_KEY),
      url: targetUrl,
      render: 'true',
      country_code: country,
    });
    if (process.env.AYROVIX_SCRAPER_PREMIUM === 'true') params.set('premium', 'true');
    return {
      provider,
      url: `https://api.scraperapi.com/?${params}`,
      init: { method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } },
    };
  }
  if (provider === 'scrapingbee') {
    const params = new URLSearchParams({
      api_key: String(process.env.SCRAPINGBEE_API_KEY),
      url: targetUrl,
      render_js: 'true',
      country_code: country,
      block_resources: 'false',
      wait: '1500',
    });
    if (process.env.AYROVIX_SCRAPINGBEE_STEALTH === 'true') params.set('stealth_proxy', 'true');
    else params.set('premium_proxy', 'true');
    return {
      provider,
      url: `https://app.scrapingbee.com/api/v1/?${params}`,
      init: { method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } },
    };
  }
  return {
    provider,
    url: 'https://api.brightdata.com/request',
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${String(process.env.BRIGHTDATA_API_TOKEN)}`,
        'Content-Type': 'application/json',
        Accept: 'text/html,application/xhtml+xml',
      },
      body: JSON.stringify({
        zone: String(process.env.BRIGHTDATA_UNLOCKER_ZONE),
        url: targetUrl,
        format: 'raw',
      }),
    },
  };
}

function failureForStatus(status: number): RenderFailureCode {
  if (status === 401 || status === 403) return 'RENDER_ACCESS_DENIED';
  if (status === 429) return 'RENDER_RATE_LIMITED';
  return status >= 500 ? 'RENDER_UPSTREAM_ERROR' : 'RENDER_INVALID_RESPONSE';
}

export function renderedProviderReady(): boolean {
  return providerOrder().length > 0;
}

/** Target URL is resolved and SSRF-validated by SmartLinkScraper before this function is called. */
export async function fetchRenderedProductPage(targetUrl: string): Promise<RenderedPageResult> {
  const providers = providerOrder();
  if (!providers.length) throw new RenderedPageError('RENDER_PROVIDER_NOT_CONFIGURED');
  let lastError: RenderedPageError | null = null;
  for (const provider of providers) {
    const request = requestFor(provider, targetUrl);
    try {
      const response = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(timeoutMs()) });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        lastError = new RenderedPageError(failureForStatus(response.status), provider);
        continue;
      }
      const html = await readLimitedText(response, 3_000_000);
      if (!html.trim() || !/<(?:html|body|script|meta)\b/i.test(html)) {
        lastError = new RenderedPageError('RENDER_INVALID_RESPONSE', provider);
        continue;
      }
      return { html, provider };
    } catch (error: any) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      lastError = new RenderedPageError(timeout ? 'RENDER_TIMEOUT' : 'RENDER_UPSTREAM_ERROR', provider);
    }
  }
  throw lastError || new RenderedPageError('RENDER_UPSTREAM_ERROR');
}
