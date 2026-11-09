import type { RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { buildTempDownloadService, TempDownloadService } from '../services/temp-downloads';
import { sendError } from './routeUtils';

let serviceInstance: TempDownloadService | undefined;

function getService(): TempDownloadService {
  if (!serviceInstance) {
    serviceInstance = buildTempDownloadService();
  }
  return serviceInstance;
}

/** GET /api/temp-downloads/:token - Serve a locally assembled file via secure token. */
export const tempDownloadRoute: RequestHandler = async (req, res) => {
  const token = req.params.token;
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid download token.' });
  }

  try {
    const service = getService();
    const filePath = await service.getFilePath(token);
    const fileName = await service.getFileName(token);

    if (!filePath || !fileName) {
      return res.status(404).json({ error: 'Download not found, expired, or unavailable.' });
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(404).json({ error: 'Download file is not available.' });
    }

    // Set headers for secure file delivery
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Download-Token', token);

    // Stream the file
    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => {
      if (!res.headersSent) {
        return sendError(res, error);
      }
      res.destroy();
    });

    stream.pipe(res);

    // Mark as downloaded once the stream finishes
    stream.on('end', () => {
      void service.markDownloaded(token).catch((err) => {
        console.error('[TEMP-DOWNLOADS] Failed to mark download:', err);
      });
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** DELETE /api/temp-downloads/:token - Manually cleanup a temp download. */
export const tempDownloadCleanupRoute: RequestHandler = async (req, res) => {
  const token = req.params.token;
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid download token.' });
  }

  try {
    const service = getService();
    await service.cleanup(token);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ status: 'cleaned_up', token });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/temp-downloads - List all temp downloads (admin). */
export const tempDownloadListRoute: RequestHandler = async (_req, res) => {
  try {
    const service = getService();
    const downloads = await service.list();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ downloads });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /api/temp-downloads/cleanup-expired - Clean up expired downloads. */
export const tempDownloadCleanupExpiredRoute: RequestHandler = async (_req, res) => {
  try {
    const service = getService();
    const cleaned = await service.cleanupExpired();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ status: 'ok', cleaned });
  } catch (error) {
    return sendError(res, error);
  }
};
