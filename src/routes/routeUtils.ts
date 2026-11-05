import type { RequestHandler } from 'express';
import { TorboxApiError } from '../services/torbox/client';

/** Send a JSON error response, mapping TorboxApiError to its HTTP status. */
export function sendError(res: Parameters<RequestHandler>[1], error: unknown) {
  const status = error instanceof TorboxApiError ? error.status : 502;
  return res.status(status).json({ error: error instanceof Error ? error.message : 'Request failed' });
}

/** Coerce an unknown value to a string, or undefined. */
export function scalar(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parse and validate limit/offset query params. */
export interface Pagination {
  limit: number;
  offset: number;
}

export function pagination(query: Record<string, unknown>, maxLimit = 200): Pagination {
  const number = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('limit and offset must be non-negative integers');
    return Number(value);
  };
  return { limit: Math.min(maxLimit, Math.max(1, number(query.limit, 50))), offset: number(query.offset, 0) };
}

/** Tag downloaded items with a media type, accepting arrays or single objects. */
export function taggedDownloads(data: unknown, mediaType: 'torrent' | 'usenet'): Array<Record<string, unknown>> {
  const values = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
  return values.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object').map(item => ({ ...item, _media_type: mediaType }));
}

/** Extract a category label from an IMDb title (mostly unused; titles rarely contain genre keywords). */
export function extractCategoryFromTitle(title: string, titleType: string): string {
  if (!title) return '';
  const lowerTitle = title.toLowerCase();
  if (titleType === 'movie') {
    if (/\b(?:action|adventure|comedy|drama|horror|thriller|sci-fi|fantasy|animation)\b/.test(lowerTitle)) {
      return 'Movie';
    }
  }
  if (titleType === 'tvSeries' || titleType === 'tvMiniSeries') {
    if (/\b(?:drama|comedy|action|sci-fi|fantasy|horror|mystery|crime)\b/.test(lowerTitle)) {
      return 'Series';
    }
  }
  return '';
}

/** Extract a category label from a torrent/usenet release name. */
export function extractCategoryFromName(name: string): string {
  if (!name) return '';
  const lowerName = name.toLowerCase();
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

/** Format torrent/usenet metadata into a display string. `source` labels the provider (e.g. Torrentio, Prowlarr). */
export function formatTorrentMetadata(seeders: number | null, leechers: number | null, size: number | null, source = 'Torrentio'): string {
  const seedersStr = seeders !== null ? String(seeders) : '0';
  const leechersStr = leechers !== null ? String(leechers) : '0';
  const sizeStr = size !== null ? `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB` : 'Unknown size';
  return `${seedersStr} seeders · ${leechersStr} leechers · ${sizeStr} · ${source}`;
}

/** Format usenet metadata into a display string. */
export function formatUsenetMetadata(candidate: { posted?: number; complete?: boolean }): string {
  const postedStr = candidate.posted ? new Date(candidate.posted * 1000).toLocaleDateString() : 'Unknown';
  const completeStr = candidate.complete ? 'Complete' : 'Partial';
  return `0 seeders · 0 leechers · ${postedStr} · ${completeStr}`;
}
