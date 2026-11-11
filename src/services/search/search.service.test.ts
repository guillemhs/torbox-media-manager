import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchMedia, clearProviderCache } from './search.service';

// Mock dependencies
vi.mock('../../db/database', () => ({
  searchTitles: vi.fn(),
}));
vi.mock('../musicSearch', () => ({
  searchMusicMetadata: vi.fn(),
}));
vi.mock('../torbox/torrentSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../torbox/torrentSearch')>();
  return { ...actual, searchTorrentsViaProwlarr: vi.fn(), searchTorrentCandidates: vi.fn() };
});
vi.mock('../usenetSearch', () => ({
  searchUsenet: vi.fn(),
}));

import { searchTitles } from '../../db/database';
import { searchMusicMetadata } from '../musicSearch';
import { searchTorrentsViaProwlarr, searchTorrentCandidates, parseSeasonEpisode } from '../torbox/torrentSearch';
import { searchUsenet } from '../usenetSearch';

beforeEach(() => {
  vi.resetAllMocks();
  clearProviderCache();
  process.env.TORZNAB_URL = 'http://prowlarr:9696/api'
  process.env.TORZNAB_API_KEY = 'test-key';
  process.env.TORBOX_API_KEY = 'test-key';
  (searchTorrentCandidates as any).mockResolvedValue([]);
});

