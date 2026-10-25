import type { RequestHandler } from 'express';
import { countTitles, getImportStatus, getTitle, searchTitles } from '../db/database';
import { importImdbDatasets } from '../services/imdb/import.service';
import { getLibraryStatus, scanLocalMedia } from '../services/media.service';
import { addTorrentToTorbox, addUsenetNzb, checkCachedTorrent, getTorrentList, requestTorrentDownload, TorboxApiError } from '../services/torbox/client';
import { normalizeTorBoxMusicLibrary } from '../services/torbox/musicLibrary';
import { getTvmazeSchedule, getTvmazeShow, getTvmazeShowByImdb } from '../services/tvmaze/schedule.service';
import { getMusicArtwork, getMusicArtworkByReleaseGroup, getTitleArtwork, getTitleMetadata } from '../services/artwork.service';
import { searchTorrentCandidates, type TorrentCandidate } from '../services/torbox/torrentSearch';
import { getMusicTorrentDownload, searchIndexerTorrents, searchMusicMetadata, searchMusicTorrents } from '../services/musicSearch';
import { fetchUsenetNzb, searchUsenet } from '../services/usenetSearch';

function sendError(res: Parameters<RequestHandler>[1], error: unknown) {
  const status = error instanceof TorboxApiError ? error.status : 502;
  return res.status(status).json({ error: error instanceof Error ? error.message : 'Request failed' });
}

function scalar(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function pagination(query: Record<string, unknown>, maxLimit = 200) {
  const number = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('limit and offset must be non-negative integers');
    return Number(value);
  };
  return { limit: Math.min(maxLimit, Math.max(1, number(query.limit, 50))), offset: number(query.offset, 0) };
}

export const getLibraryRoute: RequestHandler = async (req, res) => {
  try {
    const local = scanLocalMedia();
    const page = pagination(req.query as Record<string, unknown>, 1000);
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

export const usenetSearchRoute: RequestHandler = async (req, res) => {
  const query = scalar(req.query.q)?.trim() || '';
  const sourceValue = scalar(req.query.source) || 'all';
  if (query.length < 2 || query.length > 180) return res.status(400).json({ error: 'Usenet search must be between 2 and 180 characters.' });
  if (!['all', 'NZBIndex', 'Binsearch'].includes(sourceValue)) return res.status(400).json({ error: 'source must be all, NZBIndex, or Binsearch.' });
  try {
    const data = await searchUsenet(query, sourceValue as 'all' | 'NZBIndex' | 'Binsearch');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json(data);
  } catch (error) { return sendError(res, error); }
};

export const addUsenetToTorboxRoute: RequestHandler = async (req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) return res.status(503).json({ error: 'TORBOX_API_KEY is not configured.' });
  const source = scalar(req.body?.source);
  const id = scalar(req.body?.id)?.trim() || '';
  const name = scalar(req.body?.name)?.trim().slice(0, 200) || '';
  if ((source !== 'NZBIndex' && source !== 'Binsearch') || !id) return res.status(400).json({ error: 'A valid NZB source and result ID are required.' });
  try {
    const nzb = await fetchUsenetNzb(source, id);
    const result = await addUsenetNzb(nzb, { name, addOnlyIfCached: req.body?.addOnlyIfCached === true });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ detail: result.detail, usenet: result.data });
  } catch (error) { return sendError(res, error); }
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
    const torrentId = Number(result.data?.torrent_id);
    let libraryItem: unknown = result.data;
    if (Number.isSafeInteger(torrentId) && torrentId > 0) {
      try {
        const refreshed = await getTorrentList(undefined, { id: torrentId, bypass_cache: true });
        libraryItem = Array.isArray(refreshed.data) ? refreshed.data[0] ?? result.data : refreshed.data ?? result.data;
      } catch {
        // Adding succeeded; keep the accepted response if the immediate library lookup is delayed.
      }
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ detail: result.detail, torrent: libraryItem, libraryRefreshed: libraryItem !== result.data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const torrentSearchRoute: RequestHandler = async (req, res) => {
  const imdbId = scalar(req.query.imdbId) || '';
  const kind = scalar(req.query.kind) === 'series' ? 'series' : 'movie';
  const seasonValue = scalar(req.query.season) || '1';
  if (!/^\d{1,2}$/.test(seasonValue) || Number(seasonValue) < 1 || Number(seasonValue) > 99) return res.status(400).json({ error: 'Season must be between 1 and 99.' });
  if (!/^tt\d+$/.test(imdbId)) return res.status(400).json({ error: 'A valid IMDb ID is required for torrent search.' });
  const storedTitle = await getTitle(imdbId) as { primaryTitle?: string } | null;
  const title = (scalar(req.query.title)?.trim() || storedTitle?.primaryTitle || '').slice(0, 180);
  if (!title) return res.status(404).json({ error: 'A title is required for indexer search.' });
  try {
    const season = Number(seasonValue);
    const torznabQuery = kind === 'series' ? `${title} S${String(season).padStart(2, '0')}` : title;
    const searches = await Promise.allSettled([
      searchTorrentCandidates(imdbId, kind, season),
      searchIndexerTorrents(torznabQuery, kind === 'series' ? 'tvsearch' : 'movie', [kind === 'series' ? '5000' : '2000'])
    ]);
    const providerNames = ['Torrentio', 'Prowlarr'];
    const successful: TorrentCandidate[] = searches.flatMap((result) => result.status === 'fulfilled' ? result.value as TorrentCandidate[] : []);
    const errors = searches.flatMap((result, index) => result.status === 'rejected'
      ? [`${providerNames[index]}: ${result.reason instanceof Error ? result.reason.message : 'search failed'}`]
      : []);
    if (!successful.length && errors.length === searches.length) throw new Error(errors.join(' · '));
    const unique = new Map<string, typeof successful[number]>();
    for (const candidate of successful) {
      const existing = unique.get(candidate.hash);
      unique.set(candidate.hash, existing ? {
        ...existing,
        seeders: existing.seeders ?? candidate.seeders,
        leechers: existing.leechers ?? candidate.leechers,
        size: existing.size ?? candidate.size
      } : candidate);
    }
    const candidates = [...unique.values()].slice(0, 80);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ candidates, total: candidates.length, source: 'Torrentio + Prowlarr', warnings: errors });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Torrent search failed.' });
  }
};

