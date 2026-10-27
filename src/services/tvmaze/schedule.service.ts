import { getCachedSchedule, saveCachedSchedule } from '../../db/database';

export interface ScheduleOptions {
  date: string;
  country?: string;
  web?: boolean;
}

export interface MonthlyCalendarOptions {
  year: number;
  month: number; // 1-12
  filter?: 'popular' | 'all';
  minRating?: number; // minimum show rating for popular filter
  limitPerDay?: number; // max episodes per day
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
  // Omitting country from the web schedule asks TVmaze for both global
  // services (Netflix, Apple TV+, Prime Video, etc.) and local web channels.
  const cacheKey = options.web ? `web:all:${options.date}` : `${kind}:${country}:${options.date}`;
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
  if (!options.web) url.searchParams.set('country', country);

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

/**
 * Fetch a monthly calendar by aggregating daily web schedules.
 * Uses TVMaze's /schedule/web endpoint for streaming services.
 * Supports popularity filtering based on show rating.
 */
export async function getTvmazeMonthlyCalendar(options: MonthlyCalendarOptions) {
  const { year, month, filter = 'popular', minRating = 7.0, limitPerDay = 50 } = options;
  
  // Validate month/year
  if (month < 1 || month > 12) throw new Error('month must be between 1 and 12');
  if (year < 2000 || year > 2100) throw new Error('year must be between 2000 and 2100');
  
  // Calculate days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  const cacheKey = `monthly:web:${year}-${String(month).padStart(2, '0')}`;
  
  // Check cache first
  const cached = await getCachedSchedule(cacheKey);
  const ttl = cacheTtlMs();
  if (cached && Date.now() - new Date(cached.fetchedAt).valueOf() < ttl) {
    let episodes = cached.payload as unknown[];
    // Apply filters to cached data
    episodes = applyFilters(episodes, filter, minRating, limitPerDay);
    return { episodes, cached: true, stale: false, fetchedAt: cached.fetchedAt, year, month, daysInMonth };
  }
  
  // Fetch all days in parallel (with throttling via the queue)
  const datePromises = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return getTvmazeSchedule({ date, web: true }).catch(err => {
      console.warn(`Failed to fetch schedule for ${date}:`, err instanceof Error ? err.message : err);
      return { episodes: [], cached: false, stale: false, fetchedAt: new Date().toISOString() };
    });
  });
  
  const results = await Promise.all(datePromises);
  
  // Combine all episodes
  let allEpisodes = results.flatMap(r => r.episodes);
  
  // Apply filters
  allEpisodes = applyFilters(allEpisodes, filter, minRating, limitPerDay);
  
  // Group by day for easier frontend consumption
  const episodesByDay: Record<string, unknown[]> = {};
  for (const ep of allEpisodes) {
    const epData = ep as Record<string, unknown>;
    const airdate = typeof epData.airdate === 'string' ? epData.airdate : 
                     typeof epData.airdate === 'object' && epData.airdate && 'date' in epData.airdate 
                       ? String((epData.airdate as Record<string, unknown>).date) 
                       : null;
    if (airdate) {
      if (!episodesByDay[airdate]) episodesByDay[airdate] = [];
      episodesByDay[airdate].push(ep);
    }
  }
  
  // Save to cache
  await saveCachedSchedule(cacheKey, allEpisodes);
  
  return { 
    episodes: allEpisodes, 
    episodesByDay, 
    cached: false, 
    stale: false, 
    fetchedAt: new Date().toISOString(),
    year,
    month,
    daysInMonth,
    totalEpisodes: allEpisodes.length
  };
}

function applyFilters(episodes: unknown[], filter: 'popular' | 'all', minRating: number, limitPerDay: number): unknown[] {
  if (filter === 'all') return episodes;
  
  // Group by day first, then filter each day
  const byDay = new Map<string, unknown[]>();
  for (const ep of episodes) {
    const epData = ep as Record<string, unknown>;
    const airdate = typeof epData.airdate === 'string' ? epData.airdate : 
                     typeof epData.airdate === 'object' && epData.airdate && 'date' in epData.airdate 
                       ? String((epData.airdate as Record<string, unknown>).date) 
                       : null;
    if (airdate) {
      if (!byDay.has(airdate)) byDay.set(airdate, []);
      byDay.get(airdate)!.push(ep);
    }
  }
  
  // For each day, sort by show rating (popular) and limit
  const filtered: unknown[] = [];
  for (const [day, dayEpisodes] of byDay) {
    let sorted = dayEpisodes;
    if (filter === 'popular') {
      sorted = dayEpisodes.sort((a, b) => {
        const ratingA = getShowRating(a);
        const ratingB = getShowRating(b);
        return ratingB - ratingA; // descending (highest rated first)
      }).filter(ep => getShowRating(ep) >= minRating);
    }
    filtered.push(...sorted.slice(0, limitPerDay));
  }
  
  return filtered;
}

function getShowRating(episode: unknown): number {
  const epData = episode as Record<string, unknown>;
  const show = epData.show as Record<string, unknown> | undefined;
  if (!show) return 0;
  const rating = show.rating as Record<string, unknown> | undefined;
  if (!rating) return 0;
  const average = rating.average;
  return typeof average === 'number' && Number.isFinite(average) ? average : 0;
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
