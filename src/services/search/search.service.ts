import { searchTitles } from '../../db/database';
import { searchMusicMetadata } from '../musicSearch';
import { searchTorrentsViaProwlarr, searchTorrentCandidates, parseSeasonEpisode, type TorrentCandidate } from '../torbox/torrentSearch';
import { searchUsenet } from '../usenetSearch';
import { extractCategoryFromTitle, extractCategoryFromName, formatTorrentMetadata, formatUsenetMetadata, pagination } from '../../routes/routeUtils';

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
  let torrentResults: Array<Record<string, unknown>> = [];
  const indexerList = indexers || ['prowlarr', 'torrentio'];
  // Prowlarr needs Torznab config; Torrentio works standalone via its Stremio addon.
  const useProwlarr = indexerList.includes('prowlarr') && hasIndexerConfig;
  const useTorrentio = indexerList.includes('torrentio');
  if (includeIndexers !== false && (useProwlarr || useTorrentio)) {
    try {
      if (useProwlarr) {
        const candidates = await searchTorrentsViaProwlarr(query, page.limit, page.offset, indexerCategories);
        for (const candidate of candidates) {
          const category = categoryMode === 'fixed' ? (fixedCategory || '') : (categoryMode === 'name' ? extractCategoryFromName(candidate.name) : '');
          torrentResults.push({
            name: candidate.name,
            _type: 'torrent',
            seeders: candidate.seeders,
            leechers: candidate.leechers,
            size: candidate.size,
            source: candidate.source,
            _category: category,
            ...(candidate.hash ? { hash: candidate.hash, magnet: candidate.magnet, downloadToken: candidate.downloadToken } : {}),
            ...(candidate.imdbId ? { imdbId: candidate.imdbId } : {}),
          });
        }
      }

      if (useTorrentio) {
        // Torrentio's Stremio addon resolves movie/series streams by IMDb ID,
        // so resolve the text query to IMDb IDs via the local database first.
        const torrentioCandidates: TorrentCandidate[] = [];
        const seenTorrentKeys = new Set<string>();
        const addTorrentioCandidates = (candidates: TorrentCandidate[]) => {
          for (const candidate of candidates) {
            const key = candidate.hash || candidate.magnet || candidate.name;
            if (key && !seenTorrentKeys.has(key)) {
              seenTorrentKeys.add(key);
              torrentioCandidates.push(candidate);
            }
          }
        };

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
              addTorrentioCandidates(await searchTorrentCandidates(imdbId, imdbKind, season, page.limit, page.offset, episode));
            } catch (error) {
              console.warn('[searchMedia] Torrentio search failed for IMDb', { imdbId, error: error instanceof Error ? error.message : String(error) });
            }
          }
        } else if (kind !== 'music') {
          // Fallback: pass the text query without season/episode tokens (works with some addon setups).
          try {
            const mediaKind = kind === 'series' ? 'series' : 'movie';
            const season = mediaKind === 'series' ? (parsed.season ?? 1) : 1;
            const episode = mediaKind === 'series' ? (parsed.episode ?? 1) : 1;
            addTorrentioCandidates(await searchTorrentCandidates(titleQuery, mediaKind, season, page.limit, page.offset, episode));
          } catch (error) {
            console.warn('[searchMedia] Torrentio text search failed:', error instanceof Error ? error.message : String(error));
          }
        }

        for (const candidate of torrentioCandidates) {
          const category = categoryMode === 'fixed' ? (fixedCategory || '') : (categoryMode === 'name' ? extractCategoryFromName(candidate.name) : '');
          torrentResults.push({
            name: candidate.name,
            _type: 'torrent',
            seeders: candidate.seeders,
            leechers: candidate.leechers,
            size: candidate.size,
            source: candidate.source,
            _category: category,
            ...(candidate.hash ? { hash: candidate.hash, magnet: candidate.magnet, downloadToken: candidate.downloadToken } : {}),
            ...(candidate.imdbId ? { imdbId: candidate.imdbId } : {}),
          });
        }
      }
    } catch (error) {
      console.warn(`[searchMedia] indexer search unavailable:`, error instanceof Error ? error.message : String(error));
    }
  }

  // 3. Usenet search
  let usenetResults: Array<Record<string, unknown>> = [];
  if (includeUsenet !== false && hasIndexerConfig) {
    const useUsenetSources = usenetSources ? usenetSources : ['NZBGeek', 'NZBIndex', 'Binsearch'];
    try {
      for (const source of useUsenetSources) {
        try {
          const usenetResult = await searchUsenet(query, source as 'all' | 'NZBIndex' | 'Binsearch', usenetLimit, 0);
          for (const candidate of usenetResult.candidates) {
            const category = categoryMode === 'fixed' ? (fixedCategory || '') : (categoryMode === 'name' ? extractCategoryFromName(candidate.name) : '');
            usenetResults.push({
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
      torrents: { items: formattedTorrents, total: formattedTorrents.length },
      usenet: { items: formattedUsenet, total: formattedUsenet.length },
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
