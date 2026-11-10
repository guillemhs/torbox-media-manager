import type { RequestHandler } from 'express';
import { getTitle, searchTitles } from '../db/database';
import { getTitleArtwork, getTitleMetadata } from '../services/artwork.service';
import { getTvmazeShowByImdb } from '../services/tvmaze/schedule.service';
import { searchMedia } from '../services/search/search.service';
import { pagination, sendError, extractCategoryFromTitle } from './routeUtils';

function parseSources(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(',').filter(s => ['local', 'indexers', 'usenet'].includes(s));
}

export const moviesRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const sources = parseSources(scalar(req.query.sources));
  const hasIndexerConfig = Boolean(process.env.TORZNAB_URL?.trim() && process.env.TORZNAB_API_KEY?.trim());
  const searchIndexers = sources.includes('indexers') && hasIndexerConfig;
  const searchUsenet = sources.includes('usenet') && hasIndexerConfig;
  const searchLocal = sources.includes('local') || sources.length === 0;
  const indexersParam = scalar(req.query.indexers) || 'prowlarr,torrentio';
  const indexers = indexersParam.split(',').filter(s => ['prowlarr', 'torrentio'].includes(s));
  try {
    const result = await searchMedia({
      query: typeof req.query.q === 'string' ? req.query.q : '',
      kind: 'movie',
      page: pagination(req.query as Record<string, unknown>),
      localKind: searchLocal ? 'movie' : undefined,
      localSourceLabel: 'local-movies',
      indexerCategories: searchIndexers ? ['2000'] : undefined,
      indexerType: searchIndexers ? 'movie' : undefined,
      categoryMode: 'title',
      includeLocal: searchLocal,
      includeIndexers: searchIndexers,
      includeUsenet: searchUsenet,
      indexers,
      browseLink: `/browse?q=${encodeURIComponent(typeof req.query.q === 'string' ? req.query.q : '')}&kind=movie`,
    });
    console.warn('[Movies route] response:', {
      query: result.query,
      localCount: result.results.local.items.length,
      torrentCount: result.results.torrents.items.length,
      usenetCount: result.results.usenet.items.length,
    });
    return res.json(result);
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' }); }
};

export const showsRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const sources = parseSources(scalar(req.query.sources));
  const hasIndexerConfig = Boolean(process.env.TORZNAB_URL?.trim() && process.env.TORZNAB_API_KEY?.trim());
  const searchIndexers = sources.includes('indexers') && hasIndexerConfig;
  const searchUsenet = sources.includes('usenet') && hasIndexerConfig;
  const searchLocal = sources.includes('local') || sources.length === 0;
  const indexersParam = scalar(req.query.indexers) || 'prowlarr,torrentio';
  const indexers = indexersParam.split(',').filter(s => ['prowlarr', 'torrentio'].includes(s));
  try {
    const result = await searchMedia({
      query: typeof req.query.q === 'string' ? req.query.q : '',
      kind: 'series',
      page: pagination(req.query as Record<string, unknown>),
      localKind: searchLocal ? 'series' : undefined,
      localSourceLabel: 'local-shows',
      indexerCategories: searchIndexers ? ['5000'] : undefined,
      indexerType: searchIndexers ? 'tvsearch' : undefined,
      categoryMode: 'title',
      includeLocal: searchLocal,
      includeIndexers: searchIndexers,
      includeUsenet: searchUsenet,
      indexers,
      browseLink: `/browse?q=${encodeURIComponent(typeof req.query.q === 'string' ? req.query.q : '')}&kind=series`,
    });
    console.warn('[Shows route] response:', {
      query: result.query,
      localCount: result.results.local.items.length,
      torrentCount: result.results.torrents.items.length,
      usenetCount: result.results.usenet.items.length,
    });
    return res.json(result);
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' }); }
};

