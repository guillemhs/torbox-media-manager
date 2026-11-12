import type { RequestHandler } from 'express';
import { getTvmazeSchedule, getTvmazeShow, getTvmazeMonthlyCalendar } from '../services/tvmaze/schedule.service';
import { sendError, scalar } from './routeUtils';

export const calendarRoute: RequestHandler = async (req, res) => {
  const year = scalar(req.query.year);
  const month = scalar(req.query.month);

  if (year && month) {
    const yearNum = Number(year);
    const monthNum = Number(month);
    if (!Number.isInteger(yearNum) || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'year and month must be valid integers (month 1-12)' });
    }
    try {
      const filter = scalar(req.query.filter) === 'all' ? 'all' : 'popular';
      const minRating = scalar(req.query.minRating) ? Number(scalar(req.query.minRating)) : 7.0;
      const limitPerDay = scalar(req.query.limitPerDay) ? Number(scalar(req.query.limitPerDay)) : 50;
      if (!Number.isFinite(minRating) || minRating < 0 || minRating > 10) {
        return res.status(400).json({ error: 'minRating must be a number between 0 and 10' });
      }
      if (!Number.isInteger(limitPerDay) || limitPerDay < 1 || limitPerDay > 200) {
        return res.status(400).json({ error: 'limitPerDay must be an integer between 1 and 200' });
      }
      return res.json(await getTvmazeMonthlyCalendar({ year: yearNum, month: monthNum, filter, minRating, limitPerDay }));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Monthly calendar request failed' });
    }
  }

  const date = scalar(req.query.date) || new Date().toISOString().slice(0, 10);
  const country = scalar(req.query.country);
  // Default to web schedule (streaming platforms: Netflix, Apple TV+, Prime Video, etc.)
  const web = scalar(req.query.type) !== 'broadcast';
  try { return res.json(await getTvmazeSchedule({ date, country, web })); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'TVMaze schedule request failed' }); }
};

export const tvmazeShowRoute: RequestHandler = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'TVMaze show ID must be a positive integer.' });
  try {
    const show = await getTvmazeShow(id);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.json(show);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'TVMaze show lookup failed.' });
  }
};
