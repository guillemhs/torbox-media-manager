import type { RequestHandler } from 'express';
import { countTitles, getImportStatus, getTitle, searchTitles } from '../db/database';
import { importImdbDatasets } from '../services/imdb/import.service';
import { getLibraryStatus, scanLocalMedia } from '../services/media.service';
import { addTorrentToTorbox, addUsenetNzb, checkCachedTorrent, getTorrentList, getUsenetList, requestTorrentDownload, requestUsenetDownload, TorboxApiError } from '../services/torbox/client';
import { normalizeTorBoxMusicLibrary } from '../services/torbox/musicLibrary';
import { getTvmazeSchedule, getTvmazeShow, getTvmazeShowByImdb, getTvmazeMonthlyCalendar } from '../services/tvmaze/schedule.service';
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

function taggedDownloads(data: unknown, mediaType: 'torrent' | 'usenet'): Array<Record<string, unknown>> {
  const values = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
  return values.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object').map(item => ({ ...item, _media_type: mediaType }));
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
      const [torrentResponse, usenetResponse] = await Promise.allSettled([
        getTorrentList(undefined, { limit: page.limit, offset: page.offset }),
        getUsenetList(undefined, { limit: page.limit, offset: page.offset })
      ]);
      if (torrentResponse.status === 'rejected') throw torrentResponse.reason;
      const torrentItems = taggedDownloads(torrentResponse.value.data, 'torrent');
      const usenetItems = taggedDownloads(usenetResponse.status === 'fulfilled' ? usenetResponse.value.data : [], 'usenet');
      result.torbox = [...torrentItems, ...usenetItems];
      result.music = normalizeTorBoxMusicLibrary(torrentItems);
      if (usenetResponse.status === 'rejected') result.usenetError = usenetResponse.reason instanceof Error ? usenetResponse.reason.message : 'TorBox Usenet library is unavailable.';
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
  const page = pagination(req.query as Record<string, unknown>);
  try {
    const data = await searchUsenet(query, sourceValue as 'all' | 'NZBIndex' | 'Binsearch', page.limit, page.offset);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json(data);
  } catch (error) { return sendError(res, error); }
};

export const addUsenetToTorboxRoute: RequestHandler = async (req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) return res.status(503).json({ error: 'TORBOX_API_KEY is not configured.' });
  const source = scalar(req.body?.source);
  const id = scalar(req.body?.id)?.trim() || '';
  const requestedName = scalar(req.body?.name)?.trim() || '';
  const mediaName = /"([^"]+\.(?:mp3|mp4|m4v|mkv|avi|mov|wmv|flac|m4a|ogg|wav|ts|m2ts|webm))"/i.exec(requestedName)?.[1];
  const name = (mediaName || requestedName).replace(/^\[\d+\/\d+\]\s*[-–]?\s*/, '').replace(/\s+yEnc\s+\d+.*$/i, '').trim().slice(0, 200);
  if ((source !== 'NZBIndex' && source !== 'Binsearch') || !id) return res.status(400).json({ error: 'A valid NZB source and result ID are required.' });
  try {
    const nzb = await fetchUsenetNzb(source, id);
    const result = await addUsenetNzb(nzb, { name, addOnlyIfCached: req.body?.addOnlyIfCached === true });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ detail: result.detail, usenet: result.data });
  } catch (error) { return sendError(res, error); }
};

