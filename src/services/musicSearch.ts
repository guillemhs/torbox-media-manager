import { createHash, randomUUID } from 'node:crypto';

export interface MusicRelease {
  id: string;
  title: string;
  artist: string;
  date: string;
  type: string;
  cover: string;
}

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

export async function searchMusicMetadata(query: string, limit = 25, offset = 0): Promise<MusicRelease[]> {
  const url = new URL('https://musicbrainz.org/ws/2/release-group');
  url.searchParams.set('query', query);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set('offset', String(Math.max(0, offset)));
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'TorBoxMediaManager/1.0 (self-hosted media manager)' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`MusicBrainz returned HTTP ${response.status}.`);
  const body = await response.json() as Record<string, unknown>;
  const groups = body['release-groups'];
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((raw): MusicRelease[] => {
    if (!raw || typeof raw !== 'object') return [];
    const group = raw as Record<string, unknown>;
    const id = text(group.id);
    if (!/^[a-f0-9-]{36}$/i.test(id)) return [];
    const artists = Array.isArray(group['artist-credit']) ? group['artist-credit'] as Record<string, unknown>[] : [];
    const artist = artists.map((credit) => text(credit.name) || text((credit.artist as Record<string, unknown> | undefined)?.name)).filter(Boolean).join(' ');
    const date = text(group['first-release-date']);
    const cover = `https://coverartarchive.org/release-group/${id}/front-250`;
    return [{ id, title: text(group.title) || 'Unknown release', artist, date, type: text(group['primary-type']), cover }];
  });
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function tag(item: string, name: string): string {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(item);
  return match ? decodeXml(match[1].trim()) : '';
}

function attr(item: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const match = new RegExp(`<torznab:attr\\b(?=[^>]*\\bname=["']${escaped}["'])(?=[^>]*\\bvalue=["']([^"']*)["'])[^>]*\\/?\\s*>`, 'i').exec(item);
  return match ? decodeXml(match[1]) : null;
}

export interface MusicTorrentCandidate {
  hash: string; magnet: string; name: string; seeders: number | null; leechers: number | null; size: number | null; source: string; downloadToken?: string;
}

const torrentDownloads = new Map<string, { url: string; name: string; expiresAt: number }>();

export async function getMusicTorrentDownload(token: string): Promise<{ data: Buffer; name: string } | null> {
  const entry = torrentDownloads.get(token);
  torrentDownloads.delete(token);
  if (!entry || entry.expiresAt < Date.now()) return null;
  const apiUrl = prowlarrSearchUrl();
  const apiKey = process.env.TORZNAB_API_KEY?.trim();
  if (!apiUrl || !apiKey) return null;
  let target: URL;
  try { target = new URL(entry.url, apiUrl); } catch { return null; }
  if (target.origin !== apiUrl.origin || !['http:', 'https:'].includes(target.protocol)) return null;
  const response = await fetch(target, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/x-bittorrent, application/octet-stream' },
    signal: AbortSignal.timeout(30_000), redirect: 'manual'
  });
  if (!response.ok || Number(response.headers.get('content-length')) > 20_000_000) return null;
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > 20_000_000 || !torrentInfoHash(data)) return null;
  const name = entry.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 150) || 'torrent';
  return { data, name: name.endsWith('.torrent') ? name : `${name}.torrent` };
}

function magnetHash(value: string): string {
  return (/xt=urn:btih:([a-f0-9]{40})/i.exec(value)?.[1] || '').toLowerCase();
}

function encodeQueryValue(value: string): string {
  let wellFormed = '';
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        wellFormed += value[index] + value[index + 1];
        index++;
      } else wellFormed += '\ufffd';
    } else if (code >= 0xdc00 && code <= 0xdfff) wellFormed += '\ufffd';
    else wellFormed += value[index];
  }
  return encodeURIComponent(wellFormed);
}

function torrentInfoHash(data: Buffer): string | null {
  function readStringEnd(offset: number): { end: number; value: string } | null {
    let colon = offset;
    while (colon < data.length && data[colon] !== 0x3a) colon++;
    if (colon === offset || colon >= data.length) return null;
    const lengthText = data.toString('ascii', offset, colon);
    if (!/^\d+$/.test(lengthText)) return null;
    const start = colon + 1;
    const end = start + Number(lengthText);
    if (!Number.isSafeInteger(end) || end > data.length) return null;
    return { end, value: data.toString('utf8', start, end) };
  }

  function skipValue(offset: number, depth = 0): number | null {
    if (depth > 100 || offset >= data.length) return null;
    const marker = data[offset];
    if (marker === 0x69) {
      const end = data.indexOf(0x65, offset + 1);
      return end < 0 ? null : end + 1;
    }
    if (marker === 0x6c || marker === 0x64) {
      const dictionary = marker === 0x64;
      let cursor = offset + 1;
      while (cursor < data.length && data[cursor] !== 0x65) {
        if (dictionary) {
          const key = readStringEnd(cursor);
          if (!key) return null;
          cursor = key.end;
        }
        const end = skipValue(cursor, depth + 1);
        if (end === null) return null;
        cursor = end;
      }
      return cursor < data.length ? cursor + 1 : null;
    }
    if (marker >= 0x30 && marker <= 0x39) return readStringEnd(offset)?.end ?? null;
    return null;
  }

  if (data[0] !== 0x64) return null;
  let cursor = 1;
  while (cursor < data.length && data[cursor] !== 0x65) {
    const key = readStringEnd(cursor);
    if (!key) return null;
    const valueStart = key.end;
    const valueEnd = skipValue(valueStart);
    if (valueEnd === null) return null;
    if (key.value === 'info') return createHash('sha1').update(data.subarray(valueStart, valueEnd)).digest('hex');
    cursor = valueEnd;
  }
  return null;
}

