import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import { initializeDatabase, getImportStatus } from './db/database';
import {
  browseRoute,
  calendarRoute,
  addTorrentToTorboxRoute,
  getLibraryRoute,
  getLibraryStatusRoute,
  imdbImportRoute,
  musicArtworkRoute,
  musicMetadataSearchRoute,
  musicRoute,
  musicTorrentDownloadRoute,
  musicTorrentSearchRoute,
  moviesRoute,
  showsRoute,
  streamTorboxTrackRoute,
  syncLibraryTorboxRoute,
  titleRoute,
  titleArtworkRoute,
  torrentSearchRoute,
  tvmazeShowRoute,
  triggerLibraryScanRoute,
  unifiedSearchRoute,
  usenetSearchRoute,
  addUsenetToTorboxRoute,
  downloadUsenetFileRoute
} from './routes/library.route';
import { getImdbImportProgress, importImdbDatasets, needsImdbImport } from './services/imdb/import.service';

const app = express();
const PORT = Number(process.env.PORT || 8066);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use('/vendor/puppertino', express.static(path.join(__dirname, '../node_modules/@codedgar/puppertino/dist/css')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', mode: process.env.TORBOX_API_KEY?.trim() ? 'torbox-integrated' : 'local-offline' });
});
app.get('/library', getLibraryRoute);
app.get('/library/status', getLibraryStatusRoute);
app.post('/library/scan', triggerLibraryScanRoute);
app.post('/library/sync', syncLibraryTorboxRoute);
app.post('/torbox/torrents', addTorrentToTorboxRoute);
app.get('/usenet/search', usenetSearchRoute);
app.post('/torbox/usenet', addUsenetToTorboxRoute);
app.get('/torbox/usenet/:usenetId/files/:fileId', downloadUsenetFileRoute);
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
app.get(['/', '/browse', '/movies', '/shows', '/torrents', '/local', '/calendar', '/title/:imdbId', '/tvmaze/:id'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start(): Promise<void> {
  await initializeDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Torbox Media Manager running on port ${PORT}`);
    console.log(`Mode: ${process.env.TORBOX_API_KEY?.trim() ? 'Torbox Integrated' : 'Local Offline'}`);
    console.log(`IMDb titles currently stored: startup import may add more`);
  });
  if (process.env.IMDB_AUTO_IMPORT !== 'false' && await needsImdbImport()) {
    console.info('Starting or resuming the IMDb dataset import in the background');
    void importImdbDatasets().catch((error: unknown) => {
      console.error('IMDb initial import failed:', error instanceof Error ? error.message : 'unknown error');
    });
  }
}

void start().catch((error: unknown) => {
  console.error('Application failed to start:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
