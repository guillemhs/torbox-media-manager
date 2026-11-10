import type { RequestHandler } from 'express';
import { searchMusicMetadata } from '../services/musicSearch';
import { searchTitles } from '../db/database';
import { searchMusicTorrents } from '../services/musicSearch';
import { searchTorrentCandidates, searchTorrentsViaProwlarr, parseSeasonEpisode, type TorrentCandidate } from '../services/torbox/torrentSearch';
import { searchIndexerTorrents } from '../services/musicSearch';
import { searchUsenet } from '../services/usenetSearch';
import { pagination, sendError, extractCategoryFromName } from './routeUtils';

export const unifiedSearchRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const query = scalar(req.query.q)?.trim() || '';
  if (query.length < 2 || query.length > 180) {
    return res.status(400).json({ error: 'Search query must be between 2 and 180 characters.' });
  }

  const page = pagination(req.query as Record<string, unknown>, 100);
  const kindValue = scalar(req.query.kind);
  const kind = kindValue === 'movie' || kindValue === 'series' || kindValue === 'music' || kindValue === 'torrents' || kindValue === 'usenet' ? kindValue : 'all';

  const sourcesParam = scalar(req.query.sources) || 'local';
  const sources = sourcesParam.split(',').filter(s => ['local', 'indexers', 'usenet'].includes(s));

  const indexersParam = scalar(req.query.indexers) || 'prowlarr,torrentio';
  const indexers = indexersParam.split(',').filter(s => ['prowlarr', 'torrentio'].includes(s));

  const hasIndexerConfig = Boolean(process.env.TORZNAB_URL?.trim() && process.env.TORZNAB_API_KEY?.trim());
  const categoryMode: string = 'name';
  const fixedCategory = '';

  try {
    const combined: Array<Record<string, unknown> & { _source: string }> = [];
    const warnings: string[] = [];

    // 1. Local MusicBrainz search
    if (sources.includes('local') && (kind === 'all' || kind === 'music')) {
      const musicResult = await searchMusicMetadata(query);
      for (const item of musicResult) {
        combined.push({ ...item, _source: 'local-music' });
      }
    }

    // 2. Indexer/Torrent search
    if (sources.includes('indexers') && (kind === 'all' || kind === 'torrents' || kind === 'movie' || kind === 'series' || kind === 'music')) {
      try {
        let torrentCandidates: TorrentCandidate[] = [];
        const sourceNames: string[] = [];
        const searches: Promise<unknown>[] = [];
        const providerNames: string[] = [];

        if (indexers.includes('prowlarr') && hasIndexerConfig) {
          const candidates = await searchTorrentsViaProwlarr(query, page.limit, page.offset, undefined);
          for (const candidate of candidates) {
            const category = categoryMode === 'fixed' ? (fixedCategory || '') : (categoryMode === 'name' ? extractCategoryFromName(candidate.name) : '');
            torrentCandidates.push({
              name: candidate.name,
              seeders: candidate.seeders,
              leechers: candidate.leechers,
              size: candidate.size,
              source: candidate.source,
              _category: category,
              ...(candidate.hash ? { hash: candidate.hash, magnet: candidate.magnet, downloadToken: candidate.downloadToken } : {}),
              ...(candidate.imdbId ? { imdbId: candidate.imdbId } : {}),
            });
          }
          providerNames.push('Prowlarr');
        }

        if (indexers.includes('torrentio')) {
          const parsed = kind === 'music' ? { baseQuery: query, season: undefined, episode: undefined } : parseSeasonEpisode(query);
          const titleQuery = parsed.baseQuery || query;
          const imdbIds: string[] = [];
          let localResults: { items: unknown[] } | undefined;
          try {
            localResults = await searchTitles({ ...page, q: titleQuery, kind: kind === 'all' ? 'all' : (kind as 'movie' | 'series' | 'all') });
          } catch (error) {
            console.warn('[search.ts] Local IMDb search failed for Torrentio:', error instanceof Error ? error.message : String(error));
          }

          if (localResults) {
            for (const item of localResults.items) {
              const imdbId = (item as Record<string, unknown>).imdbId;
              if (imdbId && typeof imdbId === "string" && !imdbIds.includes(imdbId)) {
                imdbIds.push(imdbId as string);
              }
            }
          }

          if (imdbIds.length === 0) {
            console.warn('[search.ts] Torrentio selected but no IMDb ID available; skipping Torrentio');
          } else {
            // When multiple IMDb IDs are found, search Torrentio for each one,
            // using the title type from the local database to pick movie vs series.
            const imdbIdToKind: Record<string, 'movie' | 'series'> = {};
            for (const item of localResults!.items) {
              const imdbId = (item as Record<string, unknown>).imdbId;
              const titleType = (item as Record<string, unknown>).titleType;
              if (imdbId && typeof imdbId === "string" && !imdbIdToKind[imdbId]) {
                imdbIdToKind[imdbId as string] = (titleType === 'tvSeries' || titleType === 'tvMiniSeries') ? 'series' : 'movie';
              }
            }
            for (const imdbId of Object.keys(imdbIdToKind)) {
              const mediaKind = imdbIdToKind[imdbId];
              const season = mediaKind === 'series' ? (parsed.season ?? 1) : 1;
              const episode = mediaKind === 'series' ? (parsed.episode ?? 1) : 1;
              try {
                const torrentioResults = await searchTorrentCandidates(imdbId, mediaKind, season, page.limit, page.offset, episode);
                for (const candidate of torrentioResults) {
                  torrentCandidates.push(candidate);
                }
              } catch (error) {
                console.warn('[search.ts] Torrentio search failed for IMDb', { imdbId, error: error instanceof Error ? error.message : String(error) });
              }
            }
            providerNames.push('Torrentio');
          }
        }

        try {
          const searchResults = await Promise.allSettled(searches);
          const successful: TorrentCandidate[] = searchResults.flatMap((result) =>
            result.status === 'fulfilled' ? result.value as TorrentCandidate[] : []
          );
          const sourceWarnings = searchResults.flatMap((result, index) => result.status === 'rejected'
            ? [`${providerNames[index]}: ${result.reason instanceof Error ? result.reason.message : 'search failed'}`]
            : []);
          warnings.push(...sourceWarnings);

          const unique = new Map<string, TorrentCandidate>();
          for (const candidate of successful) {
            const hashKey = candidate.hash || '';
            const existing = unique.get(hashKey);
            unique.set(hashKey, existing ? {
              ...existing,
              seeders: existing.seeders ?? candidate.seeders,
              leechers: existing.leechers ?? candidate.leechers,
              size: existing.size ?? candidate.size,
              downloadToken: existing.downloadToken ?? candidate.downloadToken,
            } : candidate);
          }
          torrentCandidates.push(...[...unique.values()]);
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : 'Indexer fallback search failed');
        }

        const torrentSource = sourceNames.join(' + ') || 'Torrentio + Prowlarr';
        for (const candidate of torrentCandidates) {
          combined.push({ ...candidate, _source: 'torrents' });
        }
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'Indexer search failed');
      }
    }

  // 3. Usenet search
  if (sources.includes('usenet') && (kind === 'all' || kind === 'usenet')) {
    try {
      const usenetParam = scalar(req.query.usenetSource) || 'all';
      const usenetSources = usenetParam.split(',').filter(s => ['NZBGeek', 'NZBIndex', 'Binsearch'].includes(s));
      const useUsenetSources = usenetSources.length > 0 ? usenetSources : ['NZBGeek', 'NZBIndex', 'Binsearch'];
      for (const source of useUsenetSources) {
        try {
          const usenetResult = await searchUsenet(query, source as 'all' | 'NZBIndex' | 'Binsearch', page.limit, page.offset);
          const candidates = usenetResult.candidates || [];
          for (const candidate of candidates) {
            combined.push({ ...candidate, _source: 'usenet' });
          }
          if (usenetResult.warnings) {
            warnings.push(...usenetResult.warnings);
          }
        } catch (error) {
          console.warn(`[search.ts] Usenet search ${source} failed:`, error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Usenet search failed');
    }
  }

  // Group results by source for frontend compatibility
  const movies = combined.filter(item => item._source === 'local-movies');
  const shows = combined.filter(item => item._source === 'local-shows');
  const music = combined.filter(item => item._source === 'local-music');
  const torrents = combined.filter(item => item._source === 'torrents');
  const usenet = combined.filter(item => item._source === 'usenet');

  // Apply pagination to each group
  const paginatedMovies = movies.slice(page.offset, page.offset + page.limit);
  const paginatedShows = shows.slice(page.offset, page.offset + page.limit);
  const paginatedMusic = music.slice(page.offset, page.offset + page.limit);
  const paginatedTorrents = torrents.slice(page.offset, page.offset + page.limit);
  const paginatedUsenet = usenet.slice(page.offset, page.offset + page.limit);

  res.setHeader('Cache-Control', 'private, no-store');
  return res.json({
    query,
    kind,
    sources,
    indexers,
    page: { limit: page.limit, offset: page.offset },
    movies: { items: paginatedMovies, total: movies.length },
    shows: { items: paginatedShows, total: shows.length },
    music: { items: paginatedMusic, total: music.length },
    torrents: { items: paginatedTorrents, total: torrents.length },
    usenet: { items: paginatedUsenet, total: usenet.length },
    warnings: warnings.length > 0 ? warnings : undefined,
  });
} catch (error) {
  return res.status(502).json({ error: error instanceof Error ? error.message : 'Search failed.' });
}
};
