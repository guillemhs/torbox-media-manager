type Artwork = { url: string; source: 'TMDB' | 'TVMaze' | 'Cover Art Archive' };

const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1_000;
const cache = new Map<string, { expiresAt: number; artwork: Artwork | null }>();
let musicBrainzQueue = Promise.resolve();
let lastMusicBrainzRequest = 0;

function cached(key: string): Artwork | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.artwork;
}

function remember(key: string, artwork: Artwork | null): void {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { artwork, expiresAt: Date.now() + CACHE_TTL });
}

async function requestJson(url: URL, headers?: HeadersInit): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Artwork provider returned HTTP ${response.status}`);
  return response.json();
}

async function tmdbPoster(imdbId: string): Promise<Artwork | null> {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const url = new URL(`https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}`);
  url.searchParams.set('external_source', 'imdb_id');
  const data = await requestJson(url, { Authorization: `Bearer ${token}`, accept: 'application/json' }) as Record<string, unknown>;
  for (const key of ['movie_results', 'tv_results']) {
    const results = data[key];
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      const path = (result as Record<string, unknown>).poster_path;
      if (typeof path === 'string' && /^\/[a-zA-Z0-9._-]+$/.test(path)) {
        return { url: `https://image.tmdb.org/t/p/w500${path}`, source: 'TMDB' };
      }
    }
  }
  return null;
}

async function tvmazePoster(imdbId: string): Promise<Artwork | null> {
  const url = new URL('https://api.tvmaze.com/lookup/shows');
  url.searchParams.set('imdb', imdbId);
  const data = await requestJson(url) as Record<string, unknown>;
  const image = data.image;
  if (!image || typeof image !== 'object') return null;
  const paths = image as Record<string, unknown>;
  const candidate = paths.medium ?? paths.original;
  if (typeof candidate !== 'string') return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'static.tvmaze.com') return null;
    return { url: parsed.toString(), source: 'TVMaze' };
  } catch {
    return null;
  }
}

export async function getTitleArtwork(imdbId: string, kind: 'movie' | 'series'): Promise<Artwork | null> {
  const key = `title:${imdbId}`;
  const hit = cached(key);
  if (hit !== undefined) return hit;

  let artwork: Artwork | null = null;
  try { artwork = await tmdbPoster(imdbId); } catch { /* optional provider; try TVMaze for series below */ }
  if (!artwork && kind === 'series') {
    try { artwork = await tvmazePoster(imdbId); } catch { /* image is optional */ }
  }
  remember(key, artwork);
  return artwork;
}

async function throttleMusicBrainz(): Promise<void> {
  const turn = musicBrainzQueue.then(async () => {
    const wait = 1_000 - (Date.now() - lastMusicBrainzRequest);
    if (lastMusicBrainzRequest && wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastMusicBrainzRequest = Date.now();
  });
  musicBrainzQueue = turn.catch(() => undefined);
  await turn;
}

function musicQuery(name: string): string {
  const parts = name.split(/\s+-\s+/, 2).map((part) => part.trim()).filter(Boolean);
  const quote = (value: string) => `"${value.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()}"`;
  if (parts.length === 2) return `artist:${quote(parts[0])} AND release:${quote(parts[1])}`;
  return `releasegroup:${quote(name)}`;
}

async function coverArt(name: string): Promise<Artwork | null> {
  await throttleMusicBrainz();
  const search = new URL('https://musicbrainz.org/ws/2/release-group');
  search.searchParams.set('query', musicQuery(name));
  search.searchParams.set('fmt', 'json');
  search.searchParams.set('limit', '5');
  const result = await requestJson(search, { 'User-Agent': 'TorBoxMediaManager/1.0 (self-hosted media browser)' }) as Record<string, unknown>;
  const groups = result['release-groups'];
  if (!Array.isArray(groups)) return null;

  for (const group of groups.slice(0, 3)) {
    if (!group || typeof group !== 'object') continue;
    const id = (group as Record<string, unknown>).id;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) continue;
    const front = await fetch(`https://coverartarchive.org/release-group/${id}/front-250`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000)
    });
    if (![301, 302, 303, 307, 308].includes(front.status)) continue;
    const location = front.headers.get('location');
    if (!location) continue;
    try {
      const image = new URL(location);
      if (image.protocol === 'https:' && ['archive.org', 'coverartarchive.org'].includes(image.hostname)) {
        return { url: image.toString(), source: 'Cover Art Archive' };
      }
    } catch { /* continue to the next candidate */ }
  }
  return null;
}

export async function getMusicArtwork(name: string): Promise<Artwork | null> {
  const key = `music:${name.toLocaleLowerCase()}`;
  const hit = cached(key);
  if (hit !== undefined) return hit;
  let artwork: Artwork | null = null;
  try { artwork = await coverArt(name); } catch { /* artwork should not break library browsing */ }
  remember(key, artwork);
  return artwork;
}