async function readTorrentDownload(downloadUrl: string, apiUrl: URL, apiKey: string): Promise<string | null> {
  let target: URL;
  try { target = new URL(downloadUrl, apiUrl); } catch { return null; }
  if (target.origin !== apiUrl.origin || !['http:', 'https:'].includes(target.protocol)) return null;
  try {
    const response = await fetch(target, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/x-bittorrent, application/octet-stream' },
      signal: AbortSignal.timeout(12_000),
      redirect: 'manual'
    });
    if (!response.ok || (Number(response.headers.get('content-length')) > 5_000_000)) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 5_000_000) { await reader.cancel(); return null; }
      chunks.push(Buffer.from(chunk.value));
    }
    const data = Buffer.concat(chunks);
    const magnetHash = /xt=urn:btih:([a-f0-9]{40})/i.exec(data.toString('utf8'))?.[1];
    return (magnetHash || torrentInfoHash(data))?.toLowerCase() || null;
  } catch { return null; }
}

async function jsonCandidates(body: unknown, apiUrl: URL, apiKey: string): Promise<MusicTorrentCandidate[]> {
  if (!Array.isArray(body)) return [];
  const results = new Map<string, MusicTorrentCandidate>();
  const parsed = await Promise.all(body.map(async (raw): Promise<MusicTorrentCandidate | null> => {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const name = text(item.title);
    const downloadUrl = text(item.downloadUrl);
    const magnetUrl = text(item.magnetUrl) || text(item.magnet) || (/^magnet:/i.test(downloadUrl) ? downloadUrl : '');
    const hash = magnetHash(magnetUrl) || text(item.infoHash || item.infohash || item.hash).toLowerCase()
      || (downloadUrl ? await readTorrentDownload(downloadUrl, apiUrl, apiKey) || '' : '');
    if (!name || !/^[a-f0-9]{40}$/.test(hash)) return null;
    const magnet = magnetUrl.startsWith('magnet:') ? magnetUrl : `magnet:?xt=urn:btih:${hash}&dn=${encodeQueryValue(name.slice(0, 180))}`;
    const indexer = text(item.indexer) || 'Prowlarr';
    const number = (value: unknown): number | null => {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const downloadToken = downloadUrl && !/^magnet:/i.test(downloadUrl) ? randomUUID() : undefined;
    if (downloadToken) {
      const now = Date.now();
      for (const [token, entry] of torrentDownloads) if (entry.expiresAt < now) torrentDownloads.delete(token);
      torrentDownloads.set(downloadToken, { url: downloadUrl, name, expiresAt: now + 10 * 60_000 });
    }
    return {
      hash, magnet, name,
      seeders: number(item.seeders),
      leechers: number(item.leechers ?? item.peers),
      size: number(item.size),
      source: indexer,
      ...(downloadToken ? { downloadToken } : {})
    };
  }));
  for (const candidate of parsed) if (candidate) results.set(candidate.hash, candidate);
  return [...results.values()];
}

function prowlarrSearchUrl(): URL | null {
  const base = process.env.TORZNAB_URL?.trim();
  if (!base) return null;
  const url = new URL(base);
  if (/\/api\/v1\/search\/?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/$/, '');
    return url;
  }
  const indexerFeed = /^(.*)\/\d+\/api\/?$/.exec(url.pathname);
  if (!indexerFeed) return null;
  url.pathname = `${indexerFeed[1]}/api/v1/search`.replace(/^\/api/, '/api');
  url.search = '';
  return url;
}

