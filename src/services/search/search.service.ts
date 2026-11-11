import { searchTitles } from '../../db/database';
import { searchMusicMetadata } from '../musicSearch';
import { searchTorrentsViaProwlarr, searchTorrentCandidates, parseSeasonEpisode, type TorrentCandidate } from '../torbox/torrentSearch';
import { searchUsenet } from '../usenetSearch';
import { extractCategoryFromTitle, extractCategoryFromName, formatTorrentMetadata, formatUsenetMetadata, pagination } from '../../routes/routeUtils';

// Short-lived in-memory cache for provider results. Each page navigation re-runs
// the search; Torrentio's live result set can drift by a few streams between calls,
// which made the reported total change between pages (103 -> 102). Caching the
// fetched, deduped lists for a few minutes keeps pagination totals stable.
const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000;
interface ProviderCacheEntry {
  expires: number;
  torrents: TorrentCandidate[];
  usenet: Array<Record<string, unknown>>;
}
const providerCache = new Map<string, ProviderCacheEntry>();

function providerCacheKey(parts: string[]): string {
  return parts.join('|');
}

function getCachedProviders(key: string): ProviderCacheEntry | undefined {
  const entry = providerCache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    providerCache.delete(key);
    return undefined;
  }
  return entry;
}

function setCachedProviders(key: string, entry: Omit<ProviderCacheEntry, 'expires'>): void {
  if (providerCache.size > 200) providerCache.clear();
  providerCache.set(key, { ...entry, expires: Date.now() + PROVIDER_CACHE_TTL_MS });
}

/** Test helper: clear the provider result cache. */
export function clearProviderCache(): void {
  providerCache.clear();
}

export interface MediaSearchOptions {
  query: string;
  kind: 'movie' | 'series' | 'music' | 'all';
  page: { limit: number; offset: number };
  /** IMDb title kind for local search ('movie' | 'series' | 'all'). Omit for music. */
  localKind?: 'movie' | 'series' | 'all';
  /** Whether to search MusicBrainz for local music results. */
  useMusicBrainz?: boolean;
  /** Source label attached to local items (_source). */
  localSourceLabel?: string;
  /** Prowlarr Torznab categories (e.g. ['2000'], ['5000'], ['3000']). Omit for browse. */
  indexerCategories?: string[];
  /** Prowlarr search type ('movie' | 'tvsearch'). Omit for browse. */
  indexerType?: 'movie' | 'tvsearch';
  /** Category extraction mode for results. */
  categoryMode: 'title' | 'name' | 'fixed';
  fixedCategory?: string;
  /** Browse link appended to the response. */
  browseLink?: string;
  /** Max usenet results to fetch. */
  usenetLimit?: number;
  /** Include local (IMDb/MusicBrainz) results. Default true when localKind/useMusicBrainz is set. */
  includeLocal?: boolean;
  /** Include indexer (Prowlarr) results. Default true when hasIndexerConfig. */
  includeIndexers?: boolean;
  /** Include usenet results. Default true when hasIndexerConfig. */
  includeUsenet?: boolean;
  /** Which indexers to use: 'prowlarr', 'torrentio', or both. Omit for both. */
  indexers?: string[];
  /** Which usenet sources to use: 'NZBGeek', 'NZBIndex', 'Binsearch'. Omit for all. */
  usenetSources?: string[];
}

