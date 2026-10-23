import fs from 'node:fs';
import path from 'node:path';

export interface MediaItem {
  id: string;
  title: string;
  path: string;
  extension: string;
  type: 'movie' | 'series' | 'music';
  bytes: number;
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpeg', '.mpg', '.ts']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wma', '.alac', '.ape']);

/** Iterative local scan: missing mounts return an empty result and deep trees do not recurse. */
export function scanLocalMedia(directoryPath = process.env.LOCAL_MEDIA_PATH || '/data/media') {
  const items: MediaItem[] = [];
  const pending = [path.resolve(directoryPath)];
  let scannedDirectories = 0;
  let errors = 0;

  while (pending.length) {
    const directory = pending.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
      scannedDirectories++;
    } catch {
      errors++;
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name).toLowerCase();
        const type = VIDEO_EXTENSIONS.has(extension) ? 'movie' : AUDIO_EXTENSIONS.has(extension) ? 'music' : null;
        if (!type) continue;
        try {
          const stat = fs.statSync(fullPath);
          const title = path.basename(entry.name, extension);
          items.push({ id: fullPath, title, path: fullPath, extension, type, bytes: stat.size });
        } catch { errors++; }
      }
    }
  }
  items.sort((a, b) => a.title.localeCompare(b.title));
  return { items, scannedDirectories, errors, scannedPath: path.resolve(directoryPath) };
}

export function getLibraryStatus(apiKey = process.env.TORBOX_API_KEY) {
  const local = scanLocalMedia();
  const configured = Boolean(apiKey?.trim());
  return {
    mode: configured ? 'torbox-integrated' : 'local-offline',
    localMediaCount: local.items.length,
    torboxApiKeyConfigured: configured,
    features: configured
      ? ['local-library', 'imdb-catalog', 'tvmaze-calendar', 'torbox-cloud', 'torbox-music']
      : ['local-library', 'imdb-catalog', 'tvmaze-calendar']
  };
}
