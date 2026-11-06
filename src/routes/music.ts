import type { RequestHandler } from 'express';
import { searchMusicMetadata, searchMusicTorrents, getMusicTorrentDownload } from '../services/musicSearch';
import { getMusicArtwork, getMusicArtworkByReleaseGroup } from '../services/artwork.service';
import { pagination, sendError } from './routeUtils';

import { searchMedia } from '../services/search/search.service';

function parseSources(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(',').filter(s => ['local', 'indexers', 'usenet'].includes(s));
}

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
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const sources = parseSources(scalar(req.query.sources));
  const hasIndexerConfig = Boolean(process.env.TORZNAB_URL?.trim() && process.env.TORZNAB_API_KEY?.trim());
  const searchIndexers = sources.includes('indexers') && hasIndexerConfig;
  const searchUsenet = sources.includes('usenet') && hasIndexerConfig;
  const searchLocal = sources.includes('local') || sources.length === 0;
  try {
    const result = await searchMedia({
      query: typeof req.query.q === 'string' ? req.query.q : '',
      kind: 'music',
      page: pagination(req.query as Record<string, unknown>),
      useMusicBrainz: searchLocal,
      localSourceLabel: 'local-music',
      indexerCategories: searchIndexers ? ['3000'] : undefined,
      categoryMode: 'fixed',
      fixedCategory: 'Music',
      includeLocal: searchLocal,
      includeIndexers: searchIndexers,
      includeUsenet: searchUsenet,
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

export const musicDetailRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const mbId = scalar(req.params.id) || '';
  if (!/^[a-f0-9-]{36}$/i.test(mbId)) {
    return res.status(400).json({ error: 'Invalid MusicBrainz ID.' });
  }
  try {
    const url = new URL(`https://musicbrainz.org/ws/2/release-group/${mbId}`);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('inc', 'artists');
    const release = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'TorBoxMediaManager/1.0 (self-hosted media manager)' },
      signal: AbortSignal.timeout(10_000)
    });
    if (!release.ok) {
      return res.status(502).json({ error: 'Failed to fetch music release details.' });
    }
    const data = await release.json() as Record<string, unknown>;
    
    const id = typeof data.id === 'string' ? data.id : '';
    const title = typeof data.title === 'string' ? data.title : 'Unknown release';
    const type = typeof data['primary-type'] === 'string' ? data['primary-type'] : 'Release';
    const date = typeof data['first-release-date'] === 'string' ? data['first-release-date'] : '';
    
    // Extract artist
    let artist = '';
    const artistCredit = data['artist-credit'];
    if (Array.isArray(artistCredit)) {
      const names = artistCredit.map((credit: any) => {
        if (credit.name) return credit.name;
        if (credit.artist && typeof credit.artist === 'object') return credit.artist.name;
        return '';
      }).filter(Boolean);
      artist = names.join(' ');
    }
    
    const cover = `https://coverartarchive.org/release-group/${id}/front-250`;
    
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json({
      id,
      title,
      artist,
      date,
      type,
      cover,
      _source: 'MusicBrainz',
      _category: 'Music'
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to fetch music release details.' });
  }
};
