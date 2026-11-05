import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';

// Mock database before importing routes
vi.mock('../../src/db/database', () => ({
  initializeDatabase: vi.fn().mockResolvedValue(undefined),
  searchTitles: vi.fn(),
  getTitle: vi.fn(),
  countTitles: vi.fn(),
  getImportStatus: vi.fn(),
  markDatasetImported: vi.fn(),
  isDatasetImported: vi.fn(),
  saveTitleBatch: vi.fn(),
  saveRatingBatch: vi.fn(),
  getCachedSchedule: vi.fn(),
  saveCachedSchedule: vi.fn(),
  closeDatabase: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../src/services/musicSearch', () => ({
  searchMusicMetadata: vi.fn(),
  searchMusicTorrents: vi.fn(),
  getMusicTorrentDownload: vi.fn(),
  searchIndexerTorrents: vi.fn(),
}));

let app: express.Application;
let server: any;

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: true, limit: '32kb' }));

  const {
    moviesRoute: moviesR,
    showsRoute: showsR,
    browseRoute: browseR,
    musicRoute: musicR,
  } = await import('../../src/routes/catalog');
  const { musicMetadataSearchRoute: musicMetaRoute } = await import('../../src/routes/music');

  app.get('/api/movies', moviesR);
  app.get('/api/movies/:imdbId', async (_req, res) => res.json({}));
  app.get('/api/shows', showsR);
  app.get('/api/shows/:imdbId', async (_req, res) => res.json({}));
  app.get('/api/browse', browseR);
  app.get('/api/music', musicR);
  app.get('/music/search', musicMetaRoute);

  server = app.listen(0);
});

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DISCOVER FUNCTIONALITY - Local IMDb & MusicBrainz', () => {
  describe('/browse discover', () => {
    it('should return only local IMDb results for query "Nocturne"', async () => {
      const { searchTitles } = await import('../../src/db/database');

      vi.mocked(searchTitles).mockResolvedValue({
        items: [
          { imdbId: 'tt1234567', titleType: 'movie', primaryTitle: 'Nocturne', originalTitle: 'Nocturne', startYear: 2023, runtimeMinutes: 120, genres: 'Drama', averageRating: 7.5, numVotes: 1000 },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const response = await app.get('/api/browse?q=Nocturne&kind=all&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items.length).toBeGreaterThan(0);
      expect(response.body.results.local.items[0].primaryTitle).toBe('Nocturne');
      expect(response.body.results.local.items[0]._source).toBe('local');
    });
  });

  describe('/movies discover', () => {
    it('should return only local IMDb movies for query "Forrest Gump"', async () => {
      const { searchTitles } = await import('../../src/db/database');

      vi.mocked(searchTitles).mockResolvedValue({
        items: [
          { imdbId: 'tt0109830', titleType: 'movie', primaryTitle: 'Forrest Gump', originalTitle: 'Forrest Gump', startYear: 1994, runtimeMinutes: 142, genres: 'Drama|Romance', averageRating: 8.8, numVotes: 2000000 },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const response = await app.get('/api/movies?q=Forrest%20Gump&kind=movie&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items.length).toBeGreaterThan(0);
      expect(response.body.results.local.items[0].primaryTitle).toBe('Forrest Gump');
      expect(response.body.results.local.items[0].titleType).toBe('movie');
      expect(response.body.results.local.items[0]._source).toBe('local');
    });
  });

  describe('/shows discover', () => {
    it('should return only local IMDb TV shows for query "Breaking Bad"', async () => {
      const { searchTitles } = await import('../../src/db/database');

      vi.mocked(searchTitles).mockResolvedValue({
        items: [
          { imdbId: 'tt0903747', titleType: 'tvSeries', primaryTitle: 'Breaking Bad', originalTitle: 'Breaking Bad', startYear: 2008, runtimeMinutes: 47, genres: 'Crime|Drama|Thriller', averageRating: 9.5, numVotes: 1500000 },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const response = await app.get('/api/shows?q=Breaking%20Bad&kind=series&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items.length).toBeGreaterThan(0);
      expect(response.body.results.local.items[0].primaryTitle).toBe('Breaking Bad');
      expect(response.body.results.local.items[0].titleType).toBe('tvSeries');
      expect(response.body.results.local.items[0]._source).toBe('local');
    });
  });

  describe('/music discover', () => {
    it('should return only MusicBrainz results for query "Michael Jackson"', async () => {
      const { searchMusicMetadata } = await import('../../src/services/musicSearch');

      vi.mocked(searchMusicMetadata).mockResolvedValue([
        { id: 'abc123', title: 'Thriller', artist: 'Michael Jackson', date: '1982-11-30', type: 'Album', cover: 'https://coverartarchive.org/release-group/abc123/front-250' },
        { id: 'def456', title: 'Bad', artist: 'Michael Jackson', date: '1987-08-31', type: 'Album', cover: 'https://coverartarchive.org/release-group/def456/front-250' },
      ]);

      const response = await app.get('/api/music?q=Michael%20Jackson&kind=music&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items.length).toBeGreaterThan(0);
      expect(response.body.results.local.items.some((item: any) => item.artist === 'Michael Jackson')).toBe(true);
      expect(response.body.results.local.items[0]._source).toBe('local');
    });
  });
});
