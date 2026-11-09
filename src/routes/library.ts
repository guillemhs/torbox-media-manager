import type { RequestHandler } from 'express';
import { getLibraryStatus, scanLocalMedia } from '../services/media.service';
import { addTorrentToTorbox, checkCachedTorrent, createWebDownload, getTorrentList, getUsenetList, requestTorrentDownload, requestUsenetDownload, TorboxApiError } from '../services/torbox/client';
import { buildTempDownloadService } from '../services/temp-downloads';
import { normalizeTorBoxMusicLibrary } from '../services/torbox/musicLibrary';
import { fetchUsenetNzb, searchUsenet } from '../services/usenetSearch';
import { pagination, sendError } from './routeUtils';

let tempDownloadServiceInstance: import('../services/temp-downloads').TempDownloadService | undefined;

function getTempDownloadService(): import('../services/temp-downloads').TempDownloadService {
  if (!tempDownloadServiceInstance) {
    tempDownloadServiceInstance = buildTempDownloadService();
  }
  return tempDownloadServiceInstance;
}

export const getLibraryRoute: RequestHandler = async (req, res) => {
  try {
    const local = scanLocalMedia();
    const page = pagination(req.query as Record<string, unknown>, 1000);
    const result: Record<string, unknown> = {
      mode: process.env.TORBOX_API_KEY?.trim() ? 'torbox-integrated' : 'local-offline',
      localMedia: { ...local, total: local.items.length, items: local.items.slice(page.offset, page.offset + page.limit), limit: page.limit, offset: page.offset },
      message: 'Local files are scanned from LOCAL_MEDIA_PATH.',
    };
    if (process.env.TORBOX_API_KEY?.trim()) {
      const [torrentResponse, usenetResponse] = await Promise.allSettled([
        getTorrentList(undefined, { limit: page.limit, offset: page.offset }),
        getUsenetList(undefined, { limit: page.limit, offset: page.offset }),
      ]);
      if (torrentResponse.status === 'rejected') throw torrentResponse.reason;
      const torrentItems = Array.isArray(torrentResponse.value.data) ? torrentResponse.value.data : [torrentResponse.value.data];
      const usenetItems = usenetResponse.status === 'fulfilled' ? (Array.isArray(usenetResponse.value.data) ? usenetResponse.value.data : [usenetResponse.value.data]) : [];
      result.torbox = [...torrentItems, ...usenetItems];
      result.music = normalizeTorBoxMusicLibrary(torrentItems);
      if (usenetResponse.status === 'rejected') result.usenetError = usenetResponse.reason instanceof Error ? usenetResponse.reason.message : 'TorBox Usenet library is unavailable.';
    }
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const usenetSearchRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const query = scalar(req.query.q)?.trim() || '';
  const sourceValue = scalar(req.query.source) || 'all';
  if (query.length < 2 || query.length > 180) return res.status(400).json({ error: 'Usenet search must be between 2 and 180 characters.' });
  if (!['all', 'NZBIndex', 'Binsearch', 'NZBGeek'].includes(sourceValue)) return res.status(400).json({ error: 'source must be all, NZBIndex, Binsearch, or NZBGeek.' });
  const page = pagination(req.query as Record<string, unknown>);
  try {
    const data = await searchUsenet(query, sourceValue as 'all' | 'NZBIndex' | 'Binsearch' | 'NZBGeek', page.limit, page.offset);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json(data);
  } catch (error) { return sendError(res, error); }
};

export const addUsenetToTorboxRoute: RequestHandler = async (req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) return res.status(503).json({ error: 'TORBOX_API_KEY is not configured.' });
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const source = scalar(req.body?.source);
  const id = scalar(req.body?.id)?.trim() || '';
  const requestedName = scalar(req.body?.name)?.trim() || '';
  const mediaName = /"([^"]+\.(?:mp3|mp4|m4v|mkv|avi|mov|wmv|flac|m4a|ogg|wav|ts|m2ts|webm))"/i.exec(requestedName)?.[1];
  const name = (mediaName || requestedName).replace(/^\[\d+\/\d+\]\s*[-–]?\s*/, '').replace(/\s+yEnc\s+\d+.*$/i, '').trim().slice(0, 200);
  if ((source !== 'NZBIndex' && source !== 'Binsearch' && source !== 'NZBGeek') || !id) return res.status(400).json({ error: 'A valid NZB source and result ID are required.' });
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  let tempPath: string | undefined;
  let service: import('../services/temp-downloads').TempDownloadService | undefined;
  let token: string | undefined;
  try {
    // Fetch the NZB from the indexer
    const nzb = await fetchUsenetNzb(source, id);

    // Save NZB to a temp file so we can upload it as a regular file POST.
    // This bypasses TorBox's blocked createusenetdownload endpoint.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'torbox-usenet-'));
    tempPath = path.join(tmpDir, `${name || 'usenet-download'}.nzb`);
    fs.writeFileSync(tempPath, nzb);

    console.log('[USENET-PIPELINE] Registering temp download URL for NZB', { source, id, name, tempPath, timestamp: new Date().toISOString() });
    service = getTempDownloadService();
    const { token: regToken, url } = await service.register({
      filePath: tempPath,
      fileName: `${name || 'usenet-download'}.nzb`,
      ttlMs: 30 * 60 * 1000,
    });
    token = regToken;

    console.log('[USENET-PIPELINE] Temp download URL registered', { source, id, name, url, token, timestamp: new Date().toISOString() });

    console.log('[USENET-PIPELINE] Triggering TorBox Web Download', { source, id, name, url, timestamp: new Date().toISOString() });
    const result = await createWebDownload(url, {
      name: `${name || 'usenet-download'}.nzb`,
    });

    // Mark the temp download as downloaded (TorBox has pulled it)
    await service.markDownloaded(token);

    console.log('[USENET-PIPELINE] TorBox Web Download confirmed', { source, id, name, result, timestamp: new Date().toISOString() });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ detail: result.detail, usenet: result.data });
  } catch (error) {
    if (service && token) {
      try { await service.markFailed(token, error instanceof Error ? error.message : String(error)); } catch { /* ignore */ }
    }
    return sendError(res, error);
  } finally {
    // Mandatory cleanup: remove the temp NZB file after upload
    if (tempPath) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      try { fs.rmdirSync(path.dirname(tempPath)); } catch { /* ignore */ }
    }
    if (service && token) {
      try { await service.cleanup(token); } catch { /* ignore */ }
    }
  }
};

