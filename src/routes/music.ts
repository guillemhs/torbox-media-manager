import type { RequestHandler } from 'express';
import { searchMusicMetadata, searchMusicTorrents, getMusicTorrentDownload } from '../services/musicSearch';
import { getMusicArtwork, getMusicArtworkByReleaseGroup } from '../services/artwork.service';
import { pagination, sendError } from './routeUtils';
import { searchMedia } from '../services/search/search.service';

export const musicMetadataSearchRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const query = scalar(req.query.q)?.trim() || '';
  if (query.length < 2 || query.length > 180) return res.status(400).json({ error: 'Music search must be between 2 and 180 characters.' });
  try {
    const releases = await searchMusicMetadata(query);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({ releases, total: releases.length, source: 'MusicBrainz' });
  } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Music metadata search failed.' }); }
};

export const musicTorrentSearchRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
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
    const result = await searchMedia({
      query: typeof req.query.q === 'string' ? req.query.q : '',
      kind: 'music',
      page: pagination(req.query as Record<string, unknown>),
      useMusicBrainz: true,
      localSourceLabel: 'local-music',
      indexerCategories: ['3000'],
      categoryMode: 'fixed',
      fixedCategory: 'Music',
      browseLink: `/browse?q=${encodeURIComponent(typeof req.query.q === 'string' ? req.query.q : '')}&kind=music`,
    });
    console.warn('[Music route] response:', {
      query: result.query,
      localCount: result.results.local.items.length,
      torrentCount: result.results.torrents.items.length,
      usenetCount: result.results.usenet.items.length,
    });
    return res.json(result);
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid query' }); }
};

export const musicTorrentDownloadRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
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

export const musicArtworkRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const releaseGroupId = scalar(req.query.id)?.trim();
  if (releaseGroupId) {
    const artwork = await getMusicArtworkByReleaseGroup(releaseGroupId);
    if (!artwork) return res.status(400).json({ error: 'MusicBrainz release group ID is invalid.' });
    try {
      const imageResp = await fetch(artwork.url, { signal: AbortSignal.timeout(15_000) });
      if (!imageResp.ok) {
        return res.status(502).json({ error: 'Failed to fetch artwork image.' });
      }
      const contentType = imageResp.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Type', contentType);
      const buffer = Buffer.from(await imageResp.arrayBuffer());
      return res.send(buffer);
    } catch {
      return res.status(502).json({ error: 'Failed to fetch artwork image.' });
    }
  }
  const query = scalar(req.query.q)?.trim();
  if (!query || query.length < 2 || query.length > 180) {
    return res.status(400).json({ error: 'Artwork search must be between 2 and 180 characters.' });
  }
  const artwork = await getMusicArtwork(query);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.json({ artwork });
};
