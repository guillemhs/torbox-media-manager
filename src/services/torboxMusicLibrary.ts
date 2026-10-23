const AUDIO_FILE = /\.(?:flac|mp3|m4a|aac|ogg|opus|wav|wma|alac|ape|wv|dsf|dff)$/i;
const VIDEO_FILE = /\.(?:avi|flv|m2ts|m4v|mkv|mov|mp4|mpg|mpeg|ts|webm|wmv|vob|3gp)$/i;
const INFO_HASH = /^[a-f0-9]{40}$/i;

export interface TorBoxMusicTrack {
  id: number;
  name: string;
  path: string;
  bytes: number | null;
}

export interface TorBoxMusicAlbum {
  hash: string;
  name: string;
  bytes: number | null;
  tracks: TorBoxMusicTrack[];
  downloadFinished: boolean;
  downloadState: string | null;
}

type TorBoxFile = {
  id?: unknown;
  name?: unknown;
  path?: unknown;
  size?: unknown;
  bytes?: unknown;
};

function validBytes(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Keep torrents that contain audio tracks and exclude video torrents with incidental audio. */
export function normalizeTorBoxMusicLibrary(items: unknown): TorBoxMusicAlbum[] {
  if (!Array.isArray(items)) return [];

  const albums: TorBoxMusicAlbum[] = [];
  for (const candidate of items) {
    if (!candidate || typeof candidate !== 'object') continue;

    const torrent = candidate as Record<string, unknown>;
    if (typeof torrent.hash !== 'string' || !INFO_HASH.test(torrent.hash)) continue;
    if (!Array.isArray(torrent.files)) continue;

    const files = torrent.files as TorBoxFile[];
    if (files.some((file) => typeof file?.name === 'string' && VIDEO_FILE.test(file.name))) continue;

    const tracks = files.flatMap((file): TorBoxMusicTrack[] => {
      if (typeof file?.name !== 'string' || !AUDIO_FILE.test(file.name)) return [];
      if (typeof file.id !== 'number' || !Number.isFinite(file.id)) return [];
      const filePath = typeof file.path === 'string' && file.path ? file.path : file.name;
      return [{
        id: file.id,
        name: file.name,
        path: filePath,
        bytes: validBytes(file.size ?? file.bytes)
      }];
    });

    if (tracks.length === 0) continue;
    const fileBytes = tracks.reduce((sum, track) => sum + (track.bytes ?? 0), 0);
    const torrentName = typeof torrent.name === 'string' && torrent.name.trim()
      ? torrent.name.trim()
      : 'Unnamed TorBox torrent';

    albums.push({
      hash: torrent.hash.toLowerCase(),
      name: torrentName,
      bytes: fileBytes > 0 ? fileBytes : validBytes(torrent.size),
      tracks,
      downloadFinished: torrent.download_finished === true,
      downloadState: typeof torrent.download_state === 'string' && torrent.download_state.trim()
        ? torrent.download_state.trim()
        : null
    });
  }

  return albums.sort((a, b) => a.name.localeCompare(b.name));
}