export const downloadUsenetFileRoute: RequestHandler = async (req, res) => {
  const usenetId = req.params.usenetId;
  const fileId = req.params.fileId;
  if (!/^[\w-]{1,100}$/.test(usenetId) || !/^\d{1,20}$/.test(fileId)) return res.status(400).json({ error: 'Usenet download and file IDs are invalid.' });
  try { return res.redirect(302, await requestUsenetDownload(usenetId, fileId)); }
  catch (error) { return sendError(res, error); }
};

export const streamTorboxTrackRoute: RequestHandler = async (req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) return res.status(503).json({ error: 'TORBOX_API_KEY is required for TorBox streaming.' });
  const torrentId = Number(req.params.torrentId);
  const fileId = Number(req.params.fileId);
  if (!Number.isSafeInteger(torrentId) || torrentId < 1 || !Number.isSafeInteger(fileId) || fileId < 0) {
    return res.status(400).json({ error: 'torrentId and fileId must be valid non-negative integers.' });
  }
  try {
    const downloadUrl = await requestTorrentDownload(torrentId, fileId);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.redirect(302, downloadUrl);
  } catch (error) {
    return sendError(res, error);
  }
};

export const triggerLibraryScanRoute: RequestHandler = (_req, res) => res.json({ success: true, ...scanLocalMedia() });

export const syncLibraryTorboxRoute: RequestHandler = async (_req, res) => {
  if (!process.env.TORBOX_API_KEY?.trim()) return res.status(503).json({ error: 'TORBOX_API_KEY is not configured.' });
  try { return res.json(await getTorrentList(undefined, { bypass_cache: true, limit: 1000 })); }
  catch (error) { return sendError(res, error); }
};

export const getLibraryStatusRoute: RequestHandler = (_req, res) => res.json(getLibraryStatus());
