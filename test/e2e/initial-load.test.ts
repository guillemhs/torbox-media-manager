import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import { initializeDatabase } from '../../src/db/database';

let app: express.Application;
let server: any;

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: true, limit: '32kb' }));

  const {
    browseRoute: browseR,
    moviesRoute: moviesR,
    showsRoute: showsR,
    musicRoute: musicR,
  } = await import('../../src/routes/catalog');

  app.get('/api/browse', browseR);
  app.get('/api/movies', moviesR);
  app.get('/api/shows', showsR);
  app.get('/api/music', musicR);

  await initializeDatabase();
  server = app.listen(0);
});

afterAll(async () => {
  if (server) await server.close();
});

describe('INITIAL LOAD & UI BEHAVIOR', () => {
  describe('/browse initial load', () => {
    it('should return empty results when no query is provided', async () => {
      const response = await app.get('/api/browse?q=&kind=all&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items).toHaveLength(0);
      expect(response.body.results.torrents.items).toHaveLength(0);
      expect(response.body.results.usenet.items).toHaveLength(0);
      expect(response.body.results.local.total).toBe(0);
      expect(response.body.results.torrents.total).toBe(0);
      expect(response.body.results.usenet.total).toBe(0);
    });

    it('should return empty results when query is less than 2 characters', async () => {
      const response = await app.get('/api/browse?q=a&kind=all&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items).toHaveLength(0);
      expect(response.body.results.torrents.items).toHaveLength(0);
      expect(response.body.results.usenet.items).toHaveLength(0);
    });
  });

  describe('/movies initial load', () => {
    it('should return empty results when no query is provided', async () => {
      const response = await app.get('/api/movies?q=&kind=movie&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items).toHaveLength(0);
      expect(response.body.results.torrents.items).toHaveLength(0);
      expect(response.body.results.usenet.items).toHaveLength(0);
      expect(response.body.results.local.total).toBe(0);
      expect(response.body.results.torrents.total).toBe(0);
      expect(response.body.results.usenet.total).toBe(0);
    });

    it('should return empty results when query is less than 2 characters', async () => {
      const response = await app.get('/api/movies?q=f&kind=movie&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items).toHaveLength(0);
      expect(response.body.results.torrents.items).toHaveLength(0);
      expect(response.body.results.usenet.items).toHaveLength(0);
    });
  });

  describe('/shows initial load', () => {
    it('should return empty results when no query is provided', async () => {
      const response = await app.get('/api/shows?q=&kind=series&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items).toHaveLength(0);
      expect(response.body.results.torrents.items).toHaveLength(0);
      expect(response.body.results.usenet.items).toHaveLength(0);
      expect(response.body.results.local.total).toBe(0);
      expect(response.body.results.torrents.total).toBe(0);
      expect(response.body.results.usenet.total).toBe(0);
    });

    it('should return empty results when query is less than 2 characters', async () => {
      const response = await app.get('/api/shows?q=b&kind=series&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items).toHaveLength(0);
      expect(response.body.results.torrents.items).toHaveLength(0);
      expect(response.body.results.usenet.items).toHaveLength(0);
    });
  });

  describe('/music initial load', () => {
    it('should return empty results when no query is provided', async () => {
      const response = await app.get('/api/music?q=&kind=music&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items).toHaveLength(0);
      expect(response.body.results.torrents.items).toHaveLength(0);
      expect(response.body.results.usenet.items).toHaveLength(0);
      expect(response.body.results.local.total).toBe(0);
      expect(response.body.results.torrents.total).toBe(0);
      expect(response.body.results.usenet.total).toBe(0);
    });

    it('should return empty results when query is less than 2 characters', async () => {
      const response = await app.get('/api/music?q=m&kind=music&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.local.items).toHaveLength(0);
      expect(response.body.results.torrents.items).toHaveLength(0);
      expect(response.body.results.usenet.items).toHaveLength(0);
    });
  });

  describe('Pagination', () => {
    it('should paginate browse results correctly', async () => {
      const { searchTitles } = await import('../../src/db/database');
      const { searchTorrentCandidates } = await import('../../src/services/torbox/torrentSearch');
      const { searchUsenet } = await import('../../src/services/usenetSearch');

      vi.mock('../../src/db/database', () => ({
        ...vi.importActual('../../src/db/database'),
        searchTitles: vi.fn(),
      }));
      vi.mocked(searchTitles).mockResolvedValue({
        items: [
          { imdbId: 'tt001', titleType: 'movie', primaryTitle: 'Movie A', startYear: 2020 },
          { imdbId: 'tt002', titleType: 'movie', primaryTitle: 'Movie B', startYear: 2021 },
          { imdbId: 'tt003', titleType: 'movie', primaryTitle: 'Movie C', startYear: 2022 },
        ],
        total: 3,
        limit: 2,
        offset: 0,
      });
      vi.mocked(searchTorrentCandidates).mockResolvedValue([]);
      vi.mocked(searchUsenet).mockResolvedValue({ candidates: [], warnings: [], configured: { NZBIndex: true, Binsearch: true } });

      // Page 1
      const page1 = await app.get('/api/browse?q=Movie&kind=all&limit=2&offset=0');
      expect(page1.status).toBe(200);
      expect(page1.body.results.local.items).toHaveLength(2);
      expect(page1.body.results.local.items[0].primaryTitle).toBe('Movie A');
      expect(page1.body.results.local.items[1].primaryTitle).toBe('Movie B');

      // Page 2
      vi.mocked(searchTitles).mockResolvedValue({
        items: [
          { imdbId: 'tt003', titleType: 'movie', primaryTitle: 'Movie C', startYear: 2022 },
        ],
        total: 3,
        limit: 2,
        offset: 2,
      });

      const page2 = await app.get('/api/browse?q=Movie&kind=all&limit=2&offset=2');
      expect(page2.status).toBe(200);
      expect(page2.body.results.local.items).toHaveLength(1);
      expect(page2.body.results.local.items[0].primaryTitle).toBe('Movie C');
    });

    it('should paginate movies results correctly', async () => {
      const { searchTitles } = await import('../../src/db/database');
      const { searchTorrentsViaProwlarr } = await import('../../src/services/torbox/torrentSearch');
      const { searchUsenet } = await import('../../src/services/usenetSearch');

      vi.mock('../../src/db/database', () => ({
        ...vi.importActual('../../src/db/database'),
        searchTitles: vi.fn(),
      }));
      vi.mocked(searchTitles).mockResolvedValue({
        items: [
          { imdbId: 'tt001', titleType: 'movie', primaryTitle: 'Movie A', startYear: 2020 },
          { imdbId: 'tt002', titleType: 'movie', primaryTitle: 'Movie B', startYear: 2021 },
        ],
        total: 2,
        limit: 1,
        offset: 0,
      });
      vi.mocked(searchTorrentsViaProwlarr).mockResolvedValue([]);
      vi.mocked(searchUsenet).mockResolvedValue({ candidates: [], warnings: [], configured: { NZBIndex: true, Binsearch: true } });

      const page1 = await app.get('/api/movies?q=Movie&kind=movie&limit=1&offset=0');
      expect(page1.status).toBe(200);
      expect(page1.body.results.local.items).toHaveLength(1);
      expect(page1.body.results.local.items[0].primaryTitle).toBe('Movie A');

      vi.mocked(searchTitles).mockResolvedValue({
        items: [
          { imdbId: 'tt002', titleType: 'movie', primaryTitle: 'Movie B', startYear: 2021 },
        ],
        total: 2,
        limit: 1,
        offset: 1,
      });

      const page2 = await app.get('/api/movies?q=Movie&kind=movie&limit=1&offset=1');
      expect(page2.status).toBe(200);
      expect(page2.body.results.local.items).toHaveLength(1);
      expect(page2.body.results.local.items[0].primaryTitle).toBe('Movie B');
    });
  });
});
