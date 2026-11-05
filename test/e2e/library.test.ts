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
    getLibraryRoute: libRoute,
    getLibraryStatusRoute: statusRoute,
    triggerLibraryScanRoute: scanRoute,
    syncLibraryTorboxRoute: syncRoute,
  } = await import('../../src/routes/library');

  app.get('/library', libRoute);
  app.get('/library/status', statusRoute);
  app.post('/library/scan', scanRoute);
  app.post('/library/sync', syncRoute);

  await initializeDatabase();
  server = app.listen(0);
});

afterAll(async () => {
  if (server) await server.close();
});

describe('LIBRARY FUNCTIONALITY', () => {
  describe('GET /library', () => {
    it('should return library items when TorBox API key is configured', async () => {
      const { getTorrentList } = await import('../../src/services/torbox/client');
      const { getUsenetList } = await import('../../src/services/torbox/client');

      vi.mocked(getTorrentList).mockResolvedValue({
        success: true,
        error: null,
        detail: 'OK',
        data: [
          { id: 1, hash: 'abc123', name: 'Movie.2023.1080p', size: 1073741824, download_state: 'finished', download_finished: true, files: [] },
          { id: 2, hash: 'def456', name: 'Show.S01E01.mkv', size: 536870912, download_state: 'finished', download_finished: true, files: [] },
        ],
      });
      vi.mocked(getUsenetList).mockResolvedValue({
        success: true,
        error: null,
        detail: 'OK',
        data: [],
      });

      const response = await app.get('/library?limit=1000&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.torbox).toHaveLength(2);
      expect(response.body.torbox[0].name).toBe('Movie.2023.1080p');
      expect(response.body.torbox[1].name).toBe('Show.S01E01.mkv');
      expect(response.body.mode).toBe('torbox-integrated');
    });

    it('should return local media when TorBox API key is not configured', async () => {
      process.env.TORBOX_API_KEY = '';

      const response = await app.get('/library?limit=1000&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('local-offline');
      expect(response.body.localMedia).toBeDefined();
      expect(response.body.torbox).toBeUndefined();

      process.env.TORBOX_API_KEY = 'test-key';
    });

    it('should handle TorBox API error gracefully', async () => {
      const { getTorrentList } = await import('../../src/services/torbox/client');

      vi.mocked(getTorrentList).mockRejectedValue(new Error('TorBox API unavailable'));

      const response = await app.get('/library?limit=1000&offset=0');

      expect(response.status).toBe(502);
      expect(response.body.error).toBe('TorBox API unavailable');
    });
  });

  describe('GET /library/status', () => {
    it('should return library status with TorBox API key configured', async () => {
      process.env.TORBOX_API_KEY = 'test-key';

      const response = await app.get('/library/status');

      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('torbox-integrated');
      expect(response.body.torboxApiKeyConfigured).toBe(true);
      expect(response.body.features).toContain('torbox-cloud');
      expect(response.body.features).toContain('torbox-music');

      process.env.TORBOX_API_KEY = '';
    });

    it('should return library status without TorBox API key', async () => {
      process.env.TORBOX_API_KEY = '';

      const response = await app.get('/library/status');

      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('local-offline');
      expect(response.body.torboxApiKeyConfigured).toBe(false);
      expect(response.body.features).not.toContain('torbox-cloud');

      process.env.TORBOX_API_KEY = 'test-key';
    });
  });

  describe('Library Pagination', () => {
    it('should paginate library results correctly', async () => {
      const { getTorrentList } = await import('../../src/services/torbox/client');
      const { getUsenetList } = await import('../../src/services/torbox/client');

      vi.mocked(getTorrentList).mockResolvedValue({
        success: true,
        error: null,
        detail: 'OK',
        data: [
          { id: 1, hash: 'hash1', name: 'Item 1', size: 100, download_state: 'finished', download_finished: true, files: [] },
          { id: 2, hash: 'hash2', name: 'Item 2', size: 200, download_state: 'finished', download_finished: true, files: [] },
          { id: 3, hash: 'hash3', name: 'Item 3', size: 300, download_state: 'finished', download_finished: true, files: [] },
        ],
      });
      vi.mocked(getUsenetList).mockResolvedValue({
        success: true,
        error: null,
        detail: 'OK',
        data: [],
      });

      // Page 1 with limit 2
      const page1 = await app.get('/library?limit=2&offset=0');
      expect(page1.status).toBe(200);
      expect(page1.body.torbox).toHaveLength(2);
      expect(page1.body.torbox[0].name).toBe('Item 1');
      expect(page1.body.torbox[1].name).toBe('Item 2');

      // Page 2 with limit 2
      vi.mocked(getTorrentList).mockResolvedValue({
        success: true,
        error: null,
        detail: 'OK',
        data: [
          { id: 3, hash: 'hash3', name: 'Item 3', size: 300, download_state: 'finished', download_finished: true, files: [] },
        ],
      });

      const page2 = await app.get('/library?limit=2&offset=2');
      expect(page2.status).toBe(200);
      expect(page2.body.torbox).toHaveLength(1);
      expect(page2.body.torbox[0].name).toBe('Item 3');
    });
  });

  describe('POST /library/scan', () => {
    it('should trigger local media scan', async () => {
      const response = await app.post('/library/scan');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /library/sync', () => {
    it('should sync TorBox library when API key is configured', async () => {
      process.env.TORBOX_API_KEY = 'test-key';

      const { getTorrentList } = await import('../../src/services/torbox/client');
      vi.mocked(getTorrentList).mockResolvedValue({
        success: true,
        error: null,
        detail: 'Synced',
        data: [{ id: 1, hash: 'hash1', name: 'Synced Item', size: 100, download_state: 'finished', download_finished: true, files: [] }],
      });

      const response = await app.post('/library/sync');

      expect(response.status).toBe(200);
      expect(response.body.detail).toBe('Synced');

      process.env.TORBOX_API_KEY = '';
    });

    it('should return 503 when TorBox API key is not configured', async () => {
      process.env.TORBOX_API_KEY = '';

      const response = await app.post('/library/sync');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('TORBOX_API_KEY is not configured.');

      process.env.TORBOX_API_KEY = 'test-key';
    });
  });
});