async function searchProwlarr(query: string, type: 'search' | 'tvsearch' | 'movie' | 'music', categories: string[], limit = 50, offset = 0): Promise<MusicTorrentCandidate[] | null> {
  const url = prowlarrSearchUrl();
  if (!url) return null;
  url.searchParams.set('query', query);
  url.searchParams.set('type', type);
  url.searchParams.set('limit', String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set('offset', String(Math.max(0, offset)));
  for (const category of categories) url.searchParams.append('categories', category);
  const key = process.env.TORZNAB_API_KEY?.trim();
  if (!key) throw new Error('TORZNAB_API_KEY is required for Prowlarr search.');
  let response: Response;
  try { response = await fetch(url, { headers: { Accept: 'application/json', 'X-Api-Key': key }, signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error('Prowlarr search service is unavailable. Check that Prowlarr is running and reachable from the app.'); }
  if (!response.ok) throw new Error(`Prowlarr search returned HTTP ${response.status}.`);
  return jsonCandidates(await response.json(), url, key);
}

async function searchTorznabFeed(query: string, category: string, limit = 50, offset = 0): Promise<MusicTorrentCandidate[]> {
  const base = process.env.TORZNAB_URL?.trim();
  if (!base) throw new Error('Torrent search is not configured. Set TORZNAB_URL to a Torznab feed URL.');
  const url = new URL(base);
  url.searchParams.set('t', 'search');
  url.searchParams.set('cat', category);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set('offset', String(Math.max(0, offset)));
  const key = process.env.TORZNAB_API_KEY?.trim();
  if (key) url.searchParams.set('apikey', key);
  let response: Response;
  try { response = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml' }, signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error('Torznab search service is unavailable. Check your configured endpoint.'); }
  if (!response.ok) throw new Error(`Torznab returned HTTP ${response.status}.`);
  const xml = await response.text();
  const candidates = new Map<string, MusicTorrentCandidate>();
  for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) || []) {
    const name = tag(item, 'title');
    const link = tag(item, 'link').replace(/&amp;/g, '&');
    const magnet = (/magnet:\?[^\s<]+/i.exec(link)?.[0] || '').replace(/&amp;/g, '&');
    const hash = (attr(item, 'infohash') || magnetHash(magnet)).toLowerCase();
    if (!name || !magnet || !/^[a-f0-9]{40}$/.test(hash)) continue;
    const indexer = tag(item, 'jackettindexer') || tag(item, 'prowlarrindexer') || 'Torznab';
    const number = (value: string | null): number | null => {
      if (value === null) return null;
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    candidates.set(hash, {
      hash, magnet, name,
      seeders: number(attr(item, 'seeders')),
      leechers: number(attr(item, 'peers') ?? attr(item, 'leechers')),
      size: number(attr(item, 'size')),
      source: indexer
    });
  }
  return [...candidates.values()];
}

export async function searchIndexerTorrents(
  query: string,
  type: 'search' | 'tvsearch' | 'movie' | 'music',
  categories: string[],
  limit = 50,
  offset = 0
): Promise<MusicTorrentCandidate[]> {
  try {
    const prowlarr = await searchProwlarr(query, type, categories, limit, offset);
    if (prowlarr !== null) {
      if (prowlarr.length || type !== 'music') return prowlarr;
      const unrestrictedMusic = await searchProwlarr(query, 'music', [], limit, offset);
      if (unrestrictedMusic?.length) return unrestrictedMusic;
      const broadSearch = await searchProwlarr(query, 'search', [], limit, offset);
      return broadSearch || [];
    }
    return await searchTorznabFeed(query, categories.join(','), limit, offset);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Indexer search failed.';
    // If Prowlarr is not configured (missing API key or URL), fall back to Torznab feed
    if (message.includes('TORZNAB_API_KEY is required') || message.includes('Torrent search is not configured')) {
      return await searchTorznabFeed(query, categories.join(','), limit, offset);
    }
    throw new Error(message);
  }
}

export async function searchMusicTorrents(query: string, indexers: string[] = ['prowlarr', 'torrentio'], limit = 50, offset = 0): Promise<MusicTorrentCandidate[]> {
  const results: MusicTorrentCandidate[] = [];
  const categories = [process.env.TORZNAB_MUSIC_CATEGORY?.trim() || '3000'];
  
  // Search Prowlarr if requested
  if (indexers.includes('prowlarr')) {
    try {
      const prowlarrResults = await searchProwlarr(query, 'music', categories, limit, offset);
      if (prowlarrResults) {
        results.push(...prowlarrResults);
      }
    } catch (error) {
      console.warn('Prowlarr music search failed:', error instanceof Error ? error.message : 'unknown error');
    }
  }
  
  // Search Torrentio via Torznab feed if requested
  if (indexers.includes('torrentio')) {
    try {
      const torznabResults = await searchTorznabFeed(query, categories.join(','), limit, offset);
      results.push(...torznabResults);
    } catch (error) {
      console.warn('Torznab music search failed:', error instanceof Error ? error.message : 'unknown error');
    }
  }
  
  // Deduplicate by hash
  const unique = new Map<string, MusicTorrentCandidate>();
  for (const candidate of results) {
    const existing = unique.get(candidate.hash);
    unique.set(candidate.hash, existing ? {
      ...existing,
      seeders: existing.seeders ?? candidate.seeders,
      leechers: existing.leechers ?? candidate.leechers,
      size: existing.size ?? candidate.size,
      downloadToken: existing.downloadToken ?? candidate.downloadToken
    } : candidate);
  }
  
  return [...unique.values()].slice(offset, offset + limit);
}
