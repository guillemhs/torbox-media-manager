export interface TorrentCandidate {
  hash: string;
  magnet: string;
  name: string;
  seeders: number | null;
  leechers: number | null;
  size: number | null;
  source: string;
  downloadToken?: string;
  imdbId?: string;
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
  // Prowlarr Torznab feed: http://<host>:<port>/<apiKey>/api
  // Convert to Prowlarr JSON API: http://<host>:<port>/api/v1/search
  if (/\/api\/?$/.test(url.pathname)) {
    url.pathname = '/api/v1/search';
    return url;
  }
  return null;
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
      signal: AbortSignal.timeout(30_000)
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

  // Prowlarr JSON API: /api/v1/search with X-Api-Key header
  const take = Math.min(100, Math.max(1, limit));
  const skip = Math.max(0, offset);
  url.searchParams.set('query', query);
  url.searchParams.set('category', categories?.join(',') || '');
  url.searchParams.set('take', String(take));
  url.searchParams.set('skip', String(skip));

  const key = process.env.TORZNAB_API_KEY?.trim();
  if (!key) throw new Error('TORZNAB_API_KEY is required for Prowlarr search.');

  console.warn('[Prowlarr] search request:', {
    url: url.toString(),
    params: { query, category: categories?.join(','), take, skip },
    hasApiKey: Boolean(key)
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'X-Api-Key': key, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(60_000)
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
      url: url.toString(),
      body: body.slice(0, 1000)
    });
    throw new Error(`Prowlarr search returned HTTP ${response.status}.`);
  }

  const data = await response.json();
  const candidates = new Map<string, TorrentCandidate>();
  for (const item of data) {
    const infoHash = item.infoHash?.toLowerCase();
    const title = item.title;
    const size = item.size;
    const seeders = item.seeders;
    const leechers = item.leechers;
    const magnetUrl = item.magnetUrl || item.downloadUrl;

    if (!title || !/^[a-f0-9]{40}$/.test(infoHash)) continue;

    // Extract IMDb ID from Prowlarr guid field (e.g. "tt1234567" or "https://imdb.com/title/tt1234567")
    const guid = item.guid || '';
    const imdbIdMatch = guid.match(/(tt\d{7,})/i);
    const imdbId = imdbIdMatch ? imdbIdMatch[1].toLowerCase() : undefined;

    candidates.set(infoHash, {
      hash: infoHash,
      magnet: magnetUrl && /^magnet:\?xt=urn:btih:[a-f0-9]{40}/i.test(magnetUrl)
      ? magnetUrl
      : `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title.slice(0, 180))}`,
      name: title,
      seeders,
      leechers,
      size: size ? Number((size / (1024 * 1024 * 1024)).toFixed(1)) : null,
      source: item.indexer || 'Prowlarr',
      imdbId
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
