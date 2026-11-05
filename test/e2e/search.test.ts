import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock all external services BEFORE importing routes
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

vi.mock('../../src/services/torbox/client', () => ({
  TorboxApiError: class extends Error {
    status: number;
    responseBody?: unknown;
    constructor(status: number, message: string, responseBody?: unknown) {
      super(message);
      this.status = status;
      this.responseBody = responseBody;
      this.name = 'TorboxApiError';
    }
  },
  addTorrentToTorbox: vi.fn(),
  checkCachedTorrent: vi.fn(),
  getTorrentList: vi.fn(),
  getUsenetList: vi.fn(),
  requestTorrentDownload: vi.fn(),
  requestUsenetDownload: vi.fn(),
  addUsenetNzb: vi.fn(),
  fetchUsenetNzb: vi.fn(),
}));

vi.mock('../../src/services/torbox/torrentSearch', () => ({
  searchTorrentCandidates: vi.fn(),
  searchTorrentsViaProwlarr: vi.fn(),
}));

vi.mock('../../src/services/musicSearch', () => ({
  searchMusicMetadata: vi.fn(),
  searchMusicTorrents: vi.fn(),
  getMusicTorrentDownload: vi.fn(),
  searchIndexerTorrents: vi.fn(),
}));

vi.mock('../../src/services/usenetSearch', () => ({
  searchUsenet: vi.fn(),
  fetchUsenetNzb: vi.fn(),
}));

vi.mock('../../src/services/tvmaze/schedule.service', () => ({
  getTvmazeSchedule: vi.fn(),
  getTvmazeShow: vi.fn(),
  getTvmazeShowByImdb: vi.fn(),
  getTvmazeMonthlyCalendar: vi.fn(),
}));

vi.mock('../../src/services/artwork.service', () => ({
  getTitleArtwork: vi.fn(),
  getTitleMetadata: vi.fn(),
  getMusicArtwork: vi.fn(),
  getMusicArtworkByReleaseGroup: vi.fn(),
}));

vi.mock('../../src/services/imdb/import.service', () => ({
  importImdbDatasets: vi.fn(),
  needsImdbImport: vi.fn(),
}));