export const musicMetadataSearchRoute: RequestHandler = async (req, res) => {
  const query = scalar(req.query.q)?.trim() || '';
  if (query.length < 2 || query.length > 180) return res.status(400).json({ error: 'Music search must be between 2 and 180 characters.' });
  try {
    const releases = await searchMusicMetadata(query);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({ releases, total: releases.length, source: 'MusicBrainz' });
  } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Music metadata search failed.' }); }
};

export const musicTorrentSearchRoute: RequestHandler = async (req, res) => {
  const query = scalar(req.query.q)?.trim() || '';
  if (query.length < 2 || query.length > 180) return res.status(400).json({ error: 'Music torrent search must be between 2 and 180 characters.' });
  try {
    const candidates = await searchMusicTorrents(query);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ candidates, total: candidates.length, source: 'Torznab' });
  } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Music torrent search failed.' }); }
};

export const musicTorrentDownloadRoute: RequestHandler = async (req, res) => {
  const token = scalar(req.params.token) || '';
  if (!/^[a-f0-9-]{36}$/i.test(token)) return res.status(400).json({ error: 'Torrent download link is invalid or expired.' });
  try {
    const torrent = await getMusicTorrentDownload(token);
    if (!torrent) return res.status(404).json({ error: 'Torrent file is no longer available from the indexer.' });
    res.setHeader('Content-Type', 'application/x-bittorrent');
    const fallbackName = torrent.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(torrent.name)}`);
    res.setHeader('Content-Length', torrent.data.length);
    return res.send(torrent.data);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Torrent download failed.' });
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
  const kind = typeof title.titleType === 'string' && /^tv/i.test(title.titleType) ? 'series' : 'movie';
  const metadata = await getTitleMetadata(imdbId, kind);
  let tvmaze: Record<string, unknown> | null = null;
  if (kind === 'series') {
    try { tvmaze = await getTvmazeShowByImdb(imdbId) as Record<string, unknown> | null; } catch { /* optional title enrichment */ }
  }
  const seasons = Array.isArray(tvmaze?._embedded && (tvmaze._embedded as Record<string, unknown>).seasons) ? (tvmaze!._embedded as Record<string, unknown>).seasons as unknown[] : [];
  const image = tvmaze?.image && typeof tvmaze.image === 'object' ? (tvmaze.image as Record<string, unknown>).original || (tvmaze.image as Record<string, unknown>).medium : undefined;
  const tvArtwork = typeof image === 'string' && /^https:\/\/static\.tvmaze\.com\//.test(image) ? { url: image, source: 'TVMaze' } : undefined;
  return res.json({ ...title, overview: metadata?.overview || (typeof tvmaze?.summary === 'string' ? tvmaze.summary.replace(/<[^>]*>/g, ' ').trim() : ''), releaseDate: metadata?.releaseDate || tvmaze?.premiered || (title.startYear ? `${title.startYear}-01-01` : undefined), seasonCount: metadata?.seasonCount ?? (seasons.length || undefined), showStatus: typeof tvmaze?.status === 'string' ? tvmaze.status : undefined, artwork: metadata?.artwork || tvArtwork });
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
  const releaseGroupId = scalar(req.query.id)?.trim();
  if (releaseGroupId) {
    const artwork = getMusicArtworkByReleaseGroup(releaseGroupId);
    if (!artwork) return res.status(400).json({ error: 'MusicBrainz release group ID is invalid.' });
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.json({ artwork });
  }
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
