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

export async function searchMusicTorrents(query: string): Promise<MusicTorrentCandidate[]> {
  const base = process.env.TORZNAB_URL?.trim();
  if (!base) throw new Error('Music torrent search is not configured. Set TORZNAB_URL to your Prowlarr or Jackett Torznab endpoint.');
  const url = new URL(base);
  // Newznab/Torznab-compatible music category used by Prowlarr and Jackett.
  url.searchParams.set('t', 'search');
  url.searchParams.set('cat', process.env.TORZNAB_MUSIC_CATEGORY?.trim() || '3000');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '50');
  const key = process.env.TORZNAB_API_KEY?.trim();
  if (key) url.searchParams.set('apikey', key);
  let response: Response;
  try { response = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml' }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new Error('Music torrent search service is unavailable. Check your Torznab URL.'); }
  if (!response.ok) throw new Error(`Torznab returned HTTP ${response.status}.`);
  const xml = await response.text();
  const candidates = new Map<string, MusicTorrentCandidate>();
  for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) || []) {
    const name = tag(item, 'title');
    const link = tag(item, 'link');
    const magnet = /magnet:\?[^\s<]+/i.exec(`${link} ${item}`)?.[0];
    const hash = (attr(item, 'infohash') || /xt=urn:btih:([a-f0-9]{40})/i.exec(magnet || '')?.[1] || '').toLowerCase();
    if (!name || !magnet || !/^[a-f0-9]{40}$/.test(hash)) continue;
    const urlMatch = /<enclosure\b[^>]*\burl=["']([^"']+)["']/i.exec(item);
    const candidateMagnet = magnet.replace(/&amp;/g, '&');
    candidates.set(hash, {
      hash, magnet: candidateMagnet, name,
      seeders: attr(item, 'seeders') === null ? null : Number(attr(item, 'seeders')),
      leechers: attr(item, 'peers') === null && attr(item, 'leechers') === null ? null : Number(attr(item, 'peers') ?? attr(item, 'leechers')),
      size: Number(attr(item, 'size') || urlMatch?.[1]) || null,
      source: 'Torznab'
    });
  }
  return [...candidates.values()].slice(0, 50);
}
