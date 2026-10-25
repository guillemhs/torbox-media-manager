import { getCachedSchedule, saveCachedSchedule } from '../../db/database';

export interface ScheduleOptions {
  date: string;
  country?: string;
  web?: boolean;
}

let requestQueue = Promise.resolve();
let lastRequestAt = 0;
const showCache = new Map<number, { expiresAt: number; show: unknown }>();

function cacheTtlMs(): number {
  const configured = process.env.TVMAZE_SYNC_INTERVAL || '24h';
  const match = /^(\d+)(s|m|h|d)$/.exec(configured.trim());
  if (!match) return 24 * 60 * 60 * 1000;
  const units: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Math.max(60_000, Number(match[1]) * units[match[2]]);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

async function throttleTvmaze(): Promise<void> {
  const waitForTurn = requestQueue.then(async () => {
    const remaining = 1_000 - (Date.now() - lastRequestAt);
    if (lastRequestAt && remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    lastRequestAt = Date.now();
  });
  requestQueue = waitForTurn.catch(() => undefined);
  await waitForTurn;
}

export async function getTvmazeSchedule(options: ScheduleOptions) {
  if (!validDate(options.date)) throw new Error('date must be a valid YYYY-MM-DD date');
  const country = options.country?.trim().toUpperCase() || 'US';
  if (!/^[A-Z]{2}$/.test(country)) throw new Error('country must be a two-letter ISO country code');

  const kind = options.web ? 'web' : 'broadcast';
  const cacheKey = `${kind}:${country}:${options.date}`;
  const cached = await getCachedSchedule(cacheKey);
  const stale = cached?.payload;
  const ttl = cacheTtlMs();
  if (cached && Date.now() - new Date(cached.fetchedAt).valueOf() < ttl) {
    return { episodes: cached.payload, cached: true, stale: false, fetchedAt: cached.fetchedAt };
  }

  await throttleTvmaze();
  const endpoint = options.web ? '/schedule/web' : '/schedule';
  const url = new URL(endpoint, 'https://api.tvmaze.com');
  url.searchParams.set('date', options.date);
  url.searchParams.set('country', country);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TorboxMediaManager/1.0 (self-hosted TV schedule)' },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error(`TVMaze returned HTTP ${response.status}`);
    const episodes = await response.json();
    if (!Array.isArray(episodes)) throw new Error('TVMaze returned an unexpected schedule format');
    await saveCachedSchedule(cacheKey, episodes);
    return { episodes, cached: false, stale: false, fetchedAt: new Date().toISOString() };
  } catch (error) {
    if (stale) {
      return { episodes: stale, cached: true, stale: true, fetchedAt: cached!.fetchedAt };
    }
    throw error;
  }
}

export async function getTvmazeShow(id: number): Promise<unknown> {
  const cached = showCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.show;
  await throttleTvmaze();
  const url = new URL(`/shows/${id}`, 'https://api.tvmaze.com');
  url.searchParams.set('embed', 'seasons');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TorboxMediaManager/1.0 (self-hosted TV details)' },
    signal: AbortSignal.timeout(12_000)
  });
  if (response.status === 404) throw new Error('TVMaze show was not found.');
  if (!response.ok) throw new Error(`TVMaze returned HTTP ${response.status}`);
  const show: unknown = await response.json();
  if (!show || typeof show !== 'object' || !('id' in show) || show.id !== id) {
    throw new Error('TVMaze returned an unexpected show record.');
  }
  if (showCache.size >= 500) showCache.delete(showCache.keys().next().value as number);
  showCache.set(id, { show, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return show;
}

export async function getTvmazeShowByImdb(imdbId: string): Promise<unknown> {
  if (!/^tt\d+$/.test(imdbId)) throw new Error('IMDb ID is invalid.');
  await throttleTvmaze();
  const url = new URL('/lookup/shows', 'https://api.tvmaze.com');
  url.searchParams.set('imdb', imdbId);
  url.searchParams.set('embed', 'seasons');
  const response = await fetch(url, { headers: { 'User-Agent': 'TorboxMediaManager/1.0 (self-hosted title details)' }, signal: AbortSignal.timeout(12_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`TVMaze returned HTTP ${response.status}`);
  return response.json();
}
