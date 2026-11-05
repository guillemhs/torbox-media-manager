import type { RequestHandler } from 'express';
import { countTitles } from '../db/database';
import { importImdbDatasets } from '../services/imdb/import.service';
import { sendError } from './routeUtils';

let importPromise: Promise<unknown> | undefined;

export const imdbImportRoute: RequestHandler = async (_req, res) => {
  if (importPromise) return res.status(202).json({ status: 'running' });
  importPromise = importImdbDatasets()
    .catch((error: unknown) => { console.error('IMDb import failed:', error instanceof Error ? error.message : 'unknown error'); })
    .finally(() => { importPromise = undefined; });
  try { return res.status(202).json({ status: 'started', titlesBeforeImport: await countTitles() }); }
  catch (error) { return sendError(res, error); }
};