export const downloadUsenetFileRoute: RequestHandler = async (req, res) => {
  const usenetId = req.params.usenetId;
  const fileId = req.params.fileId;
  if (!/^[\w-]{1,100}$/.test(usenetId) || !/^\d{1,20}$/.test(fileId)) return res.status(400).json({ error: 'Usenet download and file IDs are invalid.' });
  try { return res.redirect(302, await requestUsenetDownload(usenetId, fileId)); }
  catch (error) { return sendError(res, error); }
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
    // When addOnlyIfCached is true, verify the torrent is cached before adding
    if (req.body.addOnlyIfCached === true) {
      const hashMatch = /[?&]xt=urn:btih:([a-f0-9]{32,40})/i.exec(magnet);
      if (hashMatch) {
        const hash = hashMatch[1].toLowerCase();
        try {
          await checkCachedTorrent(hash, process.env.TORBOX_API_KEY!);
        } catch {
          return res.status(404).json({ error: 'Torrent not found in cache. Disable the add only if cached parameter to add the download.' });
        }
      }
    }
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
  const page = pagination(req.query as Record<string, unknown>);
  try {
    const season = Number(seasonValue);
    const torznabQuery = kind === 'series' ? `${title} S${String(season).padStart(2, '0')}` : title;
    const searches = await Promise.allSettled([
      searchTorrentCandidates(imdbId, kind, season, page.limit, page.offset),
      searchIndexerTorrents(torznabQuery, kind === 'series' ? 'tvsearch' : 'movie', [kind === 'series' ? '5000' : '2000'], page.limit, page.offset)
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
        size: existing.size ?? candidate.size,
        downloadToken: existing.downloadToken ?? candidate.downloadToken
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
  const page = pagination(req.query as Record<string, unknown>);
  try {
    const candidates = await searchMusicTorrents(query, undefined, page.limit, page.offset);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ candidates, total: candidates.length, source: 'Torznab' });
  } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Music torrent search failed.' }); }
};

export const musicRoute: RequestHandler = async (req, res) => {
  try {
    const page = pagination(req.query as Record<string, unknown>);
    const q = scalar(req.query.q) || '';
    // If coming from /browse with a category filter, preserve it
    const kind = scalar(req.query.kind) || 'music';
    const result = await searchMusicMetadata(q);
    const releasesWithSource = result.map((release: any) => ({
      ...release,
      _source: 'local-music'
    }));
    
    // Build browse link with category filter
    const browseLink = kind === 'music'
      ? '/browse?q=' + encodeURIComponent(q || '') + '&kind=music'
      : '/browse';
    
    return res.json({ 
      releases: releasesWithSource,
      total: releasesWithSource.length,
      source: 'MusicBrainz',
      browseLink: '/browse?q=' + encodeURIComponent(q || '') + '&kind=music'
    });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' }); }
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
    const q = scalar(req.query.q);
    // If coming from /browse with a category filter, preserve it
    const kind = scalar(req.query.kind) || 'movie';
    const result = await searchTitles({ ...page, q, kind: 'movie' });
    const itemsWithSource = result.items.map(item => ({ ...item, _source: 'local-movies' }));
    
    // Build browse link with category filter
    const browseLink = kind === 'movie'
      ? '/browse?q=' + encodeURIComponent(q || '') + '&kind=movie'
      : '/browse';
    
    return res.json({ 
      ...result, 
      items: itemsWithSource, 
      importStatus: await getImportStatus(),
      browseLink: '/browse?q=' + encodeURIComponent(q || '') + '&kind=movie'
    });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' }); }
};

export const showsRoute: RequestHandler = async (req, res) => {
  try {
    const page = pagination(req.query as Record<string, unknown>);
    const q = scalar(req.query.q);
    // If coming from /browse with a category filter, preserve it
    const kind = scalar(req.query.kind) || 'series';
    const result = await searchTitles({ ...page, q, kind: 'series' });
    const itemsWithSource = result.items.map(item => ({ ...item, _source: 'local-shows' }));
    
    // Build browse link with category filter
    const browseLink = kind === 'series'
      ? '/browse?q=' + encodeURIComponent(q || '') + '&kind=series'
      : '/browse';
    
    return res.json({ 
      ...result, 
      items: itemsWithSource, 
      importStatus: await getImportStatus(),
      browseLink: '/browse?q=' + encodeURIComponent(q || '') + '&kind=series'
    });
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
    const query = scalar(req.query.q) || '';
    
    // Search local titles
    const localResult = await searchTitles({ ...page, q: query, kind });
    
    // Search torrents and usenet
    const hasIndexerConfig = Boolean(process.env.TORZNAB_URL?.trim() && process.env.TORZNAB_API_KEY?.trim());
    const torrentUsenetResults: Array<Record<string, unknown>> = [];
    
    if (hasIndexerConfig) {
      // Search torrents via Torrentio/Prowlarr
      const torrentCandidates = await searchTorrentCandidates(
        '', // We don't have imdbId for general search
        'movie' // default kind
      );
      
      // Convert torrent candidates to result format
      for (const candidate of torrentCandidates) {
        torrentUsenetResults.push({
          name: candidate.name,
          _type: 'torrent',
          seeders: candidate.seeders,
          leechers: candidate.leechers,
          size: candidate.size,
          source: candidate.source,
          // Try to determine category from the name or use default
          _category: extractCategoryFromName(candidate.name)
        });
      }
    }
    
    // Search usenet
    if (hasIndexerConfig) {
      const usenetResult = await searchUsenet(query, 'all', 50, 0);
      for (const candidate of usenetResult.candidates) {
        torrentUsenetResults.push({
          name: candidate.name,
          _type: 'usenet',
          _category: extractCategoryFromName(candidate.name)
        });
      }
    }
    
    // Combine results: local titles first, then torrents, then usenet
    const allResults = [
      ...localResult.items.map((item: any) => ({
        ...item,
        _type: 'local',
        _category: extractCategoryFromTitle(item.primaryTitle, item.titleType)
      })),
      ...torrentUsenetResults
    ];
    
    // Separate by type for display
    const torrents = allResults.filter(r => r._type === 'torrent');
    const usenet = allResults.filter(r => r._type === 'usenet');
    const local = allResults.filter(r => r._type === 'local');
    
    // Format torrent metadata
    const formattedTorrents = torrents.map((t: any) => ({
      ...t,
      _metadata: formatTorrentMetadata(t.seeders, t.leechers, t.size)
    }));
    
    const formattedUsenet = usenet.map((u: any) => ({
      ...u,
      _metadata: formatUsenetMetadata(u)
    }));
    
    return res.json({
      query,
      kind,
      results: {
        local: { items: localResult.items.slice(page.offset, page.offset + page.limit), total: localResult.total },
        torrents: { items: formattedTorrents.slice(page.offset, page.offset + page.limit), total: formattedTorrents.length },
        usenet: { items: formattedUsenet.slice(page.offset, page.offset + page.limit), total: formattedUsenet.length }
      },
      torboxCacheCheckAvailable: Boolean(process.env.TORBOX_API_KEY?.trim())
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' });
  }
};

// Helper function to extract category from a title
function extractCategoryFromTitle(title: string, titleType: string): string {
  if (!title) return '';
  const lowerTitle = title.toLowerCase();
  // Movie categories
  if (titleType === 'movie') {
    if (/\b(?:action|adventure|comedy|drama|horror|thriller|sci-fi|fantasy|animation)\b/.test(lowerTitle)) {
      return 'Movie';
    }
  }
  // Series categories
  if (titleType === 'tvSeries' || titleType === 'tvMiniSeries') {
    if (/\b(?:drama|comedy|action|sci-fi|fantasy|horror|mystery|crime)\b/.test(lowerTitle)) {
      return 'Series';
    }
  }
  return '';
}

// Helper function to extract category from a torrent/usenet name
function extractCategoryFromName(name: string): string {
  if (!name) return '';
  const lowerName = name.toLowerCase();
  // Common category keywords
  const categories: [string, RegExp][] = [
    ['Movies', /\b(movie|film|hd|bluray|dvd)\b/],
    ['Series', /\b(?:tv|series|season|episode)\b/],
    ['Music', /\b(?:music|album|single|track)\b/],
    ['Games', /\b(?:game|pc|ps|xbox|nintendo)\b/],
    ['Software', /\b(?:software|app|windows|mac|linux)\b/],
    ['Ebooks', /\b(?:ebook|book|novel)\b/],
    ['XXX', /\b(?:porn|sex|xxx)\b/]
  ];
  
  for (const [category, pattern] of categories) {
    if (pattern.test(lowerName)) {
      return category;
    }
  }
  return '';
}

// Helper function to format torrent metadata
function formatTorrentMetadata(seeders: number | null, leechers: number | null, size: number | null): string {
  const seedersStr = seeders !== null ? String(seeders) : '0';
  const leechersStr = leechers !== null ? String(leechers) : '0';
  const sizeStr = size !== null ? `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB` : 'Unknown size';
  
  return `${seedersStr} seeders · ${leechersStr} leechers · ${sizeStr} · Torrentio`;
}

// Helper function to format usenet metadata
function formatUsenetMetadata(candidate: { posted?: number; complete?: boolean }): string {
  const seedersStr = '0'; // Usenet doesn't have seeders/leechers in the same way
  const leechersStr = '0';
  const postedStr = candidate.posted ? new Date(candidate.posted * 1000).toLocaleDateString() : 'Unknown';
  const completeStr = candidate.complete ? 'Complete' : 'Partial';
  
  return `${seedersStr} seeders · ${leechersStr} leechers · ${postedStr} · ${completeStr}`;
}

// Unified search endpoint - combines all sources into a single tagged list with pagination
export const unifiedSearchRoute: RequestHandler = async (req, res) => {
  const query = scalar(req.query.q)?.trim() || '';
  if (query.length < 2 || query.length > 180) {
    return res.status(400).json({ error: 'Search query must be between 2 and 180 characters.' });
  }

  const page = pagination(req.query as Record<string, unknown>, 100);
  const kindValue = scalar(req.query.kind);
  const kind = kindValue === 'movie' || kindValue === 'series' || kindValue === 'music' || kindValue === 'torrents' || kindValue === 'usenet' ? kindValue : 'all';
  
  // Source filters: 'local' (IMDb/MusicBrainz), 'indexers' (Prowlarr/Torrentio), 'usenet' (NZBIndex/Binsearch)
  const sourcesParam = scalar(req.query.sources) || 'local';
  const sources = sourcesParam.split(',').filter(s => ['local', 'indexers', 'usenet'].includes(s));
  
  // Indexer filters: 'prowlarr', 'torrentio'
  const indexersParam = scalar(req.query.indexers) || 'prowlarr,torrentio';
  const indexers = indexersParam.split(',').filter(s => ['prowlarr', 'torrentio'].includes(s));
  
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
          const musicTorrents = await searchMusicTorrents(query, indexers, 200, 0);
          torrentCandidates.push(...musicTorrents);
          if (indexers.includes('prowlarr')) sourceNames.push('Prowlarr');
          if (indexers.includes('torrentio')) sourceNames.push('Torrentio');
        }

        if ((kind === 'movie' || kind === 'series' || kind === 'all') && (kind !== 'all' || !torrentCandidates.length)) {
          const localResults = await searchTitles({ limit: 5, q: query, kind: kind === 'all' ? 'movie' : kind });
          if (localResults.items.length > 0) {
            const firstResult = localResults.items[0] as { imdbId: string; titleType: string; primaryTitle: string };
            const imdbId = firstResult.imdbId;
            const mediaKind = firstResult.titleType.startsWith('tv') ? 'series' : 'movie';
            
            const searches: Promise<unknown>[] = [];
            const providerNames: string[] = [];
            
            if (indexers.includes('torrentio')) {
              searches.push(searchTorrentCandidates(imdbId, mediaKind, 1, 200, 0));
              providerNames.push('Torrentio');
            }
            if (indexers.includes('prowlarr')) {
              searches.push(searchIndexerTorrents(
                mediaKind === 'series' ? `${firstResult.primaryTitle} S01` : firstResult.primaryTitle,
                mediaKind === 'series' ? 'tvsearch' : 'movie',
                [mediaKind === 'series' ? '5000' : '2000'],
                200,
                0
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
                downloadToken: existing.downloadToken ?? candidate.downloadToken
              } : candidate);
            }
            torrentCandidates.push(...[...unique.values()]);
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
        const usenetResult = await searchUsenet(query, sourceValue as 'all' | 'NZBIndex' | 'Binsearch', 200, 0);
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
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Search failed.' });
  }
};

export const calendarRoute: RequestHandler = async (req, res) => {
  // Check if monthly calendar is requested (year + month provided)
  const year = scalar(req.query.year);
  const month = scalar(req.query.month);
  
  if (year && month) {
    // Monthly calendar mode - uses streaming/web schedule with popularity filtering
    const yearNum = Number(year);
    const monthNum = Number(month);
    if (!Number.isInteger(yearNum) || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'year and month must be valid integers (month 1-12)' });
    }
    try {
      const filter = scalar(req.query.filter) === 'all' ? 'all' : 'popular';
      const minRating = scalar(req.query.minRating) ? Number(scalar(req.query.minRating)) : 7.0;
      const limitPerDay = scalar(req.query.limitPerDay) ? Number(scalar(req.query.limitPerDay)) : 50;
      if (!Number.isFinite(minRating) || minRating < 0 || minRating > 10) {
        return res.status(400).json({ error: 'minRating must be a number between 0 and 10' });
      }
      if (!Number.isInteger(limitPerDay) || limitPerDay < 1 || limitPerDay > 200) {
        return res.status(400).json({ error: 'limitPerDay must be an integer between 1 and 200' });
      }
      return res.json(await getTvmazeMonthlyCalendar({ year: yearNum, month: monthNum, filter, minRating, limitPerDay }));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Monthly calendar request failed' });
    }
  }
  
  // Daily schedule mode (existing behavior)
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