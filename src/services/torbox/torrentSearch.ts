export interface TorrentCandidate {
  hash: string;
  magnet: string;
  name: string;
  seeders: number | null;
  leechers: number | null;
  size: number | null;
  source: string;
  downloadToken?: string;
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function countNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function encodeQueryValue(value: string): string {
  let wellFormed = '';
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        wellFormed += value[index] + value[index + 1];
        index++;
      } else wellFormed += '\ufffd';
    } else if (code >= 0xdc00 && code <= 0xdfff) wellFormed += '\ufffd';
    else wellFormed += value[index];
  }
  return encodeURIComponent(wellFormed);
}

function magnetHash(value: string): string {
  return (/xt=urn:btih:([a-f0-9]{40})/i.exec(value)?.[1] || '').toLowerCase();
}

function prowlarrSearchUrl(): URL | null {
  const base = process.env.TORZNAB_URL?.trim();
  if (!base) return null;
  const url = new URL(base);
  // Use the configured Torznab feed URL directly (e.g. http://prowlarr:9696/api).
  // The API key is sent via the X-Api-Key header.
  return url;
}

/**
 * Redacts potential API keys and tokens from a URL for safe logging.
 */
function redactUrl(url: URL): string {
  try {
    const redacted = new URL(url.toString());
    for (const param of ['apikey', 'api_key', 'apiKey']) {
      if (redacted.searchParams.has(param)) redacted.searchParams.set(param, '***REDACTED***');
    }
    // Redact an API key embedded in the first path segment (Prowlarr Torznab style: /<apiKey>/api)
    const parts = redacted.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && /^[a-f0-9]{32}$/i.test(parts[0])) {
      parts[0] = '***REDACTED***';
      redacted.pathname = '/' + parts.join('/');
    }
    return redacted.toString();
  } catch {
    return '[unparseable url]';
  }
}
export async function searchTorrentCandidates(imdbId: string, kind: 'movie' | 'series', season = 1, limit = 40, offset = 0): Promise<TorrentCandidate[]> {
  if (!/^tt\d+$/.test(imdbId)) throw new Error('A valid IMDb ID is required for torrent search.');
  if (kind === 'series' && (!Number.isSafeInteger(season) || season < 1 || season > 99)) {
    throw new Error('Season must be between 1 and 99.');
  }

  const resourceId = kind === 'movie' ? imdbId : `${imdbId}:${season}:1`;
  const base = (process.env.TORRENT_SEARCH_BASE_URL || 'https://torrentio.strem.fun').replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/stream/${kind}/${encodeURIComponent(resourceId)}.json`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === 'TimeoutError'
      ? 'Torrent search timed out. Try again in a moment.'
      : 'Torrent search service is unavailable.');
  }
  if (!response.ok) throw new Error(`Torrent search returned HTTP ${response.status}.`);

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { streams?: unknown }).streams)) {
    throw new Error('Torrent search returned an unexpected response.');
  }

  const streams = (payload as { streams: unknown[] }).streams;
  const candidates = new Map<string, TorrentCandidate>();
  for (const value of streams) {
    if (!value || typeof value !== 'object') continue;
    const stream = value as Record<string, unknown>;
    const hash = typeof stream.infoHash === 'string' ? stream.infoHash.toLowerCase() : '';
    if (!/^[a-f0-9]{40}$/.test(hash)) continue;
    const hints = stream.behaviorHints && typeof stream.behaviorHints === 'object'
      ? stream.behaviorHints as Record<string, unknown>
      : {};
    const name = [stream.title, hints.filename, stream.name]
      .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)?.trim()
      || `${imdbId} · ${kind === 'series' ? `Season ${season}` : 'Torrent'}`;
    const trackers = Array.isArray(stream.sources)
      ? stream.sources.filter((item): item is string => typeof item === 'string' && item.startsWith('tracker:')).map(item => `tr=${encodeQueryValue(item.slice(8))}`)
      : [];
    const size = positiveNumber(hints.videoSize || stream.size);
    candidates.set(hash, {
      hash,
      magnet: `magnet:?xt=urn:btih:${hash}&dn=${encodeQueryValue(name.slice(0, 180))}${trackers.length ? `&${[...new Set(trackers)].join('&')}` : ''}`,
      name,
      seeders: countNumber(stream.seeders),
      leechers: countNumber(stream.leechers ?? stream.peers),
      size,
      source: 'Torrentio'
    });
  }
  const clampedLimit = Math.min(100, Math.max(1, limit));
  const clampedOffset = Math.max(0, offset);
  return [...candidates.values()].slice(clampedOffset, clampedOffset + clampedLimit);
}

/**
 * Search torrents via Prowlarr's Torznab API for general queries (without IMDb ID).
 * This is used for general search where we don't have an IMDb ID.
 */
export async function searchTorrentsViaProwlarr(query: string, limit = 50, offset = 0, categories?: string[]): Promise<TorrentCandidate[]> {
  const url = prowlarrSearchUrl();
  if (!url) {
    throw new Error('Prowlarr is not configured. Set TORZNAB_URL to a Prowlarr Torznab feed URL.');
  }

  url.searchParams.set('q', query);
  url.searchParams.set('t', 'search');
  url.searchParams.set('limit', String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set('offset', String(Math.max(0, offset)));
  
  // Add category filtering if provided
  if (categories && categories.length > 0) {
    url.searchParams.set('cat', categories.join(','));
  }

  const key = process.env.TORZNAB_API_KEY?.trim();
  if (!key) throw new Error('TORZNAB_API_KEY is required for Prowlarr search.');

  // Prowlarr Torznab API expects the API key as a query parameter
  url.searchParams.set('apikey', key);

  console.warn('[Prowlarr] search request:', {
    url: redactUrl(url),
    params: { q: url.searchParams.get('q'), t: url.searchParams.get('t'), limit: url.searchParams.get('limit'), offset: url.searchParams.get('offset'), cat: url.searchParams.get('cat') },
    hasApiKey: Boolean(key)
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml' },
      signal: AbortSignal.timeout(20_000)
    });
  } catch {
    throw new Error('Prowlarr search service is unavailable. Check that Prowlarr is running and reachable from the app.');
  }

  if (!response.ok) {
    let body: string;
    try {
      body = await response.text();
    } catch {
      body = '<unreadable response body>';
    }
    console.warn('[Prowlarr] search error response:', {
      status: response.status,
      statusText: response.statusText,
      url: redactUrl(url),
      body: body.slice(0, 1000)
    });
    throw new Error(`Prowlarr search returned HTTP ${response.status}.`);
  }

  const xml = await response.text();
  const candidates = new Map<string, TorrentCandidate>();
  for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) || []) {
    const name = tag(item, 'title');
    const link = tag(item, 'link').replace(/&amp;/g, '&');
    const magnet = (/magnet:\?[^\s<]+/i.exec(link)?.[0] || '').replace(/&amp;/g, '&');
    const hash = (attr(item, 'infohash') || magnetHash(magnet)).toLowerCase();
    if (!name || !magnet || !/^[a-f0-9]{40}$/.test(hash)) continue;
    const indexer = tag(item, 'jackettindexer') || tag(item, 'prowlarrindexer') || 'Prowlarr';
    const size = positiveNumber(attr(item, 'size'));
    const seeders = countNumber(attr(item, 'seeders'));
    const leechers = countNumber(attr(item, 'peers') ?? attr(item, 'leechers'));
    candidates.set(hash, {
      hash,
      magnet,
      name,
      seeders,
      leechers,
      size,
      source: indexer
    });
  }
  const clampedLimit = Math.min(100, Math.max(1, limit));
  const clampedOffset = Math.max(0, offset);
  return [...candidates.values()].slice(clampedOffset, clampedOffset + clampedLimit);
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function tag(item: string, name: string): string {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(item);
  return match ? decodeXml(match[1].trim()) : '';
}

function attr(item: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const match = new RegExp(`<torznab:attr\\b(?=[^>]*\\bname=["']${escaped}["']) (?=[^>]*\\bvalue=["']([^"']*)["'])[^>]*\\/?\\s*>`, 'i').exec(item);
  return match ? decodeXml(match[1]) : null;
}