/** Shared search pipeline: local titles + indexer torrents + usenet, combined and tagged. */
export async function searchMedia(options: MediaSearchOptions): Promise<MediaSearchResult> {
  const { query, kind, page, localKind, useMusicBrainz, localSourceLabel, indexerCategories, indexerType, categoryMode, fixedCategory, browseLink, usenetLimit = 50, includeLocal = true, includeIndexers = true, includeUsenet = true, indexers, usenetSources } = options;
  const hasIndexerConfig = Boolean(process.env.TORZNAB_URL?.trim() && process.env.TORZNAB_API_KEY?.trim());

  // Strip season/episode tokens (e.g. "silo s03" -> "silo") so title lookups match.
  const parsed = kind === 'music' ? { baseQuery: query, season: undefined, episode: undefined } : parseSeasonEpisode(query);
  const titleQuery = parsed.baseQuery || query;

  // 1. Local search
  let localItems: Array<Record<string, unknown>> = [];
  let localTotal = 0;
  try {
    if (includeLocal !== false) {
      if (useMusicBrainz) {
        const releases = await searchMusicMetadata(query);
        localItems = releases.map((item) => ({ ...item, _type: 'local', _category: fixedCategory || 'Music' }));
        localTotal = releases.length;
      } else if (localKind) {
        const result = await searchTitles({ ...page, q: titleQuery, kind: localKind });
        localItems = result.items.map((item: Record<string, unknown>) => ({
          ...item,
          _type: 'local',
          _category: extractCategoryFromTitle(String(item.primaryTitle || ''), String(item.titleType || '')),
          ...(localSourceLabel ? { _source: localSourceLabel } : {}),
        }));
        localTotal = result.total;
      }
    }
  } catch (error) {
    console.warn(`[searchMedia] local search unavailable:`, error instanceof Error ? error.message : String(error));
  }

  // 2. Indexer torrent search (Prowlarr and/or Torrentio)
  const indexerList = indexers || ['prowlarr', 'torrentio'];
  // Prowlarr needs Torznab config; Torrentio works standalone via its Stremio addon.
  const useProwlarr = indexerList.includes('prowlarr') && hasIndexerConfig;
  const useTorrentio = indexerList.includes('torrentio');

  // Fetch a large batch (up to 100) from each provider, dedupe by hash across all
  // of them, THEN slice for the requested page. Applying the page offset inside
  // each provider call made totals change between pages (e.g. 74 results on page 1,
  // 37 on page 2) because Torrentio ignores offset and returns the same streams.
  const FETCH_LIMIT = 100;
  const allTorrentCandidates: TorrentCandidate[] = [];
  const seenHashes = new Set<string>();
  const addTorrentCandidates = (candidates: TorrentCandidate[]) => {
    for (const candidate of candidates) {
      const key = candidate.hash || candidate.magnet || candidate.name;
      if (key && !seenHashes.has(key)) {
        seenHashes.add(key);
        allTorrentCandidates.push(candidate);
      }
    }
  };

  const cacheKey = providerCacheKey([
    'v1', titleQuery, kind, indexerList.join(','), String(includeIndexers !== false),
    (usenetSources || ['NZBGeek', 'NZBIndex', 'Binsearch']).join(','), String(includeUsenet !== false),
    String(parsed.season ?? ''), String(parsed.episode ?? ''),
  ]);
  let allUsenetCached: Array<Record<string, unknown>> | undefined;
  const cached = getCachedProviders(cacheKey);
  if (cached) {
    for (const c of cached.torrents) addTorrentCandidates([c]);
    allUsenetCached = cached.usenet;
  }

  if (includeIndexers !== false && (useProwlarr || useTorrentio) && !cached) {
    try {
      if (useProwlarr) {
        addTorrentCandidates(await searchTorrentsViaProwlarr(query, FETCH_LIMIT, 0, indexerCategories));
      }

      if (useTorrentio) {
        // Torrentio's Stremio addon resolves movie/series streams by IMDb ID,
        // so resolve the text query to IMDb IDs via the local database first.
        let imdbMatches: Array<Record<string, unknown>> = [];
        if (kind === 'movie' || kind === 'series' || kind === 'all') {
          try {
            const localResults = await searchTitles({ q: titleQuery, kind: kind === 'all' ? 'all' : kind, limit: 10, offset: 0 });
            imdbMatches = localResults.items as Array<Record<string, unknown>>;
          } catch (error) {
            console.warn('[searchMedia] Local IMDb lookup for Torrentio failed:', error instanceof Error ? error.message : String(error));
          }
        }

        if (imdbMatches.length > 0) {
          // Multiple IMDb IDs: query Torrentio for each one, using the local
          // title type to pick the movie vs series stream endpoint.
          for (const item of imdbMatches) {
            const imdbId = typeof item.imdbId === 'string' ? item.imdbId : '';
            if (!/^tt\d+$/.test(imdbId)) continue;
            const imdbKind: 'movie' | 'series' = (item.titleType === 'tvSeries' || item.titleType === 'tvMiniSeries') ? 'series' : 'movie';
            const season = imdbKind === 'series' ? (parsed.season ?? 1) : 1;
            const episode = imdbKind === 'series' ? (parsed.episode ?? 1) : 1;
            try {
              addTorrentCandidates(await searchTorrentCandidates(imdbId, imdbKind, season, FETCH_LIMIT, 0, episode));
            } catch (error) {
              console.warn('[searchMedia] Torrentio search failed for IMDb', { imdbId, error: error instanceof Error ? error.message : String(error) });
            }
          }
        } else if (kind !== 'music') {
          // Fallback: pass the text query without season/episode tokens.
          try {
            const mediaKind = kind === 'series' ? 'series' : 'movie';
            const season = mediaKind === 'series' ? (parsed.season ?? 1) : 1;
            const episode = mediaKind === 'series' ? (parsed.episode ?? 1) : 1;
            addTorrentCandidates(await searchTorrentCandidates(titleQuery, mediaKind, season, FETCH_LIMIT, 0, episode));
          } catch (error) {
            console.warn('[searchMedia] Torrentio text search failed:', error instanceof Error ? error.message : String(error));
          }
        }
      }
    } catch (error) {
      console.warn(`[searchMedia] indexer search unavailable:`, error instanceof Error ? error.message : String(error));
    }
  }

  // Slice the deduped torrent list for the requested page; total stays stable across pages.
  const torrentTotal = allTorrentCandidates.length;
  const pageTorrents = allTorrentCandidates.slice(page.offset, page.offset + page.limit);
  const torrentResults: Array<Record<string, unknown>> = pageTorrents.map((candidate) => {
    const category = categoryMode === 'fixed' ? (fixedCategory || '') : (categoryMode === 'name' ? extractCategoryFromName(candidate.name) : '');
    return {
      name: candidate.name,
      _type: 'torrent',
      seeders: candidate.seeders,
      leechers: candidate.leechers,
      size: candidate.size,
      source: candidate.source,
      _category: category,
      ...(candidate.hash ? { hash: candidate.hash, magnet: candidate.magnet, downloadToken: candidate.downloadToken } : {}),
      ...(candidate.imdbId ? { imdbId: candidate.imdbId } : {}),
    };
  });

  // 3. Usenet search — collect all, then slice for the requested page like torrents.
  const allUsenetResults: Array<Record<string, unknown>> = allUsenetCached ? [...allUsenetCached] : [];
  if (includeUsenet !== false && !allUsenetCached) {
    const useUsenetSources = usenetSources ? usenetSources : ['NZBGeek', 'NZBIndex', 'Binsearch'];
    try {
      for (const source of useUsenetSources) {
        try {
          const usenetResult = await searchUsenet(query, source as 'all' | 'NZBIndex' | 'Binsearch', usenetLimit, 0);
          for (const candidate of usenetResult.candidates) {
            const category = categoryMode === 'fixed' ? (fixedCategory || '') : (categoryMode === 'name' ? extractCategoryFromName(candidate.name) : '');
            allUsenetResults.push({
              name: candidate.name,
              _type: 'usenet',
              source: candidate.source,
              _category: category,
              ...(candidate.id ? { id: candidate.id } : {}),
              ...(candidate.posted !== undefined ? { posted: candidate.posted } : {}),
              ...(candidate.complete !== undefined ? { complete: candidate.complete } : {}),
              ...(candidate.size !== undefined ? { size: candidate.size } : {}),
            });
          }
        } catch (error) {
          console.warn(`[searchMedia] Usenet search ${source} failed:`, error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      console.warn(`[searchMedia] usenet search unavailable:`, error instanceof Error ? error.message : String(error));
    }
  }
  const usenetTotal = allUsenetResults.length;
  const usenetResults = allUsenetResults.slice(page.offset, page.offset + page.limit);

  if (!cached) {
    setCachedProviders(cacheKey, { torrents: [...allTorrentCandidates], usenet: [...allUsenetResults] });
  }

  // 4. Combine and separate by type
  const allResults = [...localItems, ...torrentResults, ...usenetResults];
  const torrents = allResults.filter(r => r._type === 'torrent');
  const usenet = allResults.filter(r => r._type === 'usenet');
  const local = allResults.filter(r => r._type === 'local');

  // 5. Format metadata
  const formattedTorrents = torrents.map((t: any) => ({
    ...t,
    _metadata: formatTorrentMetadata(t.seeders, t.leechers, t.size, t.source),
  }));
  const formattedUsenet = usenet.map((u: any) => ({
    ...u,
    _metadata: formatUsenetMetadata(u),
  }));

  // 6. Build response
  const itemsWithSource = localItems.map((item: any) => ({
    ...item,
    _source: item._source || localSourceLabel || 'local',
  }));

  return {
    items: itemsWithSource,
    total: localTotal,
    limit: page.limit,
    offset: page.offset,
    query,
    kind,
    results: {
      local: { items: localItems.slice(page.offset, page.offset + page.limit), total: localTotal },
      torrents: { items: formattedTorrents, total: torrentTotal },
      usenet: { items: formattedUsenet, total: usenetTotal },
    },
    torboxCacheCheckAvailable: Boolean(process.env.TORBOX_API_KEY?.trim()),
    ...(browseLink ? { browseLink } : {}),
  };
}

export interface MediaSearchResult {
  items: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  offset: number;
  query: string;
  kind: string;
  results: {
    local: { items: Array<Record<string, unknown>>; total: number };
    torrents: { items: Array<Record<string, unknown>>; total: number };
    usenet: { items: Array<Record<string, unknown>>; total: number };
  };
  torboxCacheCheckAvailable: boolean;
  browseLink?: string;
}
