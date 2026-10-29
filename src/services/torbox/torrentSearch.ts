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
  // Convert to /api/v1/search endpoint if it's an indexer feed URL
  if (/\/api\/v1\/search\/?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/$/, '');
    return url;
  }
  const indexerFeed = /^(.*)\/\d+\/api\/?$/.exec(url.pathname);
  if (!indexerFeed) return null;
  url.pathname = `${indexerFeed[1].replace(/\/+$/, '')}/api/v1/search`;
  url.search = '';
  return url;
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
export async function searchTorrentsViaProwlarr(query: string, limit = 50, offset = 0): Promise<TorrentCandidate[]> {
  const url = prowlarrSearchUrl();
  if (!url) {
    throw new Error('Prowlarr is not configured. Set TORZNAB_URL to a Prowlarr Torznab feed URL.');
  }

  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set('offset', String(Math.max(0, offset)));

  const key = process.env.TORZNAB_API_KEY?.trim();
  if (!key) throw new Error('TORZNAB_API_KEY is required for Prowlarr search.');

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Api-Key': key },
      signal: AbortSignal.timeout(20_000)
    });
  } catch {
    throw new Error('Prowlarr search service is unavailable. Check that Prowlarr is running and reachable from the app.');
  }
  if (!response.ok) throw new Error(`Prowlarr search returned HTTP ${response.status}.`);

  const rawData = await response.json();
  
  // Handle both array response and object with results/items
  let items: unknown[];
  if (Array.isArray(rawData)) {
    items = rawData;
  } else if (rawData && typeof rawData === 'object') {
    const obj = rawData as Record<string, unknown>;
    if (Array.isArray(obj.results)) {
      items = obj.results;
    } else if (Array.isArray(obj.items)) {
      items = obj.items;
    } else {
      return [];
    }
  } else {
    return [];
  }

  const candidates = new Map<string, TorrentCandidate>();
  
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    
    const name = typeof item.title === 'string' ? item.title : '';
    const downloadUrl = typeof item.downloadUrl === 'string' ? item.downloadUrl : '';
    const magnetUrl = typeof item.magnetUrl === 'string' ? item.magnetUrl : '';
    const hash = magnetHash(magnetUrl) || (typeof item.infoHash === 'string' ? item.infoHash.toLowerCase() : '') || (typeof item.infohash === 'string' ? item.infohash.toLowerCase() : '') || (typeof item.hash === 'string' ? item.hash.toLowerCase() : '');
    
    if (!name || !/^[a-f0-9]{40}$/.test(hash)) continue;
    
    const magnet = magnetUrl.startsWith('magnet:') ? magnetUrl : `magnet:?xt=urn:btih:${hash}&dn=${encodeQueryValue(name.slice(0, 180))}`;
    const indexer = typeof item.indexer === 'string' ? item.indexer : 
                    typeof item.prowlarrindexer === 'string' ? item.prowlarrindexer :
                    typeof item.jackettindexer === 'string' ? item.jackettindexer : 'Prowlarr';
    
    const size = positiveNumber(item.size);
    const seeders = countNumber(item.seeders);
    const leechers = countNumber(item.leechers ?? item.peers);
    
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
