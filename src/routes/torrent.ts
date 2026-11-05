import type { RequestHandler } from 'express';
import { getTitle } from '../db/database';
import { addTorrentToTorbox, checkCachedTorrent, getTorrentList, TorboxApiError } from '../services/torbox/client';
import { searchTorrentCandidates, type TorrentCandidate } from '../services/torbox/torrentSearch';
import { searchIndexerTorrents } from '../services/musicSearch';
import { pagination, sendError } from './routeUtils';

export const addTorrentToTorboxRoute: RequestHandler = async (req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) return res.status(503).json({ error: 'TORBOX_API_KEY is not configured.' });
  const input = typeof req.body?.magnet === 'string' ? req.body.magnet.trim() : '';
  if (!input || input.length > 4096) return res.status(400).json({ error: 'Provide a magnet URI or 40-character torrent info hash.' });
  const magnet = /^[a-f0-9]{40}$/i.test(input) ? `magnet:?xt=urn:btih:${input.toLowerCase()}` : input;
  if (!/^magnet:\?\S+$/i.test(magnet) || !/(?:^|[?&])xt=urn:btih:[a-z0-9]{32,40}(?:&|$)/i.test(magnet)) {
    return res.status(400).json({ error: 'Magnet URI must include a valid BitTorrent info hash (xt=urn:btih:…). ' });
  }
  if (typeof req.body?.addOnlyIfCached !== 'undefined' && typeof req.body.addOnlyIfCached !== 'boolean') {
    return res.status(400).json({ error: 'addOnlyIfCached must be true or false.' });
  }
  try {
    if (req.body.addOnlyIfCached === true) {
      const hashMatch = /[?&]xt=urn:btih:([a-f0-9]{32,40})/i.exec(magnet);
      if (hashMatch) {
        const hash = hashMatch[1].toLowerCase();
        try { await checkCachedTorrent(hash, process.env.TORBOX_API_KEY!); } catch {
          return res.status(404).json({ error: 'Torrent not found in cache. Disable the add only if cached parameter to add the download.' });
        }
      }
    }
    const result = await addTorrentToTorbox(magnet, {
      addOnlyIfCached: req.body.addOnlyIfCached === true,
      name: typeof req.body.name === 'string' ? req.body.name : undefined,
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
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
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
      searchIndexerTorrents(torznabQuery, kind === 'series' ? 'tvsearch' : 'movie', [kind === 'series' ? '5000' : '2000'], page.limit, page.offset),
    ]);
    const providerNames = ['Torrentio', 'Prowlarr'];
    const successful: TorrentCandidate[] = searches.flatMap((result) => result.status === 'fulfilled' ? result.value as TorrentCandidate[] : []);
    const errors = searches.flatMap((result, index) => result.status === 'rejected' ? [`${providerNames[index]}: ${result.reason instanceof Error ? result.reason.message : 'search failed'}`] : []);
    if (!successful.length && errors.length === searches.length) throw new Error(errors.join(' · '));
    const unique = new Map<string, typeof successful[number]>();
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
    const candidates = [...unique.values()].slice(0, 80);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ candidates, total: candidates.length, source: 'Torrentio + Prowlarr', warnings: errors });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Torrent search failed.' });
  }
};
