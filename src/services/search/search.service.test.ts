import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchMedia } from './search.service';

// Mock dependencies
vi.mock('../../db/database', () => ({
  searchTitles: vi.fn(),
}));
vi.mock('../musicSearch', () => ({
  searchMusicMetadata: vi.fn(),
}));
vi.mock('../torbox/torrentSearch', () => ({
  searchTorrentsViaProwlarr: vi.fn(),
}));
vi.mock('../usenetSearch', () => ({
  searchUsenet: vi.fn(),
}));

import { searchTitles } from '../../db/database';
import { searchMusicMetadata } from '../musicSearch';
import { searchTorrentsViaProwlarr } from '../torbox/torrentSearch';
import { searchUsenet } from '../usenetSearch';

beforeEach(() => {
  vi.resetAllMocks();
  process.env.TORZNAB_URL = 'http://prowlarr:9696/api'
  process.env.TORZNAB_API_KEY = 'test-key';
  process.env.TORBOX_API_KEY = 'test-key';
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
});
