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
  getTorboxMusicLibraryRoute,
  imdbImportRoute,
  musicArtworkRoute,
  musicMetadataSearchRoute,
  recentMusicReleasesRoute,
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
  usenetSearchRoute,
  addUsenetToTorboxRoute,
  downloadUsenetFileRoute
} from './routes/library.route';
import { getImdbImportProgress, importImdbDatasets, needsImdbImport } from './services/imdb/import.service';

const app = express();
const PORT = Number(process.env.PORT || 6666);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use('/vendor/puppertino', express.static(path.join(__dirname, '../node_modules/@codedgar/puppertino/dist/css')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', mode: process.env.TORBOX_API_KEY?.trim() ? 'torbox-integrated' : 'local-offline' });
});
app.get('/library', getLibraryRoute);
app.get('/library/music', getTorboxMusicLibraryRoute);
app.get('/library/status', getLibraryStatusRoute);
app.post('/library/scan', triggerLibraryScanRoute);
app.post('/library/sync', syncLibraryTorboxRoute);
app.post('/torbox/torrents', addTorrentToTorboxRoute);
app.get('/usenet/search', usenetSearchRoute);
app.post('/torbox/usenet', addUsenetToTorboxRoute);
app.get('/torbox/usenet/:usenetId/files/:fileId', downloadUsenetFileRoute);
app.get('/torrents/search', torrentSearchRoute);
app.get('/torrents/download/:token', musicTorrentDownloadRoute);
app.get('/movies', moviesRoute);
app.get('/movies/:imdbId', titleRoute);
app.get('/shows', showsRoute);
app.get('/shows/:imdbId', titleRoute);
app.get('/browse', browseRoute);
app.get('/calendar', calendarRoute);
app.get('/tvmaze/shows/:id', tvmazeShowRoute);
app.get('/artwork/:imdbId', titleArtworkRoute);
app.get('/music', getTorboxMusicLibraryRoute);
app.get('/music/search', musicMetadataSearchRoute);
app.get('/music/recent', recentMusicReleasesRoute);
app.get('/music/torrents/search', musicTorrentSearchRoute);
app.get('/music/torrents/download/:token', musicTorrentDownloadRoute);
app.get('/music/artwork', musicArtworkRoute);
app.get('/music/:torrentId/:fileId/stream', streamTorboxTrackRoute);
app.post('/admin/imdb/import', imdbImportRoute);
app.get('/admin/imdb/status', async (_req, res) => {
  try {
    const [datasets, progress] = await Promise.all([getImportStatus(), Promise.resolve(getImdbImportProgress())]);
    const basics = datasets.find(dataset => dataset.dataset === 'title.basics.tsv.gz');
    const titles = basics?.importedRows ?? (progress.dataset === 'title.basics.tsv.gz' ? progress.importedRows : 0);
    res.json({ titles, datasets, progress });
  }
  catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Database unavailable' }); }
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
