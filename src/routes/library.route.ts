import type { RequestHandler } from 'express';
import { countTitles, getImportStatus, getTitle, searchTitles } from '../db/database';
import { importImdbDatasets } from '../services/imdb/import.service';
import { getLibraryStatus, scanLocalMedia } from '../services/media.service';
import { addTorrentToTorbox, checkCachedTorrent, getTorrentList, requestTorrentDownload, TorboxApiError } from '../services/torbox/client';
import { normalizeTorBoxMusicLibrary } from '../services/torbox/musicLibrary';
import { getTvmazeSchedule, getTvmazeShow } from '../services/tvmaze/schedule.service';
import { getMusicArtwork, getTitleArtwork } from '../services/artwork.service';

function sendError(res: Parameters<RequestHandler>[1], error: unknown) {
  const status = error instanceof TorboxApiError ? error.status : 502;
  return res.status(status).json({ error: error instanceof Error ? error.message : 'Request failed' });
}

function scalar(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function pagination(query: Record<string, unknown>) {
  const number = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('limit and offset must be non-negative integers');
    return Number(value);
  };
  return { limit: Math.min(200, Math.max(1, number(query.limit, 50))), offset: number(query.offset, 0) };
}

export const getLibraryRoute: RequestHandler = async (req, res) => {
  try {
    const local = scanLocalMedia();
    const page = pagination(req.query as Record<string, unknown>);
    const result: Record<string, unknown> = {
      mode: process.env.TORBOX_API_KEY?.trim() ? 'torbox-integrated' : 'local-offline',
      localMedia: { ...local, total: local.items.length, items: local.items.slice(page.offset, page.offset + page.limit), limit: page.limit, offset: page.offset },
      message: 'Local files are scanned from LOCAL_MEDIA_PATH.'
    };
    if (process.env.TORBOX_API_KEY?.trim()) {
      const response = await getTorrentList(undefined, { limit: page.limit, offset: page.offset });
      const data = response.data;
      const items = Array.isArray(data) ? data : data ? [data] : [];
      result.torbox = items;
      result.music = normalizeTorBoxMusicLibrary(items);
    }
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const getTorboxMusicLibraryRoute: RequestHandler = async (req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) {
    return res.status(503).json({ error: { code: 'torbox_not_configured', message: 'TORBOX_API_KEY is required for music features.' } });
  }
  try {
    const response = await getTorrentList(undefined, { limit: 1000 });
    const data = response.data;
    const items = Array.isArray(data) ? data : data ? [data] : [];
    const q = scalar(req.query.q)?.trim().toLocaleLowerCase();
    const albums = normalizeTorBoxMusicLibrary(items)
      .map(album => ({ ...album, tracks: q ? album.tracks.filter(track => `${album.name} ${track.name} ${track.path}`.toLocaleLowerCase().includes(q)) : album.tracks }))
      .filter(album => album.tracks.length > 0 && (!q || album.name.toLocaleLowerCase().includes(q) || album.tracks.length > 0));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ albums, totalAlbums: albums.length, totalTracks: albums.reduce((total, album) => total + album.tracks.length, 0) });
  } catch (error) {
    return sendError(res, error);
  }
};

export const streamTorboxTrackRoute: RequestHandler = async (req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) return res.status(503).json({ error: 'TORBOX_API_KEY is required for TorBox streaming.' });
  const torrentId = Number(req.params.torrentId);
  const fileId = Number(req.params.fileId);
  if (!Number.isSafeInteger(torrentId) || torrentId < 1 || !Number.isSafeInteger(fileId) || fileId < 0) {
    return res.status(400).json({ error: 'torrentId and fileId must be valid non-negative integers.' });
  }
  try {
    const downloadUrl = await requestTorrentDownload(torrentId, fileId);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.redirect(302, downloadUrl);
  } catch (error) {
    return sendError(res, error);
  }
};

export const triggerLibraryScanRoute: RequestHandler = (_req, res) => res.json({ success: true, ...scanLocalMedia() });
export const syncLibraryTorboxRoute: RequestHandler = async (_req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) return res.status(503).json({ error: 'TORBOX_API_KEY is not configured.' });
  try { return res.json(await getTorrentList(undefined, { bypass_cache: true, limit: 1000 })); }
  catch (error) { return sendError(res, error); }
};

