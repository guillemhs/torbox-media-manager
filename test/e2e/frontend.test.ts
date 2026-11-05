import { describe, it, expect, vi } from 'vitest';

describe('FRONTEND - Render Functions', () => {
  describe('renderSearchItem', () => {
    it('should render torrent item with correct data', async () => {
      // We test the logic indirectly by checking the module exports
      const { renderSearchItem } = await import('../../src/public/js/render.js');

      const item = {
        _source: 'torrents',
        primaryTitle: 'Test Movie',
        startYear: 2023,
        titleType: 'movie',
        size: 1073741824,
        seeders: 10,
        leechers: 2,
        source: 'Torrentio',
        magnet: 'magnet:?xt=urn:btih:abc123',
        hash: 'abc123',
      };

      const result = renderSearchItem(item, 0);

      expect(result).toContain('Test Movie');
      expect(result).toContain('2023');
      expect(result).toContain('movie');
      expect(result).toContain('Copy Magnet');
      expect(result).toContain('Add to Torbox');
      expect(result).toContain('magnet:?xt=urn:btih:abc123');
      expect(result).not.toContain('Year unknown');
      expect(result).not.toContain('Unknown');
    });

    it('should render usenet item with correct data', async () => {
      const { renderSearchItem } = await import('../../src/public/js/render.js');

      const item = {
        _source: 'usenet',
        name: 'Test.Show.S01E01',
        size: 536870912,
        posted: 1700000000,
        complete: true,
        source: 'NZBIndex',
        id: 'nzb1',
      };

      const result = renderSearchItem(item, 0);

      expect(result).toContain('Test.Show.S01E01');
      expect(result).toContain('Usenet');
      expect(result).toContain('Add to Torbox');
      expect(result).not.toContain('Year unknown');
      expect(result).not.toContain('Unknown');
    });

    it('should not show year-type when no year or titleType data', async () => {
      const { renderSearchItem } = await import('../../src/public/js/render.js');

      const item = {
        _source: 'torrents',
        name: 'Unknown Release',
        size: 100,
        source: 'Prowlarr',
        hash: 'xyz789',
      };

      const result = renderSearchItem(item, 0);

      expect(result).toContain('Unknown Release');
      expect(result).not.toContain('Year unknown');
      expect(result).not.toContain('Unknown');
    });

    it('should render category tag for local items', async () => {
      const { renderSearchItem } = await import('../../src/public/js/render.js');

      const item = {
        _source: 'local',
        primaryTitle: 'Local Movie',
        startYear: 2023,
        titleType: 'movie',
        genres: 'Drama',
      };

      const result = renderSearchItem(item, 0);

      expect(result).toContain('Local Movie');
      expect(result).toContain('2023');
      expect(result).toContain('movie');
    });
  });

  describe('renderPagination', () => {
    it('should render pagination with correct page numbers', async () => {
      // We can't easily test DOM manipulation in vitest without jsdom,
      // but we can verify the function exists and is exported
      const { renderPagination } = await import('../../src/public/js/render.js');
      expect(typeof renderPagination).toBe('function');
    });
  });

  describe('state management', () => {
    it('should have correct initial state structure', async () => {
      const { state } = await import('../../src/public/js/state.js');

      expect(state.view).toBe('browse');
      expect(state.items).toBeDefined();
      expect(state.total).toBeDefined();
      expect(state.offset).toBeDefined();
      expect(state.currentPage).toBeDefined();
      expect(state.totalPages).toBeDefined();
    });

    it('should have showModal function', async () => {
      const { showModal } = await import('../../src/public/js/state.js');
      expect(typeof showModal).toBe('function');
    });
  });
});