describe('searchMedia', () => {
  it('returns local IMDb results for movies', async () => {
    (searchTitles as any).mockResolvedValue({
      items: [{ imdbId: 'tt123', primaryTitle: 'Test Movie', titleType: 'movie', startYear: 2024 }],
      total: 1,
    });
    (searchTorrentsViaProwlarr as any).mockResolvedValue([]);
    (searchUsenet as any).mockResolvedValue({ candidates: [], warnings: [] });

    const result = await searchMedia({
      query: 'test',
      kind: 'movie',
      page: { limit: 50, offset: 0 },
      localKind: 'movie',
      localSourceLabel: 'local-movies',
      indexerCategories: ['2000'],
      indexerType: 'movie',
      categoryMode: 'title',
      browseLink: '/browse?q=test&kind=movie',
    });

    expect(result.kind).toBe('movie');
    expect(result.results.local.total).toBe(1);
    expect(result.results.local.items[0]._type).toBe('local');
    expect(result.results.local.items[0]._source).toBe('local-movies');
    expect(searchTitles).toHaveBeenCalledWith({
      limit: 50, offset: 0, q: 'test', kind: 'movie',
    });
  });

  it('returns local MusicBrainz results for music', async () => {
    (searchMusicMetadata as any).mockResolvedValue([
      { id: 'abc', title: 'Album', artist: 'Artist', date: '2024', type: 'Album', cover: '' },
    ]);
    (searchTorrentsViaProwlarr as any).mockResolvedValue([]);
    (searchUsenet as any).mockResolvedValue({ candidates: [], warnings: [] });

    const result = await searchMedia({
      query: 'album',
      kind: 'music',
      page: { limit: 50, offset: 0 },
      useMusicBrainz: true,
      localSourceLabel: 'local-music',
      indexerCategories: ['3000'],
      categoryMode: 'fixed',
      fixedCategory: 'Music',
      browseLink: '/browse?q=album&kind=music',
    });

    expect(result.results.local.total).toBe(1);
    expect(result.results.local.items[0]._type).toBe('local');
    expect(result.results.local.items[0]._category).toBe('Music');
  });

  it('handles missing indexer config gracefully', async () => {
    delete process.env.TORZNAB_URL;
    (searchTitles as any).mockResolvedValue({ items: [], total: 0 });
    (searchTorrentsViaProwlarr as any).mockResolvedValue([]);
    (searchUsenet as any).mockResolvedValue({ candidates: [], warnings: [] });

    const result = await searchMedia({
      query: 'test',
      kind: 'movie',
      page: { limit: 50, offset: 0 },
      localKind: 'movie',
      indexerCategories: ['2000'],
      categoryMode: 'title',
    });

    expect(result.results.torrents.total).toBe(0);
    expect(result.results.usenet.total).toBe(0);
  });

  it('paginates results', async () => {
    (searchTitles as any).mockResolvedValue({
      items: [{ imdbId: 'tt1', primaryTitle: 'A', titleType: 'movie' }],
      total: 1,
    });
    (searchTorrentsViaProwlarr as any).mockResolvedValue([]);
    (searchUsenet as any).mockResolvedValue({ candidates: [], warnings: [] });

    const result = await searchMedia({
      query: 'test',
      kind: 'movie',
      page: { limit: 10, offset: 5 },
      localKind: 'movie',
      indexerCategories: ['2000'],
      categoryMode: 'title',
    });

    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
    expect(searchTitles).toHaveBeenCalledWith({
      limit: 10, offset: 5, q: 'test', kind: 'movie',
    });
  });

  it('resolves IMDb IDs from local DB for Torrentio, one call per ID with its own kind', async () => {
    (searchTitles as any).mockResolvedValue({
      items: [
        { imdbId: 'tt1375666', primaryTitle: 'Inception', titleType: 'movie', startYear: 2010 },
        { imdbId: 'tt0944947', primaryTitle: 'Game of Thrones', titleType: 'tvSeries', startYear: 2011 },
      ],
      total: 2,
    });
    (searchTorrentCandidates as any).mockImplementation(async (id: string) => ([
      { hash: `hash-${id}`, magnet: `magnet:?xt=urn:btih:hash-${id}`, name: `Release ${id}`, seeders: 10, leechers: 2, size: 1000, source: 'Torrentio' },
    ]));

    const result = await searchMedia({
      query: 'inception',
      kind: 'all',
      page: { limit: 50, offset: 0 },
      includeLocal: false,
      includeUsenet: false,
      indexers: ['torrentio'],
      categoryMode: 'name',
    });

    expect(searchTorrentCandidates).toHaveBeenCalledWith('tt1375666', 'movie', 1, 100, 0, 1);
    expect(searchTorrentCandidates).toHaveBeenCalledWith('tt0944947', 'series', 1, 100, 0, 1);
    expect(result.results.torrents.total).toBe(2);
    expect(result.results.torrents.items[0].source).toBe('Torrentio');
  });

  it('dedupes Torrentio streams returned for multiple IMDb IDs', async () => {
    (searchTitles as any).mockResolvedValue({
      items: [
        { imdbId: 'tt1375666', primaryTitle: 'Inception', titleType: 'movie' },
        { imdbId: 'tt9999999', primaryTitle: 'Inception 4K', titleType: 'movie' },
      ],
      total: 2,
    });
    (searchTorrentCandidates as any).mockResolvedValue([
      { hash: 'samehash', magnet: 'magnet:?xt=urn:btih:samehash', name: 'Inception 1080p', seeders: 5, leechers: 1, size: 2000, source: 'Torrentio' },
    ]);

    const result = await searchMedia({
      query: 'inception',
      kind: 'movie',
      page: { limit: 50, offset: 0 },
      includeLocal: false,
      includeUsenet: false,
      indexers: ['torrentio'],
      categoryMode: 'name',
    });

    expect(searchTorrentCandidates).toHaveBeenCalledTimes(2);
    expect(result.results.torrents.total).toBe(1);
  });

  it('falls back to text query for Torrentio when no local IMDb match', async () => {
    (searchTitles as any).mockResolvedValue({ items: [], total: 0 });
    (searchTorrentCandidates as any).mockResolvedValue([
      { hash: 'abc123', magnet: 'magnet:?xt=urn:btih:abc123', name: 'Some Release', seeders: 1, leechers: 0, size: 500, source: 'Torrentio' },
    ]);

    const result = await searchMedia({
      query: 'space jam',
      kind: 'movie',
      page: { limit: 20, offset: 0 },
      includeLocal: false,
      includeUsenet: false,
      indexers: ['torrentio'],
      categoryMode: 'name',
    });

    expect(searchTorrentCandidates).toHaveBeenCalledWith('space jam', 'movie', 1, 100, 0, 1);
    expect(result.results.torrents.total).toBe(1);
  });

  it('runs Torrentio without Prowlarr/Torznab config', async () => {
    delete process.env.TORZNAB_URL;
    delete process.env.TORZNAB_API_KEY;
    (searchTitles as any).mockResolvedValue({
      items: [{ imdbId: 'tt0179947', primaryTitle: 'Space Jam', titleType: 'movie', startYear: 1996 }],
      total: 1,
    });
    (searchTorrentCandidates as any).mockResolvedValue([
      { hash: 'sjhash', magnet: 'magnet:?xt=urn:btih:sjhash', name: 'Space Jam 1996 1080p', seeders: 42, leechers: 3, size: 2_000_000_000, source: 'Torrentio' },
    ]);

    const result = await searchMedia({
      query: 'space jam',
      kind: 'movie',
      page: { limit: 20, offset: 0 },
      includeLocal: false,
      includeUsenet: false,
      indexers: ['torrentio'],
      categoryMode: 'name',
    });

    expect(searchTorrentsViaProwlarr).not.toHaveBeenCalled();
    expect(searchTorrentCandidates).toHaveBeenCalledWith('tt0179947', 'movie', 1, 100, 0, 1);
    expect(result.results.torrents.total).toBe(1);
  });

  it('strips season tokens: "silo s03" looks up "silo" and calls Torrentio with imdbId:season', async () => {
    (searchTitles as any).mockResolvedValue({
      items: [{ imdbId: 'tt14710174', primaryTitle: 'Silo', titleType: 'tvSeries', startYear: 2023 }],
      total: 1,
    });
    (searchTorrentCandidates as any).mockResolvedValue([
      { hash: 'silo3hash', magnet: 'magnet:?xt=urn:btih:silo3hash', name: 'Silo S03 1080p', seeders: 9, leechers: 1, size: 3000, source: 'Torrentio' },
    ]);

    const result = await searchMedia({
      query: 'silo s03',
      kind: 'series',
      page: { limit: 20, offset: 0 },
      localKind: 'series',
      includeUsenet: false,
      indexers: ['torrentio'],
      categoryMode: 'name',
    });

    expect(searchTitles).toHaveBeenCalledWith({ limit: 20, offset: 0, q: 'silo', kind: 'series' });
    expect(searchTorrentCandidates).toHaveBeenCalledWith('tt14710174', 'series', 3, 100, 0, 1);
    expect(result.results.torrents.total).toBe(1);
    expect(result.results.local.items[0].primaryTitle).toBe('Silo');
  });

  it('parses s03e05 into season 3 episode 5 for Torrentio series calls', async () => {
    (searchTitles as any).mockResolvedValue({
      items: [{ imdbId: 'tt0903747', primaryTitle: 'Breaking Bad', titleType: 'tvSeries' }],
      total: 1,
    });
    (searchTorrentCandidates as any).mockResolvedValue([]);

    await searchMedia({
      query: 'breaking bad s03e05',
      kind: 'series',
      page: { limit: 20, offset: 0 },
      includeLocal: false,
      includeUsenet: false,
      indexers: ['torrentio'],
      categoryMode: 'name',
    });

    expect(searchTorrentCandidates).toHaveBeenCalledWith('tt0903747', 'series', 3, 100, 0, 5);
  });

  it('ignores season tokens for movie Torrentio calls', async () => {
    (searchTitles as any).mockResolvedValue({
      items: [{ imdbId: 'tt1375666', primaryTitle: 'Inception', titleType: 'movie' }],
      total: 1,
    });
    (searchTorrentCandidates as any).mockResolvedValue([]);

    await searchMedia({
      query: 'inception',
      kind: 'movie',
      page: { limit: 20, offset: 0 },
      includeLocal: false,
      includeUsenet: false,
      indexers: ['torrentio'],
      categoryMode: 'name',
    });

    expect(searchTorrentCandidates).toHaveBeenCalledWith('tt1375666', 'movie', 1, 100, 0, 1);
  });
  it('serves page 2 from cache: Torrentio fetched once even when the live total would drift', async () => {
    (searchTitles as any).mockResolvedValue({
      items: [{ imdbId: 'tt11198330', primaryTitle: 'Nocturne', titleType: 'tvSeries', startYear: 2021 }],
      total: 1,
    });
    let call = 0;
    (searchTorrentCandidates as any).mockImplementation(async () => {
      call++;
      const n = call === 1 ? 103 : 102; // simulate live drift between calls
      return Array.from({ length: n }, (_, i) => ({
        hash: ('h' + String(i).padStart(3, '0') + 'b'.repeat(36)).slice(0, 40),
        magnet: `magnet:?xt=urn:btih:h${i}`,
        name: `Nocturne S01E02 r${i}`,
        seeders: 50 - i, leechers: i, size: 1000, source: 'Torrentio',
      }));
    });

    const base = {
      query: 'nocturne s01e02',
      kind: 'series' as const,
      includeLocal: false,
      includeUsenet: false,
      indexers: ['torrentio'],
      categoryMode: 'name' as const,
    };
    const page1 = await searchMedia({ ...base, page: { limit: 20, offset: 0 } });
    const page2 = await searchMedia({ ...base, page: { limit: 20, offset: 20 } });

    expect(page1.results.torrents.total).toBe(103);
    expect(page2.results.torrents.total).toBe(103);
    expect(page2.results.torrents.items.length).toBe(20);
    expect(call).toBe(1);
  });
});

