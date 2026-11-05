import { describe, it, expect, vi } from 'vitest';
import {
  scalar,
  pagination,
  sendError,
  taggedDownloads,
  extractCategoryFromTitle,
  extractCategoryFromName,
  formatTorrentMetadata,
  formatUsenetMetadata,
} from './routeUtils';

describe('scalar', () => {
  it('returns the string value', () => {
    expect(scalar('hello')).toBe('hello');
  });
  it('returns undefined for non-strings', () => {
    expect(scalar(123)).toBeUndefined();
    expect(scalar(null)).toBeUndefined();
    expect(scalar(undefined)).toBeUndefined();
    expect(scalar({})).toBeUndefined();
  });
});

describe('pagination', () => {
  it('returns defaults', () => {
    expect(pagination({})).toEqual({ limit: 50, offset: 0 });
  });
  it('parses limit and offset', () => {
    expect(pagination({ limit: '100', offset: '20' })).toEqual({ limit: 100, offset: 20 });
  });
  it('clamps limit to maxLimit', () => {
    expect(pagination({ limit: '9999' }, 200)).toEqual({ limit: 200, offset: 0 });
  });
  it('clamps limit to minimum 1', () => {
    expect(pagination({ limit: '0' })).toEqual({ limit: 1, offset: 0 });
  });
  it('throws on non-numeric limit', () => {
    expect(() => pagination({ limit: 'abc' })).toThrow();
  });
});

describe('taggedDownloads', () => {
  it('tags array items', () => {
    const data = [{ name: 'a' }, { name: 'b' }];
    const result = taggedDownloads(data, 'torrent');
    expect(result).toHaveLength(2);
    expect(result[0]._media_type).toBe('torrent');
    expect(result[0].name).toBe('a');
  });
  it('wraps single object', () => {
    const result = taggedDownloads({ name: 'a' }, 'usenet');
    expect(result).toHaveLength(1);
    expect(result[0]._media_type).toBe('usenet');
  });
  it('returns empty for invalid input', () => {
    expect(taggedDownloads(null, 'torrent')).toEqual([]);
    expect(taggedDownloads('string', 'torrent')).toEqual([]);
  });
});

describe('extractCategoryFromTitle', () => {
  it('returns empty for unknown title', () => {
    expect(extractCategoryFromTitle('The Matrix', 'movie')).toBe('');
  });
  it('returns empty for unknown type', () => {
    expect(extractCategoryFromTitle('Action Movie', 'documentary')).toBe('');
  });
});

describe('extractCategoryFromName', () => {
  it('detects movies', () => {
    expect(extractCategoryFromName('Movie.2024.BluRay')).toBe('Movies');
  });
  it('detects series', () => {
    expect(extractCategoryFromName('Show.Season 1 Episode 2')).toBe('Series');
  });
  it('detects music', () => {
    expect(extractCategoryFromName('Artist - Album')).toBe('Music');
  });
  it('returns empty for unknown', () => {
    expect(extractCategoryFromName('Random file')).toBe('');
  });
});

describe('formatTorrentMetadata', () => {
  it('formats with all values', () => {
    const result = formatTorrentMetadata(100, 50, 1073741824, 'Torrentio');
    expect(result).toContain('100 seeders');
    expect(result).toContain('50 leechers');
    expect(result).toContain('1.0 GB');
    expect(result).toContain('Torrentio');
  });
  it('handles null values', () => {
    const result = formatTorrentMetadata(null, null, null, 'Prowlarr');
    expect(result).toContain('0 seeders');
    expect(result).toContain('0 leechers');
    expect(result).toContain('Unknown size');
    expect(result).toContain('Prowlarr');
  });
});

describe('formatUsenetMetadata', () => {
  it('formats complete usenet item', () => {
    const result = formatUsenetMetadata({ posted: 1700000000, complete: true });
    expect(result).toContain('Complete');
  });
  it('formats incomplete usenet item', () => {
    const result = formatUsenetMetadata({ posted: 1700000000, complete: false });
    expect(result).toContain('Partial');
  });
});

describe('sendError', () => {
  it('returns 502 for generic errors', () => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    sendError(res, new Error('fail'));
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'fail' });
  });
});
