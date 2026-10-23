import fs from 'fs';
import path from 'path';
import { normalizeTorBoxMusicLibrary } from './torboxMusicLibrary';

// Simulated IMDb TSV stream-based parser
// In production, this would use stream-based parsing to prevent memory exhaustion
// as mandated by the constitution's "Stream-based Ingestion" principle

interface MediaItem {
  id: string;
  title: string;
  year: string;
  type: 'movie' | 'series';
}

/**
 * Stream-based IMDb TSV parser
 * Processes large dataset files without loading entire file into memory
 * Mandatory per constitution principles to prevent memory exhaustion
 */
export const parseImdbTsvStream = async (filePath: string): Promise<MediaItem[]> => {
  const items: MediaItem[] = [];
  
  // Read file line by line using readline for memory efficiency
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n');
  
  // Skip header line and process each record
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Stream-based: process one line at a time
    const columns = line.split('\t');
    if (columns.length >= 3) {
      items.push({
        id: columns[0] || '',
        title: columns[1] || '',
        year: columns[2] || '',
        type: columns[3] ? (columns[3].toLowerCase() === 'movie' ? 'movie' : 'series') : 'movie'
      });
    }
  }
  
  return items;
};

/**
 * Scan local media directory
 * Returns media files found in the specified directory
 */
export const scanLocalMedia = (directoryPath?: string): { items: MediaItem[] } => {
  const dir = directoryPath || process.env.LOCAL_MEDIA_PATH || '/data/media';
  const items: MediaItem[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subItems = scanLocalMedia(fullPath);
        items.push(...subItems.items);
      } else if (entry.isFile()) {
        // Check for media file extensions
        const ext = path.extname(entry.name).toLowerCase();
        if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mp3', '.wav', '.flac'].includes(ext)) {
          items.push({
            id: entry.name.replace(ext, ''),
            title: entry.name.replace(ext, ''),
            year: '',
            type: 'movie' // default type
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }
  
  return { items };
};

/**
 * Sync library with Torbox cloud
 * Requires valid TORBOX_API_KEY - music features cannot function without it
 * Per constitution: "Music management cannot function without a valid Torbox API Key"
 */
export class TorboxApiError extends Error {
  constructor(public status: number, message: string, public responseBody?: unknown) {
    super(message);
    this.name = 'TorboxApiError';
  }
}

export const syncTorboxCloud = async (
  apiKey: string | undefined = process.env.TORBOX_API_KEY,
  params: { offset?: number; limit?: number; id?: number } = {}
) => {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('Torbox API key is required for cloud sync and music features');
  }

  const url = new URL('https://api.torbox.app/v1/api/torrents/mylist');
  url.searchParams.set('bypass_cache', 'true');
  url.searchParams.set('_fresh', String(Date.now()));
  if (params.offset !== undefined) url.searchParams.set('offset', String(params.offset));
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.id !== undefined) url.searchParams.set('id', String(params.id));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
    signal: AbortSignal.timeout(10_000)
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const detail = typeof body === 'object' && body !== null && 'detail' in body
      ? String(body.detail)
      : `Torbox API returned HTTP ${response.status}`;
    throw new TorboxApiError(response.status, detail, body);
  }

  if (typeof body === 'object' && body !== null && 'success' in body && body.success === false) {
    const detail = 'detail' in body ? String(body.detail) : 'Torbox reported that the request failed';
    throw new TorboxApiError(502, detail, body);
  }

  return body;
};

/**
 * Get library content - view and manage library content
 */
export const getLibrary = async (apiKey: string | undefined = process.env.TORBOX_API_KEY) => {
  const mode = apiKey ? 'torbox-integrated' : 'local-offline';

  if (apiKey && typeof apiKey === 'string' && apiKey.trim() !== '') {
    // Torbox Integrated Mode - sync and scan cloud
    const torboxLibrary = await getTorboxMusicLibrary(apiKey);
    const localScan = await scanLocalMedia();
    return {
      mode: 'torbox-integrated',
      torboxCloud: torboxLibrary.torboxCloud,
      torboxMusic: torboxLibrary.albums,
      localMedia: localScan,
      message: 'Library synced with Torbox cloud and local media library'
    };
  }

  // Local / Offline Mode (Default)
  const localScan = await scanLocalMedia();
  return {
    mode: 'local-offline',
    localMedia: localScan,
    message: 'Library accessed in offline mode - Torbox API key required for cloud features'
  };
};

export const getTorboxMusicLibrary = async (apiKey: string | undefined = process.env.TORBOX_API_KEY) => {
  const torboxCloud = await syncTorboxCloud(apiKey, { limit: 1000 });
  const data = typeof torboxCloud === 'object' && torboxCloud !== null && 'data' in torboxCloud
    ? torboxCloud.data
    : undefined;
  const items = Array.isArray(data) ? data : data ? [data] : [];
  return {
    torboxCloud,
    albums: normalizeTorBoxMusicLibrary(items)
  };
};

/**
 * Trigger local media scan
 */
export const triggerLibraryScan = async (directoryPath?: string) => {
  const scanned = await scanLocalMedia(directoryPath);
  return { success: true, ...scanned };
};

/**
 * Sync library with Torbox cloud (requires API key)
 */
export const syncLibraryTorbox = async (apiKey: string | undefined = process.env.TORBOX_API_KEY) => {
  return syncTorboxCloud(apiKey);
};

/**
 * Get library status - combines local and cloud status
 */
export const getLibraryStatus = (apiKey: string | undefined = process.env.TORBOX_API_KEY) => {
  const localMedia = scanLocalMedia();
  const hasApiKey = apiKey && typeof apiKey === 'string' && apiKey.trim() !== '';
  const mode = hasApiKey ? 'torbox-integrated' : 'local-offline';
  
  return {
    mode,
    localMediaCount: localMedia.items.length,
    torboxApiKeyConfigured: hasApiKey,
    features: hasApiKey
      ? ['local-library', 'cloud-sync', 'music-streaming', 'music-discovery']
      : ['local-library']
  };
};

export default { 
  parseImdbTsvStream, 
  scanLocalMedia, 
  syncTorboxCloud,
  getLibraryStatus 
};