let app: express.Application;
let server: any;

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: true, limit: '32kb' }));

  // Dynamically import routes after mocks are set up
  const {
    getLibraryRoute: libRoute,
    usenetSearchRoute: usenetRoute,
    addUsenetToTorboxRoute: addUsenetRoute,
    downloadUsenetFileRoute: downloadUsenetRoute,
    streamTorboxTrackRoute: streamRoute,
    triggerLibraryScanRoute: scanRoute,
    syncLibraryTorboxRoute: syncRoute,
    getLibraryStatusRoute: statusRoute,
  } = await import('../../src/routes/library');
  const {
    addTorrentToTorboxRoute: addTorrentRoute,
    torrentSearchRoute: torrentSearchR,
  } = await import('../../src/routes/torrent');
  const {
    musicMetadataSearchRoute: musicMetaRoute,
    musicTorrentSearchRoute: musicTorrentRoute,
    musicRoute: musicR,
    musicTorrentDownloadRoute: musicDownloadRoute,
    musicArtworkRoute: musicArtworkR,
  } = await import('../../src/routes/music');
  const {
    moviesRoute: moviesR,
    showsRoute: showsR,
    browseRoute: browseR,
    titleRoute: titleR,
    titleArtworkRoute: titleArtworkR,
  } = await import('../../src/routes/catalog');
  const { unifiedSearchRoute: unifiedR } = await import('../../src/routes/search');
  const { calendarRoute: calendarR, tvmazeShowRoute: tvmazeR } = await import('../../src/routes/calendar');
  const { imdbImportRoute: imdbImportR } = await import('../../src/routes/import');

  app.get('/health', async (_req, res) => {
    res.json({ status: 'ok', mode: 'local-offline' });
  });
  app.get('/library', libRoute);
  app.get('/library/status', statusRoute);
  app.post('/library/scan', scanRoute);
  app.post('/library/sync', syncRoute);
  app.post('/torbox/torrents', addTorrentRoute);
  app.get('/usenet/search', usenetRoute);
  app.post('/torbox/usenet', addUsenetRoute);
  app.get('/torbox/usenet/:usenetId/files/:fileId', downloadUsenetRoute);
  app.get('/library/torrents/search', torrentSearchR);
  app.get('/api/movies', moviesR);
  app.get('/api/movies/:imdbId', titleR);
  app.get('/api/shows', showsR);
  app.get('/api/shows/:imdbId', titleR);
  app.get('/api/browse', browseR);
  app.get('/api/search', unifiedR);
  app.get('/api/calendar', calendarR);
  app.get('/tvmaze/shows/:id', tvmazeR);
  app.get('/artwork/:imdbId', titleArtworkR);
  app.get('/api/music', musicR);
  app.get('/music/search', musicMetaRoute);
  app.get('/music/torrents/search', musicTorrentRoute);
  app.get('/music/torrents/download/:token', musicDownloadRoute);
  app.get('/music/artwork', musicArtworkR);
  app.get('/music/:torrentId/:fileId/stream', streamRoute);
  app.post('/admin/imdb/import', imdbImportR);
  app.get('/admin/imdb/status', async (_req, res) => {
    res.json({ titles: 0, datasets: [], progress: { running: false, dataset: '', importedRows: 0 } });
  });

  server = app.listen(0);
});

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SEARCH FUNCTIONALITY - Indexers & Usenet', () => {
  describe('/browse search', () => {
    it('should return Indexers and Usenet results for query "Nocturne"', async () => {
      const { searchTorrentCandidates } = await import('../../src/services/torbox/torrentSearch');
      const { searchUsenet } = await import('../../src/services/usenetSearch');

      vi.mocked(searchTorrentCandidates).mockResolvedValue([
        { hash: 'abc123', magnet: 'magnet:?xt=urn:btih:abc123', name: 'Nocturne 2023', seeders: 10, leechers: 2, size: 1073741824, source: 'Torrentio' },
      ]);
      vi.mocked(searchUsenet).mockResolvedValue({
        candidates: [{ id: 'nzb1', name: 'Nocturne.2023.1080p', size: 2147483648, posted: 1700000000, complete: true, source: 'NZBIndex' }],
        warnings: [],
        configured: { NZBIndex: true, Binsearch: true },
      });

      const response = await app.get('/api/browse?q=Nocturne&sources=indexers,usenet&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.torrents.items.length).toBeGreaterThan(0);
      expect(response.body.results.usenet.items.length).toBeGreaterThan(0);
      expect(response.body.results.torrents.items[0].name).toContain('Nocturne');
      expect(response.body.results.usenet.items[0].name).toContain('Nocturne');
    });

    it('should return only Indexers results when Usenet not selected', async () => {
      const { searchTorrentCandidates } = await import('../../src/services/torbox/torrentSearch');
      const { searchUsenet } = await import('../../src/services/usenetSearch');

      vi.mocked(searchTorrentCandidates).mockResolvedValue([
        { hash: 'def456', magnet: 'magnet:?xt=urn:btih:def456', name: 'Nocturne.S01E01', seeders: 5, leechers: 1, size: 536870912, source: 'Prowlarr' },
      ]);
      vi.mocked(searchUsenet).mockResolvedValue({ candidates: [], warnings: [], configured: { NZBIndex: true, Binsearch: true } });

      const response = await app.get('/api/browse?q=Nocturne&sources=indexers&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.torrents.items.length).toBeGreaterThan(0);
      expect(response.body.results.usenet.items.length).toBe(0);
    });
  });

  describe('/movies search', () => {
    it('should return Indexers and Usenet results for query "Forrest Gump"', async () => {
      const { searchTorrentCandidates } = await import('../../src/services/torbox/torrentSearch');
      const { searchIndexerTorrents } = await import('../../src/services/musicSearch');
      const { searchUsenet } = await import('../../src/services/usenetSearch');

      vi.mocked(searchTorrentCandidates).mockResolvedValue([
        { hash: 'ghi789', magnet: 'magnet:?xt=urn:btih:ghi789', name: 'Forrest.Gump.1994', seeders: 15, leechers: 3, size: 2147483648, source: 'Torrentio' },
      ]);
      vi.mocked(searchIndexerTorrents).mockResolvedValue([
        { hash: 'jkl012', magnet: 'magnet:?xt=urn:btih:jkl012', name: 'Forrest.Gump.BluRay', seeders: 8, leechers: 0, size: 4294967296, source: 'Prowlarr' },
      ]);
      vi.mocked(searchUsenet).mockResolvedValue({
        candidates: [{ id: 'nzb2', name: 'Forrest.Gump.1994.1080p', size: 4294967296, posted: 1700000000, complete: true, source: 'Binsearch' }],
        warnings: [],
        configured: { NZBIndex: true, Binsearch: true },
      });

      const response = await app.get('/api/movies?q=Forrest%20Gump&kind=movie&sources=indexers,usenet&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.torrents.items.length).toBeGreaterThan(0);
      expect(response.body.results.usenet.items.length).toBeGreaterThan(0);
      expect(response.body.results.torrents.items.some((t: any) => t.name.toLowerCase().includes('forrest'))).toBe(true);
      expect(response.body.results.usenet.items.some((u: any) => u.name.toLowerCase().includes('forrest'))).toBe(true);
    });
  });

  describe('/shows search', () => {
    it('should return Indexers and Usenet results for query "Breaking Bad"', async () => {
      const { searchTorrentCandidates } = await import('../../src/services/torbox/torrentSearch');
      const { searchIndexerTorrents } = await import('../../src/services/musicSearch');
      const { searchUsenet } = await import('../../src/services/usenetSearch');

      vi.mocked(searchTorrentCandidates).mockResolvedValue([
        { hash: 'mno345', magnet: 'magnet:?xt=urn:btih:mno345', name: 'Breaking.Bad.S01', seeders: 20, leechers: 5, size: 4294967296, source: 'Torrentio' },
      ]);
      vi.mocked(searchIndexerTorrents).mockResolvedValue([
        { hash: 'pqr678', magnet: 'magnet:?xt=urn:btih:pqr678', name: 'Breaking.Bad.Complete', seeders: 30, leechers: 10, size: 21474836480, source: 'Prowlarr' },
      ]);
      vi.mocked(searchUsenet).mockResolvedValue({
        candidates: [{ id: 'nzb3', name: 'Breaking.Bad.S01-S05', size: 10737418240, posted: 1700000000, complete: true, source: 'NZBIndex' }],
        warnings: [],
        configured: { NZBIndex: true, Binsearch: true },
      });

      const response = await app.get('/api/shows?q=Breaking%20Bad&kind=series&sources=indexers,usenet&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.torrents.items.length).toBeGreaterThan(0);
      expect(response.body.results.usenet.items.length).toBeGreaterThan(0);
      expect(response.body.results.torrents.items.some((t: any) => t.name.toLowerCase().includes('breaking'))).toBe(true);
      expect(response.body.results.usenet.items.some((u: any) => u.name.toLowerCase().includes('breaking'))).toBe(true);
    });
  });

  describe('/music search', () => {
    it('should return Indexers and Usenet results for query "Michael Jackson"', async () => {
      const { searchMusicTorrents } = await import('../../src/services/musicSearch');
      const { searchUsenet } = await import('../../src/services/usenetSearch');

      vi.mocked(searchMusicTorrents).mockResolvedValue([
        { hash: 'stu901', magnet: 'magnet:?xt=urn:btih:stu901', name: 'Michael.Jackson.Thriller', seeders: 25, leechers: 8, size: 1073741824, source: 'Prowlarr' },
      ]);
      vi.mocked(searchUsenet).mockResolvedValue({
        candidates: [{ id: 'nzb4', name: 'Michael.Jackson.Bad.1987', size: 536870912, posted: 1700000000, complete: true, source: 'Binsearch' }],
        warnings: [],
        configured: { NZBIndex: true, Binsearch: true },
      });

      const response = await app.get('/api/music?q=Michael%20Jackson&kind=music&sources=indexers,usenet&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.results.torrents.items.length).toBeGreaterThan(0);
      expect(response.body.results.usenet.items.length).toBeGreaterThan(0);
      expect(response.body.results.torrents.items.some((t: any) => t.name.toLowerCase().includes('michael'))).toBe(true);
      expect(response.body.results.usenet.items.some((u: any) => u.name.toLowerCase().includes('michael'))).toBe(true);
    });
  });

  describe('/api/search unified search', () => {
    it('should return combined Indexers and Usenet results for all sources', async () => {
      const { searchTorrentCandidates } = await import('../../src/services/torbox/torrentSearch');
      const { searchIndexerTorrents } = await import('../../src/services/musicSearch');
      const { searchUsenet } = await import('../../src/services/usenetSearch');

      vi.mocked(searchTorrentCandidates).mockResolvedValue([
        { hash: 'vwx234', magnet: 'magnet:?xt=urn:btih:vwx234', name: 'Test.Movie.2023', seeders: 12, leechers: 4, size: 1073741824, source: 'Torrentio' },
      ]);
      vi.mocked(searchIndexerTorrents).mockResolvedValue([
        { hash: 'yza567', magnet: 'magnet:?xt=urn:btih:yza567', name: 'Test.Movie.BluRay', seeders: 6, leechers: 2, size: 2147483648, source: 'Prowlarr' },
      ]);
      vi.mocked(searchUsenet).mockResolvedValue({
        candidates: [{ id: 'nzb5', name: 'Test.Movie.1080p', size: 2147483648, posted: 1700000000, complete: true, source: 'NZBIndex' }],
        warnings: [],
        configured: { NZBIndex: true, Binsearch: true },
      });

      const response = await app.get('/api/search?q=Test%20Movie&sources=indexers,usenet&indexers=prowlarr,torrentio&limit=20&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.torrents.items.length).toBeGreaterThan(0);
      expect(response.body.usenet.items.length).toBeGreaterThan(0);
    });
  });
});