export const addTorrentToTorboxRoute: RequestHandler = async (req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) return res.status(503).json({ error: 'TORBOX_API_KEY is not configured.' });
  const input = typeof req.body?.magnet === 'string' ? req.body.magnet.trim() : '';
  if (!input || input.length > 4096) return res.status(400).json({ error: 'Provide a magnet URI or 40-character torrent info hash.' });
  const magnet = /^[a-f0-9]{40}$/i.test(input)
    ? `magnet:?xt=urn:btih:${input.toLowerCase()}`
    : input;
  if (!/^magnet:\?\S+$/i.test(magnet) || !/(?:^|[?&])xt=urn:btih:[a-z0-9]{32,40}(?:&|$)/i.test(magnet)) {
    return res.status(400).json({ error: 'Magnet URI must include a valid BitTorrent info hash (xt=urn:btih:…). ' });
  }
  if (typeof req.body?.addOnlyIfCached !== 'undefined' && typeof req.body.addOnlyIfCached !== 'boolean') {
    return res.status(400).json({ error: 'addOnlyIfCached must be true or false.' });
  }
  try {
    const result = await addTorrentToTorbox(magnet, {
      addOnlyIfCached: req.body.addOnlyIfCached === true,
      name: typeof req.body.name === 'string' ? req.body.name : undefined
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ detail: result.detail, torrent: result.data });
  } catch (error) {
    return sendError(res, error);
  }
};
export const getLibraryStatusRoute: RequestHandler = (_req, res) => res.json(getLibraryStatus());

export const moviesRoute: RequestHandler = async (req, res) => {
  try {
    const page = pagination(req.query as Record<string, unknown>);
    const result = await searchTitles({ ...page, q: scalar(req.query.q), kind: 'movie' });
    return res.json({ ...result, importStatus: await getImportStatus() });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' }); }
};

export const showsRoute: RequestHandler = async (req, res) => {
  try {
    const page = pagination(req.query as Record<string, unknown>);
    const result = await searchTitles({ ...page, q: scalar(req.query.q), kind: 'series' });
    return res.json({ ...result, importStatus: await getImportStatus() });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' }); }
};

export const titleRoute: RequestHandler = async (req, res) => {
  const imdbId = req.params.imdbId;
  if (!/^tt\d+$/.test(imdbId)) return res.status(400).json({ error: 'IMDb ID must look like tt1234567.' });
  const title = await getTitle(imdbId);
  if (!title) return res.status(404).json({ error: 'Title not found. The IMDb dataset may not be imported yet.' });
  return res.json(title);
};

export const browseRoute: RequestHandler = async (req, res) => {
  const hash = scalar(req.query.hash);
  if (hash && process.env.TORBOX_API_KEY?.trim()) {
    try { return res.json({ cachedTorrent: await checkCachedTorrent(hash) }); }
    catch (error) { return sendError(res, error); }
  }
  try {
    const page = pagination(req.query as Record<string, unknown>);
    const kindValue = scalar(req.query.kind);
    const kind = kindValue === 'movie' || kindValue === 'series' ? kindValue : 'all';
    return res.json({ ...(await searchTitles({ ...page, q: scalar(req.query.q), kind })), torboxCacheCheckAvailable: Boolean(process.env.TORBOX_API_KEY?.trim()) });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' }); }
};

export const calendarRoute: RequestHandler = async (req, res) => {
  const date = scalar(req.query.date) || new Date().toISOString().slice(0, 10);
  const country = scalar(req.query.country);
  const web = scalar(req.query.type) === 'web';
  try { return res.json(await getTvmazeSchedule({ date, country, web })); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'TVMaze schedule request failed' }); }
};

export const tvmazeShowRoute: RequestHandler = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'TVMaze show ID must be a positive integer.' });
  try {
    const show = await getTvmazeShow(id);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.json(show);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'TVMaze show lookup failed.' });
  }
};

export const titleArtworkRoute: RequestHandler = async (req, res) => {
  const imdbId = req.params.imdbId;
  if (!/^tt\d+$/.test(imdbId)) return res.status(400).json({ error: 'IMDb ID must look like tt1234567.' });
  const kind = scalar(req.query.kind) === 'series' ? 'series' : 'movie';
  const artwork = await getTitleArtwork(imdbId, kind);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.json({ artwork });
};

export const musicArtworkRoute: RequestHandler = async (req, res) => {
  const query = scalar(req.query.q)?.trim();
  if (!query || query.length < 2 || query.length > 180) {
    return res.status(400).json({ error: 'Artwork search must be between 2 and 180 characters.' });
  }
  const artwork = await getMusicArtwork(query);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.json({ artwork });
};

let importPromise: Promise<unknown> | undefined;
export const imdbImportRoute: RequestHandler = async (_req, res) => {
  if (importPromise) return res.status(202).json({ status: 'running' });
  importPromise = importImdbDatasets()
    .catch((error: unknown) => { console.error('IMDb import failed:', error instanceof Error ? error.message : 'unknown error'); })
    .finally(() => { importPromise = undefined; });
  try { return res.status(202).json({ status: 'started', titlesBeforeImport: await countTitles() }); }
  catch (error) { return sendError(res, error); }
};
