import { RequestHandler } from 'express';
import {
  getLibrary,
  getLibraryStatus,
  getTorboxMusicLibrary,
  scanLocalMedia,
  syncLibraryTorbox,
  TorboxApiError
} from '../services/media.service';

const sendError = (res: Parameters<RequestHandler>[1], error: unknown) => {
  if (error instanceof TorboxApiError) {
    return res.status(error.status).json(error.responseBody ?? { error: error.message });
  }
  return res.status(502).json({
    error: error instanceof Error ? error.message : 'Torbox request failed'
  });
};

export const getLibraryRoute: RequestHandler = async (_req, res) => {
  try {
    return res.json(await getLibrary(process.env.TORBOX_API_KEY));
  } catch (error) {
    console.error('Error fetching library:', error);
    return sendError(res, error);
  }
};

export const getTorboxMusicLibraryRoute: RequestHandler = async (_req, res) => {
  const apiKey = process.env.TORBOX_API_KEY;
  if (!apiKey?.trim()) {
    return res.status(503).json({
      error: { code: 'torbox_not_configured', message: 'TORBOX_API_KEY is not configured on the server.' }
    });
  }

  try {
    const library = await getTorboxMusicLibrary(apiKey);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({
      albums: library.albums,
      totalAlbums: library.albums.length,
      totalTracks: library.albums.reduce((count, album) => count + album.tracks.length, 0)
    });
  } catch (error) {
    console.error('Error fetching Torbox music library:', error);
    return sendError(res, error);
  }
};

export const triggerLibraryScanRoute: RequestHandler = (req, res) => {
  const requestedPath = typeof req.body?.path === 'string' ? req.body.path : undefined;
  const scanned = scanLocalMedia(requestedPath);
  return res.json({ success: true, scannedPath: requestedPath, items: scanned.items });
};

export const syncLibraryTorboxRoute: RequestHandler = async (_req, res) => {
  const apiKey = process.env.TORBOX_API_KEY;
  if (!apiKey?.trim()) {
    return res.status(503).json({
      error: { code: 'torbox_not_configured', message: 'TORBOX_API_KEY is not configured on the server.' }
    });
  }

  try {
    return res.json({ success: true, synced: await syncLibraryTorbox(apiKey) });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getLibraryStatusRoute: RequestHandler = (_req, res) => {
  return res.json(getLibraryStatus(process.env.TORBOX_API_KEY));
};
