import type { RequestHandler } from 'express';
import { searchMusicMetadata } from '../services/musicSearch';
import { searchTitles } from '../db/database';
import { searchMusicTorrents } from '../services/musicSearch';
import { searchTorrentCandidates, searchTorrentsViaProwlarr, type TorrentCandidate } from '../services/torbox/torrentSearch';
import { searchIndexerTorrents } from '../services/musicSearch';
import { searchUsenet } from '../services/usenetSearch';
import { pagination, sendError } from './routeUtils';

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

  console.log('[USENET-PIPELINE] Search indexers:', { query, kind, indexers, sources });

  const hasIndexerConfig = Boolean(process.env.TORZNAB_URL?.trim() && process.env.TORZNAB_API_KEY?.trim());

  try {
    const combined: Array<Record<string, unknown> & { _source: string }> = [];
    const warnings: string[] = [];

    // Local MusicBrainz search
    if (sources.includes('local') && (kind === 'all' || kind === 'music')) {
      const musicResult = await searchMusicMetadata(query);
      for (const item of musicResult) {
        combined.push({ ...item, _source: 'local-music' });
      }
    }

    // Indexer/Torrent search
    if (sources.includes('indexers') && hasIndexerConfig && (kind === 'all' || kind === 'torrents' || kind === 'movie' || kind === 'series' || kind === 'music')) {
      try {
        let torrentCandidates: TorrentCandidate[] = [];
        const sourceNames: string[] = [];

        if (kind === 'music' || kind === 'all') {
          const musicTorrents = await searchMusicTorrents(query, indexers, page.limit, page.offset);
          torrentCandidates.push(...musicTorrents);
          if (indexers.includes('prowlarr')) sourceNames.push('Prowlarr');
          if (indexers.includes('torrentio')) sourceNames.push('Torrentio');
        }

        if (kind === 'movie' || kind === 'series' || kind === 'all') {
          const localResults = await searchTitles({ limit: 5, q: query, kind: kind === 'all' ? 'all' : kind });
          if (localResults.items.length > 0) {
            const firstResult = localResults.items[0] as { imdbId: string; titleType: string; primaryTitle: string };
            const imdbId = firstResult.imdbId;
            const mediaKind = firstResult.titleType.startsWith('tv') ? 'series' : 'movie';

            const searches: Promise<unknown>[] = [];
            const providerNames: string[] = [];

            if (indexers.includes('torrentio')) {
              console.log('[USENET-PIPELINE] Calling Torrentio:', { query, imdbId, kind: mediaKind });
              searches.push(searchTorrentCandidates(imdbId, mediaKind, 1, page.limit, page.offset));
              providerNames.push('Torrentio');
            }
            if (indexers.includes('prowlarr')) {
              console.log('[USENET-PIPELINE] Calling Prowlarr:', { query, imdbId, kind: mediaKind });
              searches.push(searchIndexerTorrents(
                mediaKind === 'series' ? `${firstResult.primaryTitle} S01` : firstResult.primaryTitle,
                mediaKind === 'series' ? 'tvsearch' : 'movie',
                [mediaKind === 'series' ? '5000' : '2000'],
                page.limit,
                page.offset,
              ));
              providerNames.push('Prowlarr');
            }

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
              const existing = unique.get(candidate.hash);
              unique.set(candidate.hash, existing ? {
                ...existing,
                seeders: existing.seeders ?? candidate.seeders,
                leechers: existing.leechers ?? candidate.leechers,
                size: existing.size ?? candidate.size,
                downloadToken: existing.downloadToken ?? candidate.downloadToken,
              } : candidate);
            }
            torrentCandidates.push(...[...unique.values()]);
          } else if (hasIndexerConfig) {
            // Determine media kind for Torrentio queries
            const mediaKind = kind === 'series' ? 'series' : 'movie';
            const searches: Promise<unknown>[] = [];
            const providerNames: string[] = [];

            if (indexers.includes('prowlarr')) {
              searches.push(searchTorrentsViaProwlarr(query, page.limit, page.offset));
              providerNames.push('Prowlarr');
            }

            // Note: Torrentio requires an IMDb ID for text search.
            // When no local IMDb match is found, we cannot use Torrentio directly.
            // Torrentio will be used when we have an IMDb ID from local search match.
            if (indexers.includes('torrentio') && !indexers.includes('prowlarr')) {
              console.warn('[search.ts] Torrentio selected but no IMDb ID available for text search; skipping Torrentio');
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
                const existing = unique.get(candidate.hash);
                unique.set(candidate.hash, existing ? {
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
          }
        }

        const torrentSource = sourceNames.join(' + ') || 'Torrentio + Prowlarr';
        for (const candidate of torrentCandidates) {
          combined.push({ ...candidate, _source: 'torrents' });
        }
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'Indexer search failed');
      }
    }

    // Usenet search
    if (sources.includes('usenet') && (kind === 'all' || kind === 'usenet')) {
      try {
        const sourceValue = scalar(req.query.usenetSource) || 'all';
        if (!['all', 'NZBIndex', 'Binsearch'].includes(sourceValue)) {
          throw new Error('usenetSource must be all, NZBIndex, or Binsearch.');
        }
        const usenetResult = await searchUsenet(query, sourceValue as 'all' | 'NZBIndex' | 'Binsearch', page.limit, page.offset);
        const candidates = usenetResult.candidates || [];
        for (const candidate of candidates) {
          combined.push({ ...candidate, _source: 'usenet' });
        }
        if (usenetResult.warnings) {
          warnings.push(...usenetResult.warnings);
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
