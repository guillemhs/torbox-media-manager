import { searchTitles } from '../../db/database';
import { searchMusicMetadata } from '../musicSearch';
import { searchTorrentsViaProwlarr, type TorrentCandidate } from '../torbox/torrentSearch';
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

/** Shared search pipeline: local titles + indexer torrents + usenet, combined and tagged. */
export async function searchMedia(options: MediaSearchOptions): Promise<MediaSearchResult> {
  const { query, kind, page, localKind, useMusicBrainz, localSourceLabel, indexerCategories, indexerType, categoryMode, fixedCategory, browseLink, usenetLimit = 50 } = options;
  const hasIndexerConfig = Boolean(process.env.TORZNAB_URL?.trim() && process.env.TORZNAB_API_KEY?.trim());

  // 1. Local search
  let localItems: Array<Record<string, unknown>> = [];
  let localTotal = 0;
  try {
    if (useMusicBrainz) {
      const releases = await searchMusicMetadata(query);
      localItems = releases.map((item) => ({ ...item, _type: 'local', _category: fixedCategory || 'Music' }));
      localTotal = releases.length;
    } else if (localKind) {
      const result = await searchTitles({ ...page, q: query, kind: localKind });
      localItems = result.items.map((item: Record<string, unknown>) => ({
        ...item,
        _type: 'local',
        _category: extractCategoryFromTitle(String(item.primaryTitle || ''), String(item.titleType || '')),
        ...(localSourceLabel ? { _source: localSourceLabel } : {}),
      }));
      localTotal = result.total;
    }
  } catch (error) {
    console.warn(`[searchMedia] local search unavailable:`, error instanceof Error ? error.message : String(error));
  }

  // 2. Indexer (Prowlarr) torrent search
  let torrentResults: Array<Record<string, unknown>> = [];
  if (hasIndexerConfig) {
    try {
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
        });
      }
    } catch (error) {
      console.warn(`[searchMedia] indexer search unavailable:`, error instanceof Error ? error.message : String(error));
    }
  }

  // 3. Usenet search
  let usenetResults: Array<Record<string, unknown>> = [];
  if (hasIndexerConfig) {
    try {
      const usenetResult = await searchUsenet(query, 'all', usenetLimit, 0);
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