describe('parseSeasonEpisode', () => {
  it('parses common season/episode formats', () => {
    expect(parseSeasonEpisode('silo s03')).toEqual({ baseQuery: 'silo', season: 3, episode: undefined });
    expect(parseSeasonEpisode('Breaking Bad S03E05')).toEqual({ baseQuery: 'Breaking Bad', season: 3, episode: 5 });
    expect(parseSeasonEpisode('show season 2')).toEqual({ baseQuery: 'show', season: 2, episode: undefined });
    expect(parseSeasonEpisode('show episode 7')).toEqual({ baseQuery: 'show', season: undefined, episode: 7 });
    expect(parseSeasonEpisode('inception')).toEqual({ baseQuery: 'inception', season: undefined, episode: undefined });
    expect(parseSeasonEpisode('s01')).toEqual({ baseQuery: '', season: 1, episode: undefined });
  });

  it('keeps total stable across pages: 74 Torrentio streams -> page 1 and page 2 both report total 74', async () => {
    (searchTitles as any).mockResolvedValue({
      items: [{ imdbId: 'tt9999999', primaryTitle: 'Nocturne', titleType: 'tvSeries', startYear: 2022 }],
      total: 1,
    });
    const streams = Array.from({ length: 74 }, (_, i) => ({
      hash: ('hash' + String(i).padStart(2, '0') + 'a'.repeat(34)).slice(0, 40),
      magnet: `magnet:?xt=urn:btih:hash${i}`,
      name: `Nocturne S01E02 release ${i}`,
      seeders: 100 - i, leechers: i, size: 1000 + i, source: 'Torrentio',
    }));
    (searchTorrentCandidates as any).mockResolvedValue(streams);

    const base = {
      query: 'nocturne s01e02',
      kind: 'series' as const,
      includeLocal: false,
      includeUsenet: false,
      indexers: ['torrentio'],
      categoryMode: 'name' as const,
    };

    const page1 = await searchMedia({ ...base, page: { limit: 20, offset: 0 } });
    const page2 = await searchMedia({ ...base, page: { limit: 20, offset: 20 } });
    const page4 = await searchMedia({ ...base, page: { limit: 20, offset: 60 } });

    for (const call of (searchTorrentCandidates as any).mock.calls) {
      expect(call[3]).toBe(100);
      expect(call[4]).toBe(0);
    }

    expect(page1.results.torrents.total).toBe(74);
    expect(page1.results.torrents.items.length).toBe(20);
    expect(page2.results.torrents.total).toBe(74);
    expect(page2.results.torrents.items.length).toBe(20);
    expect(page4.results.torrents.total).toBe(74);
    expect(page4.results.torrents.items.length).toBe(14);

    const p1Names = new Set(page1.results.torrents.items.map((t: any) => t.name));
    for (const t of page2.results.torrents.items as any[]) {
      expect(p1Names.has(t.name)).toBe(false);
    }
  });
});
