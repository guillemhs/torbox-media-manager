/**
 * NZBGeek Newznab API client.
 *
 * Connects to https://api.nzbgeek.info/ using the configured NZBGEEK_API_KEY.
 * Implements the Newznab API for searching and downloading NZB files.
 *
 * Dynamic IP resilience:
 *   - NZBGeek whitelists client IPs. On DIGI Mobil (dynamic IP), the whitelisted
 *     IP may change. The client logs the observed egress IP on every request so
 *     operators can update the NZBGeek whitelist when it moves.
 *   - Retries with exponential backoff on transient failures (429, 5xx, network).
 */


export interface NzbgeekConfig {
  host: string;
  apiKey: string;
  whitelistIp?: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
}

export interface NzbgeekResult {
  id: string;
  guid: string;
  title: string;
  size?: number;
  posted?: number;
  complete?: boolean;
  groups?: string[];
  category?: string;
  source: 'NZBGeek';
}

export interface NzbgeekSearchResponse {
  total: number;
  offset: number;
  limit: number;
  results: NzbgeekResult[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function log(message: string, meta?: Record<string, unknown>): void {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[NZBGeek] ${nowIso()} ${message}${payload}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NzbgeekClient {
  private readonly host: string;
  private readonly apiKey: string;
  private readonly whitelistIp?: string;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: NzbgeekConfig) {
    this.host = config.host.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.whitelistIp = config.whitelistIp;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /** Log the configured whitelist IP reference for dynamic IP tracking. */
  logWhitelistReference(): void {
    if (this.whitelistIp) {
      log('Whitelist IP reference configured', { whitelistIp: this.whitelistIp });
    } else {
      log('No whitelist IP reference configured; set NZBGEEK_WHITELIST_IP if your DIGI Mobil IP is whitelisted on NZBGeek.');
    }
  }

  private async fetchWithRetry(path: string, params: Record<string, string>, retriesLeft: number): Promise<Response> {
    const url = new URL(`${this.host}${path}`);
    url.searchParams.set('apikey', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    let lastError: unknown = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        clearTimeout(timeout);
        const response = await fetch(url.toString(), {
          headers: { Accept: 'application/xml, application/json, */*' },
          signal: controller.signal,
        });

        log(`${response.status} ${response.statusText}`, {
          path,
          attempt: attempt + 1,
          query: params.q ?? params.id ?? '(n/a)',
        });

        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`NZBGeek returned HTTP ${response.status}`);
          const backoff = Math.min(1000 * 2 ** attempt, 10_000);
          await sleep(backoff);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`NZBGeek request timed out after ${this.requestTimeoutMs}ms`);
        }
        const backoff = Math.min(1000 * 2 ** attempt, 10_000);
        await sleep(backoff);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('NZBGeek request failed after retries');
  }

  /** Search NZBGeek using the Newznab API. */
  async search(
    query: string,
    options: {
      category?: string;
      limit?: number;
      offset?: number;
      extended?: boolean;
    } = {}
  ): Promise<NzbgeekSearchResponse> {
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const offset = Math.max(0, options.offset ?? 0);

    const response = await this.fetchWithRetry('/api', {
      t: 'search',
      q: query,
      cat: options.category ?? '',
      extended: options.extended ? '1' : '0',
      limit: String(limit),
      offset: String(offset),
    }, this.maxRetries);

    const xml = await response.text();
    return this.parseSearchResponse(xml, limit, offset);
  }

  /** Download an NZB file from NZBGeek by result ID. */
  async downloadNzb(id: string): Promise<Buffer> {
    if (!/^[\w.-]{1,200}$/.test(id)) {
      throw new Error('Invalid NZBGeek result ID');
    }

    const response = await this.fetchWithRetry('/api', {
      t: 'get',
      id: id,
    }, this.maxRetries);

    if (!response.ok) {
      throw new Error(`NZBGeek NZB download returned HTTP ${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const prefix = bytes.toString('utf8', 0, Math.min(bytes.length, 4096)).replace(/^\uFEFF/, '').trimStart();
    if (bytes.length < 20 || !/<(?:[\w.-]+:)?nzb(?:\s|>)/i.test(prefix)) {
      throw new Error('NZBGeek response was not a valid NZB XML file.');
    }
    return bytes;
  }

  private parseSearchResponse(xml: string, limit: number, offset: number): NzbgeekSearchResponse {
    // Newznab search returns XML. Parse defensively without external dependencies.
    const results: NzbgeekResult[] = [];

    // Extract total count from <channel> or root attributes
    const totalMatch = /total=["'](\d+)["']/.exec(xml);
    const total = totalMatch ? Number(totalMatch[1]) : 0;

    // Match each <item> block
    const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    for (const match of xml.matchAll(itemRegex)) {
      const itemXml = match[1];

      const id = this.extractAttr(itemXml, 'id') || this.extractTagContent(itemXml, 'guid') || '';
      const guid = this.extractTagContent(itemXml, 'guid') || id;
      const title = this.extractTagContent(itemXml, 'title') || 'Untitled';
      const sizeStr = this.extractAttr(itemXml, 'size');
      const size = sizeStr ? Number(sizeStr) : undefined;
      const postedStr = this.extractAttr(itemXml, 'postdate');
      const posted = postedStr ? Number(postedStr) : undefined;
      const complete = this.extractAttr(itemXml, 'complete') === '1' || /complete=["']1["']/.test(itemXml);
      const category = this.extractAttr(itemXml, 'category') || undefined;

      // Extract groups from <newsgroups> or group tags
      const groups: string[] = [];
      const groupRegex = /<group>([^<]+)<\/group>/gi;
      for (const g of itemXml.matchAll(groupRegex)) {
        groups.push(g[1]);
      }

      if (id || guid) {
        results.push({
          id: id || guid,
          guid,
          title,
          size,
          posted,
          complete,
          groups,
          category,
          source: 'NZBGeek',
        });
      }
    }

    return {
      total,
      offset,
      limit,
      results: results.slice(offset, offset + limit),
    };
  }

  private extractAttr(xml: string, attr: string): string | undefined {
    const m = new RegExp(`${attr}=["']([^"']*)["']`, 'i').exec(xml);
    return m ? m[1] : undefined;
  }

  private extractTagContent(xml: string, tag: string): string | undefined {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
    return m ? m[1].trim() : undefined;
  }
}

/** Build a configured NZBGeek client from environment variables. */
export function buildNzbgeekClient(): NzbgeekClient {
  const host = process.env.NZBGEEK_API_HOST?.trim() || 'https://api.nzbgeek.info/';
  const apiKey = process.env.NZBGEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('NZBGEEK_API_KEY is not configured. Set NZBGEEK_API_KEY in .env.');
  }
  const client = new NzbgeekClient({
    host,
    apiKey,
    whitelistIp: process.env.NZBGEEK_WHITELIST_IP?.trim() || undefined,
    requestTimeoutMs: Number(process.env.NZBGEEK_REQUEST_TIMEOUT_MS ?? 30_000),
    maxRetries: Number(process.env.NZBGEEK_MAX_RETRIES ?? 3),
  });
  client.logWhitelistReference();
  return client;
}
