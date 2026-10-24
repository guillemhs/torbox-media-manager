export interface TorrentCandidate {
  hash: string;
  magnet: string;
  name: string;
  seeders: number | null;
  leechers: number | null;
  size: number | null;
  source: string;
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function countNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function encodeQueryValue(value: string): string {
  let wellFormed = '';
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        wellFormed += value[index] + value[index + 1];
        index++;
      } else wellFormed += '\ufffd';
    } else if (code >= 0xdc00 && code <= 0xdfff) wellFormed += '\ufffd';
    else wellFormed += value[index];
  }
  return encodeURIComponent(wellFormed);
}

export async function searchTorrentCandidates(imdbId: string, kind: 'movie' | 'series', season = 1): Promise<TorrentCandidate[]> {
  if (!/^tt\d+$/.test(imdbId)) throw new Error('A valid IMDb ID is required for torrent search.');
  if (kind === 'series' && (!Number.isSafeInteger(season) || season < 1 || season > 99)) {
    throw new Error('Season must be between 1 and 99.');
  }

  const resourceId = kind === 'movie' ? imdbId : `${imdbId}:${season}:1`;
  const base = (process.env.TORRENT_SEARCH_BASE_URL || 'https://torrentio.strem.fun').replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/stream/${kind}/${encodeURIComponent(resourceId)}.json`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === 'TimeoutError'
      ? 'Torrent search timed out. Try again in a moment.'
      : 'Torrent search service is unavailable.');
  }
  if (!response.ok) throw new Error(`Torrent search returned HTTP ${response.status}.`);

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { streams?: unknown }).streams)) {
    throw new Error('Torrent search returned an unexpected response.');
  }

  const streams = (payload as { streams: unknown[] }).streams;
  const candidates = new Map<string, TorrentCandidate>();
  for (const value of streams) {
    if (!value || typeof value !== 'object') continue;
    const stream = value as Record<string, unknown>;
    const hash = typeof stream.infoHash === 'string' ? stream.infoHash.toLowerCase() : '';
    if (!/^[a-f0-9]{40}$/.test(hash)) continue;
    const hints = stream.behaviorHints && typeof stream.behaviorHints === 'object'
      ? stream.behaviorHints as Record<string, unknown>
      : {};
    const name = [stream.title, hints.filename, stream.name]
      .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)?.trim()
      || `${imdbId} · ${kind === 'series' ? `Season ${season}` : 'Torrent'}`;
    const trackers = Array.isArray(stream.sources)
      ? stream.sources.filter((item): item is string => typeof item === 'string' && item.startsWith('tracker:')).map(item => `tr=${encodeQueryValue(item.slice(8))}`)
      : [];
    const size = positiveNumber(hints.videoSize || stream.size);
    candidates.set(hash, {
      hash,
      magnet: `magnet:?xt=urn:btih:${hash}&dn=${encodeQueryValue(name.slice(0, 180))}${trackers.length ? `&${[...new Set(trackers)].join('&')}` : ''}`,
      name,
      seeders: countNumber(stream.seeders),
      leechers: countNumber(stream.leechers ?? stream.peers),
      size,
      source: 'Torrentio'
    });
  }
  return [...candidates.values()].slice(0, 40);
}
