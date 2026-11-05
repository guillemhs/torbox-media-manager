import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import { initializeDatabase } from '../../src/db/database';

let app: express.Application;
let server: any;

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: true, limit: '32kb' }));

  const { calendarRoute: calendarR } = await import('../../src/routes/calendar');
  const { tvmazeShowRoute: tvmazeR } = await import('../../src/routes/calendar');

  app.get('/api/calendar', calendarR);
  app.get('/tvmaze/shows/:id', tvmazeR);

  await initializeDatabase();
  server = app.listen(0);
});

afterAll(async () => {
  if (server) await server.close();
});

describe('CALENDAR FUNCTIONALITY', () => {
  describe('GET /api/calendar - Daily Schedule', () => {
    it('should return TVMaze schedule for a specific date', async () => {
      const { getTvmazeSchedule } = await import('../../src/services/tvmaze/schedule.service');

      vi.mocked(getTvmazeSchedule).mockResolvedValue({
        episodes: [
          {
            id: 1,
            name: 'Pilot',
            season: 1,
            number: 1,
            airtime: '20:00',
            airstamp: '2026-11-05T20:00:00+00:00',
            summary: 'The pilot episode.',
            show: {
              name: 'Test Show',
              image: { medium: 'https://static.tvmaze.com/uploads/images/medium_1.jpg' },
              network: { name: 'Test Network' },
              webChannel: null,
            },
          },
          {
            id: 2,
            name: 'Episode 2',
            season: 1,
            number: 2,
            airtime: '21:00',
            airstamp: '2026-11-05T21:00:00+00:00',
            summary: 'The second episode.',
            show: {
              name: 'Test Show 2',
              image: { medium: 'https://static.tvmaze.com/uploads/images/medium_2.jpg' },
              network: { name: 'Test Network 2' },
              webChannel: null,
            },
          },
        ],
        cached: false,
        stale: false,
        fetchedAt: new Date().toISOString(),
      });

      const response = await app.get('/api/calendar?date=2026-11-05&country=US');

      expect(response.status).toBe(200);
      expect(response.body.episodes).toHaveLength(2);
      expect(response.body.episodes[0].name).toBe('Pilot');
      expect(response.body.episodes[0].show.name).toBe('Test Show');
      expect(response.body.cached).toBe(false);
      expect(response.body.stale).toBe(false);
    });

    it('should return empty episodes when TVMaze has no data', async () => {
      const { getTvmazeSchedule } = await import('../../src/services/tvmaze/schedule.service');

      vi.mocked(getTvmazeSchedule).mockResolvedValue({
        episodes: [],
        cached: false,
        stale: false,
        fetchedAt: new Date().toISOString(),
      });

      const response = await app.get('/api/calendar?date=2026-11-05&country=US');

      expect(response.status).toBe(200);
      expect(response.body.episodes).toHaveLength(0);
    });

    it('should return 400 for invalid date format', async () => {
      const response = await app.get('/api/calendar?date=invalid-date&country=US');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('date');
    });

    it('should return 400 for invalid country code', async () => {
      const response = await app.get('/api/calendar?date=2026-11-05&country=USA');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('country');
    });
  });

  describe('GET /api/calendar - Monthly Calendar', () => {
    it('should return monthly calendar when year and month are provided', async () => {
      const { getTvmazeMonthlyCalendar } = await import('../../src/services/tvmaze/schedule.service');

      vi.mocked(getTvmazeMonthlyCalendar).mockResolvedValue({
        year: 2026,
        month: 11,
        episodes: {},
        filter: 'popular',
        minRating: 7.0,
        limitPerDay: 50,
      });

      const response = await app.get('/api/calendar?year=2026&month=11&filter=popular&minRating=7.0&limitPerDay=50');

      expect(response.status).toBe(200);
      expect(response.body.year).toBe(2026);
      expect(response.body.month).toBe(11);
    });

    it('should return 400 for invalid month', async () => {
      const response = await app.get('/api/calendar?year=2026&month=13');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('month');
    });

    it('should return 400 for invalid year', async () => {
      const response = await app.get('/api/calendar?year=1999&month=11');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('year');
    });

    it('should return 400 for invalid minRating', async () => {
      const response = await app.get('/api/calendar?year=2026&month=11&minRating=15');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('minRating');
    });

    it('should return 400 for invalid limitPerDay', async () => {
      const response = await app.get('/api/calendar?year=2026&month=11&limitPerDay=300');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('limitPerDay');
    });
  });

  describe('GET /tvmaze/shows/:id', () => {
    it('should return TVMaze show details for a valid ID', async () => {
      const { getTvmazeShow } = await import('../../src/services/tvmaze/schedule.service');

      vi.mocked(getTvmazeShow).mockResolvedValue({
        id: 1,
        name: 'Test Show',
        image: { medium: 'https://static.tvmaze.com/uploads/images/medium_1.jpg', original: 'https://static.tvmaze.com/uploads/images/original_1.jpg' },
        summary: 'A test show.',
        status: 'Ended',
        premiered: '2020-01-01',
        _embedded: {
          seasons: [
            { id: 1, number: 1, name: 'Season 1' },
            { id: 2, number: 2, name: 'Season 2' },
          ],
        },
      });

      const response = await app.get('/tvmaze/shows/1');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(1);
      expect(response.body.name).toBe('Test Show');
      expect(response.body.status).toBe('Ended');
    });

    it('should return 400 for invalid show ID', async () => {
      const response = await app.get('/tvmaze/shows/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('TVMaze show ID');
    });

    it('should return 400 for negative show ID', async () => {
      const response = await app.get('/tvmaze/shows/-1');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('TVMaze show ID');
    });

    it('should return 502 when TVMaze API fails', async () => {
      const { getTvmazeShow } = await import('../../src/services/tvmaze/schedule.service');

      vi.mocked(getTvmazeShow).mockRejectedValue(new Error('TVMaze API unavailable'));

      const response = await app.get('/tvmaze/shows/1');

      expect(response.status).toBe(502);
      expect(response.body.error).toContain('TVMaze show lookup failed');
    });
  });
});
