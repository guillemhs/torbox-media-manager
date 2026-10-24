export interface MusicRelease {
  id: string;
  title: string;
  artist: string;
  date: string;
  type: string;
  cover: string;
}

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

export async function searchMusicMetadata(query: string): Promise<MusicRelease[]> {
  const url = new URL('https://musicbrainz.org/ws/2/release-group');
  url.searchParams.set('query', query);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', '25');
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
  hash: string; magnet: string; name: string; seeders: number | null; leechers: number | null; size: number | null; source: string;
}

function magnetHash(value: string): string {
  return (/xt=urn:btih:([a-f0-9]{40})/i.exec(value)?.[1] || '').toLowerCase();
}

function jsonCandidates(body: unknown): MusicTorrentCandidate[] {
  if (!Array.isArray(body)) return [];
  const results = new Map<string, MusicTorrentCandidate>();
  for (const raw of body) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const name = text(item.title);
    const magnetUrl = text(item.magnetUrl) || text(item.magnet);
    const hash = magnetHash(magnetUrl) || text(item.infoHash || item.infohash || item.hash).toLowerCase();
    if (!name || !/^[a-f0-9]{40}$/.test(hash)) continue;
    const magnet = magnetUrl.startsWith('magnet:') ? magnetUrl : `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name.slice(0, 180))}`;
    const indexer = text(item.indexer) || 'Prowlarr';
    const number = (value: unknown): number | null => {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    results.set(hash, {
      hash, magnet, name,
      seeders: number(item.seeders),
      leechers: number(item.leechers ?? item.peers),
      size: number(item.size),
      source: indexer
    });
  }
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

async function searchProwlarr(query: string, type: 'search' | 'tvsearch' | 'movie' | 'music', categories: string[]): Promise<MusicTorrentCandidate[] | null> {
  const url = prowlarrSearchUrl();
  if (!url) return null;
  url.searchParams.set('query', query);
  url.searchParams.set('type', type);
  url.searchParams.set('limit', '50');
  for (const category of categories) url.searchParams.append('categories', category);
  const key = process.env.TORZNAB_API_KEY?.trim();
  if (!key) throw new Error('TORZNAB_API_KEY is required for Prowlarr search.');
  let response: Response;
  try { response = await fetch(url, { headers: { Accept: 'application/json', 'X-Api-Key': key }, signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error('Prowlarr search service is unavailable. Check that Prowlarr is running and reachable from the app.'); }
  if (!response.ok) throw new Error(`Prowlarr search returned HTTP ${response.status}.`);
  return jsonCandidates(await response.json());
}

async function searchTorznabFeed(query: string, category: string): Promise<MusicTorrentCandidate[]> {
  const base = process.env.TORZNAB_URL?.trim();
  if (!base) throw new Error('Torrent search is not configured. Set TORZNAB_URL to a Torznab feed URL.');
  const url = new URL(base);
  url.searchParams.set('t', 'search');
  url.searchParams.set('cat', category);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '50');
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
    candidates.set(hash, {
      hash, magnet, name,
      seeders: attr(item, 'seeders') === null ? null : Number(attr(item, 'seeders')),
      leechers: attr(item, 'peers') === null && attr(item, 'leechers') === null ? null : Number(attr(item, 'peers') ?? attr(item, 'leechers')),
      size: attr(item, 'size') === null ? null : Number(attr(item, 'size')),
      source: indexer
    });
  }
  return [...candidates.values()];
}

export async function searchIndexerTorrents(
  query: string,
  type: 'search' | 'tvsearch' | 'movie' | 'music',
  categories: string[]
): Promise<MusicTorrentCandidate[]> {
  try {
    const prowlarr = await searchProwlarr(query, type, categories);
    if (prowlarr !== null) return prowlarr.slice(0, 50);
    return await searchTorznabFeed(query, categories.join(','));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Indexer search failed.');
  }
}

export async function searchMusicTorrents(query: string): Promise<MusicTorrentCandidate[]> {
  return searchIndexerTorrents(query, 'music', [process.env.TORZNAB_MUSIC_CATEGORY?.trim() || '3000']);
}
