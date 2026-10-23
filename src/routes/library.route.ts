import { Request, Response } from 'express';
import { scanLocalMedia, syncTorboxCloud } from '../services/media.service';

// GET /library - View and manage library content
export const getLibrary = async (req: Request, res: Response) => {
  try {
    // Handle query param that could be string, string[], object, or undefined
    const apiKeyRaw = req.query.apiKey;
    let apiKey: string | undefined;
    
    if (Array.isArray(apiKeyRaw)) {
      apiKey = apiKeyRaw[0];
    } else if (typeof apiKeyRaw === 'string') {
      apiKey = apiKeyRaw;
    }
    
    const mode = apiKey ? 'torbox-integrated' : 'local-offline';

    if (apiKey) {
      // Torbox Integrated Mode - sync and scan cloud
      const torboxSync = await syncTorboxCloud(apiKey);
      const localScan = await scanLocalMedia();
      return res.json({
        mode: 'torbox-integrated',
        torboxCloud: torboxSync,
        localMedia: localScan,
        message: 'Library synced with Torbox cloud and local media library'
      });
    }

    // Local / Offline Mode (Default)
    const localScan = await scanLocalMedia();
    return res.json({
      mode: 'local-offline',
      localMedia: localScan,
      message: 'Library accessed in offline mode - Torbox API key required for cloud features'
    });
  } catch (error) {
    console.error('Error fetching library:', error);
    return res.status(500).json({ error: 'Failed to fetch library content' });
  }
};

// POST /library/scan - Trigger local media scan
export const triggerLibraryScan = async (req: Request, res: Response) => {
  try {
    const { path } = req.body;
    const scanned = await scanLocalMedia(path);
    return res.json({ success: true, scannedPath: path, items: scanned.items });
  } catch (error) {
    console.error('Error scanning library:', error);
    return res.status(500).json({ error: 'Failed to scan library' });
  }
};

// POST /library/sync - Sync with Torbox cloud (requires API key)
export const syncLibraryTorbox = async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: 'Torbox API key required for cloud sync' });
    }
    const syncResult = await syncTorboxCloud(apiKey);
    return res.json({ success: true, synced: syncResult });
  } catch (error) {
    console.error('Error syncing with Torbox:', error);
    return res.status(500).json({ error: 'Failed to sync with Torbox cloud' });
  }
};

export default { getLibrary, triggerLibraryScan, syncLibraryTorbox };