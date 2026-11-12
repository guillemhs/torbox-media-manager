import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import { initializeDatabase, getImportStatus } from './db/database';
import {
  getLibraryRoute,
  usenetSearchRoute,
  addUsenetToTorboxRoute,
  deleteTorrentRoute,
  downloadUsenetFileRoute,
  streamTorboxTrackRoute,
  triggerLibraryScanRoute,
  syncLibraryTorboxRoute,
  getLibraryStatusRoute,
} from './routes/library';
import {
  addTorrentToTorboxRoute,
  torrentSearchRoute,
} from './routes/torrent';
import {
  usenetPipelineSearchRoute,
  usenetPipelineRunRoute,
  usenetPipelineStatusRoute,
  usenetPipelineJobsRoute,
  usenetPipelineCleanupRoute,
} from './routes/usenet-pipeline';
import {
  tempDownloadRoute,
  tempDownloadCleanupRoute,
  tempDownloadListRoute,
  tempDownloadCleanupExpiredRoute,
} from './routes/temp-downloads';
import {
  musicMetadataSearchRoute,
  musicTorrentSearchRoute,
  musicRoute,
  musicDetailRoute,
  musicTorrentDownloadRoute,
  musicArtworkRoute,
} from './routes/music';
import {
  moviesRoute,
  showsRoute,
  browseRoute,
  titleRoute,
  titleArtworkRoute,
} from './routes/catalog';
import { unifiedSearchRoute } from './routes/search';
import { calendarRoute, tvmazeShowRoute } from './routes/calendar';
import { imdbImportRoute } from './routes/import';
import { getImdbImportProgress, importImdbDatasets, needsImdbImport } from './services/imdb/import.service';

const app = express();
const PORT = Number(process.env.PORT || 8066);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use('/vendor/bootstrap/css', express.static(path.join(__dirname, '../node_modules/bootstrap/dist/css')));
app.use('/vendor/bootstrap/js', express.static(path.join(__dirname, '../node_modules/bootstrap/dist/js')));
app.use(express.static(path.join(__dirname, 'public')));

// Browser navigations (Accept: text/html) to UI routes get the SPA; XHR/fetch
// calls (Accept: */*) fall through to the JSON routes below — /library is both
// a UI route and an API endpoint, so they must be disambiguated by Accept.
const SPA_PATHS = ['/', '/browse', '/movies', '/shows', '/music', '/library', '/calendar'];
app.use((req, res, next) => {
  if (req.method === 'GET' && SPA_PATHS.includes(req.path) && (req.headers.accept || '').includes('text/html')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', mode: process.env.TORBOX_API_KEY?.trim() ? 'torbox-integrated' : 'local-offline' });
});
app.get('/library', getLibraryRoute);
app.get('/library/status', getLibraryStatusRoute);
app.delete('/library/torrent/:torrentId', deleteTorrentRoute);
app.post('/library/scan', triggerLibraryScanRoute);
app.post('/library/sync', syncLibraryTorboxRoute);
app.post('/torbox/torrents', addTorrentToTorboxRoute);
app.get('/usenet/search', usenetSearchRoute);
app.post('/torbox/usenet', addUsenetToTorboxRoute);
app.get('/torbox/usenet/:usenetId/files/:fileId', downloadUsenetFileRoute);
app.post('/usenet/pipeline/search', usenetPipelineSearchRoute);
app.post('/usenet/pipeline/run', usenetPipelineRunRoute);
app.get('/usenet/pipeline/status/:jobId', usenetPipelineStatusRoute);
app.get('/usenet/pipeline/jobs', usenetPipelineJobsRoute);
app.post('/usenet/pipeline/cleanup/:jobId', usenetPipelineCleanupRoute);
app.get('/api/temp-downloads/:token', tempDownloadRoute);
app.delete('/api/temp-downloads/:token', tempDownloadCleanupRoute);
app.get('/api/temp-downloads', tempDownloadListRoute);
app.post('/api/temp-downloads/cleanup-expired', tempDownloadCleanupExpiredRoute);
app.get('/library/torrents/search', torrentSearchRoute);
app.get('/torrents/search', (req, res) => res.redirect(301, '/library/torrents/search' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')));
app.get('/torrents/download/:token', musicTorrentDownloadRoute);
app.get('/api/movies', moviesRoute);
app.get('/api/movies/:imdbId', titleRoute);
app.get('/api/shows', showsRoute);
app.get('/api/shows/:imdbId', titleRoute);
app.get('/api/browse', browseRoute);
app.get('/api/search', unifiedSearchRoute);
app.get('/api/calendar', calendarRoute);
app.get('/tvmaze/shows/:id', tvmazeShowRoute);
app.get('/artwork/:imdbId', titleArtworkRoute);
app.get('/api/music', musicRoute);
app.get('/api/music/:id', musicDetailRoute);
app.get('/music/search', musicMetadataSearchRoute);
app.get('/music/torrents/search', musicTorrentSearchRoute);
app.get('/music/torrents/download/:token', musicTorrentDownloadRoute);
app.get('/music/artwork', musicArtworkRoute);
app.get('/music/:torrentId/:fileId/stream', streamTorboxTrackRoute);
app.post('/admin/imdb/import', imdbImportRoute);
app.get('/admin/imdb/status', async (_req, res) => {
  try {
    const [datasets, progress] = await Promise.all([getImportStatus(), Promise.resolve(getImdbImportProgress())]);
    // Normalize property names: PostgreSQL lowercases unquoted aliases (importedrows vs importedRows)
    const normalized = datasets.map(row => ({
      dataset: row.dataset,
      completedAt: row.completedAt ?? row.completedat,
      importedRows: row.importedRows ?? row.importedrows
    }));
    const basics = normalized.find(dataset => dataset.dataset === 'title.basics.tsv.gz');
    const titles = basics?.importedRows ?? (progress.dataset === 'title.basics.tsv.gz' ? progress.importedRows : 0);
    res.json({ titles, datasets: normalized, progress });
  }
  catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Database unavailable' }); }
});

// Serve the SPA for its real, bookmarkable URLs. API endpoints live under
// /api where a UI route would otherwise have the same path.
app.get(['/', '/browse', '/movies', '/shows', '/music', '/library', '/calendar', '/title/:imdbId', '/tvmaze/:id', '/music/release/:id'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logError(message: string): void {
  console.error(`[${new Date().toISOString()}] ${message}`);
}

async function start(): Promise<void> {
  await initializeDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    log(`Torbox Media Manager running on port ${PORT}`);
    log(`Mode: ${process.env.TORBOX_API_KEY?.trim() ? 'Torbox Integrated' : 'Local Offline'}`);
    log(`IMDb titles currently stored: startup import may add more`);
    log(`Prowlarr/Torznab URL: ${process.env.TORZNAB_URL?.trim() || '(not configured)'}`);
    log(`Prowlarr API key configured: ${Boolean(process.env.TORZNAB_API_KEY?.trim())}`);
  });
  if (process.env.IMDB_AUTO_IMPORT !== 'false' && await needsImdbImport()) {
    log('Starting or resuming the IMDb dataset import in the background');
    void importImdbDatasets().catch((error: unknown) => {
      logError('IMDb initial import failed:' + (error instanceof Error ? error.message : ' unknown error'));
    });
  }
}

void start().catch((error: unknown) => {
  logError('Application failed to start:' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