export const browseRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const hash = scalar(req.query.hash);
  if (hash && process.env.TORBOX_API_KEY?.trim()) {
    const { checkCachedTorrent } = await import('../services/torbox/client');
    try { return res.json({ cachedTorrent: await checkCachedTorrent(hash) }); }
    catch (error) { return sendError(res, error); }
  }
  const sources = parseSources(scalar(req.query.sources));
  const hasIndexerConfig = Boolean(process.env.TORZNAB_URL?.trim() && process.env.TORZNAB_API_KEY?.trim());
  const searchIndexers = sources.includes('indexers') && hasIndexerConfig;
  const searchUsenet = sources.includes('usenet') && hasIndexerConfig;
  const searchLocal = sources.includes('local') || sources.length === 0;
  const indexersParam = scalar(req.query.indexers) || 'prowlarr,torrentio';
  const indexers = indexersParam.split(',').filter(s => ['prowlarr', 'torrentio'].includes(s));
  try {
    const result = await searchMedia({
      query: typeof req.query.q === 'string' ? req.query.q : '',
      kind: ((scalar(req.query.kind) === 'movie' || scalar(req.query.kind) === 'series') ? scalar(req.query.kind) : 'all') as 'movie' | 'series' | 'all',
      page: pagination(req.query as Record<string, unknown>),
      localKind: searchLocal ? 'all' : undefined,
      indexerCategories: undefined,
      categoryMode: 'name',
      includeLocal: searchLocal,
      includeIndexers: searchIndexers,
      includeUsenet: searchUsenet,
      indexers,
      browseLink: undefined,
    });
    console.warn('[Browse route] response:', {
      query: result.query,
      kind: result.kind,
      localCount: result.results.local.items.length,
      torrentCount: result.results.torrents.items.length,
      usenetCount: result.results.usenet.items.length,
    });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' });
  }
};

export const titleRoute: RequestHandler = async (req, res) => {
  const imdbId = req.params.imdbId;
  if (!/^tt\d+$/.test(imdbId)) return res.status(400).json({ error: 'IMDb ID must look like tt1234567.' });
  const title = await getTitle(imdbId);
  if (!title) return res.status(404).json({ error: 'Title not found. The IMDb dataset may not be imported yet.' });
  const kind = typeof title.titleType === 'string' && /^tv/i.test(title.titleType) ? 'series' : 'movie';
  const metadata = await getTitleMetadata(imdbId, kind);
  let tvmaze: Record<string, unknown> | null = null;
  if (kind === 'series') {
    try { tvmaze = await getTvmazeShowByImdb(imdbId) as Record<string, unknown> | null; } catch { /* optional title enrichment */ }
  }
  const seasons = Array.isArray(tvmaze?._embedded && (tvmaze._embedded as Record<string, unknown>).seasons) ? (tvmaze!._embedded as Record<string, unknown>).seasons as unknown[] : [];
  const image = tvmaze?.image && typeof tvmaze.image === 'object' ? (tvmaze.image as Record<string, unknown>).original || (tvmaze.image as Record<string, unknown>).medium : undefined;
  const tvArtwork = typeof image === 'string' && /^https:\/\/static\.tvmaze\.com\//.test(image) ? { url: image, source: 'TVMaze' } : undefined;
  return res.json({ ...title, overview: metadata?.overview || (typeof tvmaze?.summary === 'string' ? tvmaze.summary.replace(/<[^>]*>/g, ' ').trim() : ''), releaseDate: metadata?.releaseDate || tvmaze?.premiered || (title.startYear ? `${title.startYear}-01-01` : undefined), seasonCount: metadata?.seasonCount ?? (seasons.length || undefined), showStatus: typeof tvmaze?.status === 'string' ? tvmaze.status : undefined, artwork: metadata?.artwork || tvArtwork || await getTitleArtwork(imdbId, kind) });
};

export const titleArtworkRoute: RequestHandler = async (req, res) => {
  const imdbId = req.params.imdbId;
  if (!/^tt\d+$/.test(imdbId)) return res.status(400).json({ error: 'IMDb ID must look like tt1234567.' });
  const kind = scalar(req.query.kind) === 'series' ? 'series' : 'movie';
  const artwork = await getTitleArtwork(imdbId, kind);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.json({ artwork });
};

function scalar(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
