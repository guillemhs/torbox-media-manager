export class TorboxApiError extends Error {
  constructor(public status: number, message: string, public responseBody?: unknown) {
    super(message);
    this.name = 'TorboxApiError';
  }
}

export interface TorboxEnvelope<T = unknown> {
  success: boolean;
  error: string | null;
  detail: string;
  data: T;
}

function requireApiKey(apiKey = process.env.TORBOX_API_KEY): string {
  if (!apiKey?.trim()) throw new TorboxApiError(503, 'TORBOX_API_KEY is not configured');
  return apiKey.trim();
}

async function torboxGet<T>(endpoint: string, apiKey: string, params: Record<string, string> = {}): Promise<TorboxEnvelope<T>> {
  const url = new URL(`https://api.torbox.app/v1/api/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000)
  });
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }

  if (!response.ok) {
    const detail = typeof body === 'object' && body !== null && 'detail' in body
      ? String(body.detail)
      : `TorBox returned HTTP ${response.status}`;
    throw new TorboxApiError(response.status, detail, body);
  }
  if (!body || typeof body !== 'object' || !('success' in body)) {
    throw new TorboxApiError(502, 'TorBox returned an unexpected response', body);
  }
  const envelope = body as TorboxEnvelope<T>;
  if (!envelope.success) {
    throw new TorboxApiError(502, envelope.detail || envelope.error || 'TorBox request failed', body);
  }
  return envelope;
}

export async function getTorrentList(
  apiKey = process.env.TORBOX_API_KEY,
  params: { bypass_cache?: boolean; offset?: number; limit?: number; id?: number } = {}
): Promise<TorboxEnvelope<unknown[] | Record<string, unknown>>> {
  const query: Record<string, string> = {
    bypass_cache: String(params.bypass_cache ?? true),
    _fresh: String(Date.now())
  };
  if (params.offset !== undefined) query.offset = String(params.offset);
  if (params.limit !== undefined) query.limit = String(params.limit);
  if (params.id !== undefined) query.id = String(params.id);
  return torboxGet('torrents/mylist', requireApiKey(apiKey), query);
}

export async function getTorboxUser(apiKey = process.env.TORBOX_API_KEY) {
  return torboxGet<Record<string, unknown>>('user/me', requireApiKey(apiKey));
}

export async function addTorrentToTorbox(
  magnet: string,
  options: { addOnlyIfCached?: boolean; name?: string } = {},
  apiKey = process.env.TORBOX_API_KEY
): Promise<TorboxEnvelope<{ hash?: string; torrent_id?: number; auth_id?: string }>> {
  const token = requireApiKey(apiKey);
  const form = new FormData();
  form.set('magnet', magnet);
  if (options.addOnlyIfCached) form.set('add_only_if_cached', 'true');
  if (options.name?.trim()) form.set('name', options.name.trim().slice(0, 200));

  const response = await fetch('https://api.torbox.app/v1/api/torrents/createtorrent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: form,
    signal: AbortSignal.timeout(20_000)
  });
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  if (!response.ok) {
    const detail = typeof body === 'object' && body !== null && 'detail' in body
      ? String(body.detail)
      : `TorBox returned HTTP ${response.status}`;
    throw new TorboxApiError(response.status, detail, body);
  }
  if (!body || typeof body !== 'object' || !('success' in body)) {
    throw new TorboxApiError(502, 'TorBox returned an unexpected response', body);
  }
  const envelope = body as TorboxEnvelope<{ hash?: string; torrent_id?: number; auth_id?: string }>;
  if (!envelope.success) throw new TorboxApiError(502, envelope.detail || envelope.error || 'TorBox rejected the torrent', body);
  return envelope;
}

export async function checkCachedTorrent(hash: string, apiKey = process.env.TORBOX_API_KEY) {
  if (!/^[a-f0-9]{40}$/i.test(hash)) throw new Error('hash must be a 40-character torrent info hash');
  return torboxGet<unknown>('torrents/checkcached', requireApiKey(apiKey), {
    hash,
    format: 'object',
    list_files: 'true'
  });
}

export async function requestTorrentDownload(
  torrentId: number,
  fileId: number,
  apiKey = process.env.TORBOX_API_KEY
): Promise<string> {
  const token = requireApiKey(apiKey);
  const url = new URL('https://api.torbox.app/v1/api/torrents/requestdl');
  url.searchParams.set('token', token);
  url.searchParams.set('torrent_id', String(torrentId));
  url.searchParams.set('file_id', String(fileId));
  url.searchParams.set('redirect', 'false');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000)
  });
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  if (!response.ok || !body || typeof body !== 'object' || !('success' in body) || body.success !== true) {
    const detail = typeof body === 'object' && body !== null && 'detail' in body
      ? String(body.detail)
      : `TorBox returned HTTP ${response.status}`;
    throw new TorboxApiError(response.ok ? 502 : response.status, detail, body);
  }
  const data = 'data' in body ? body.data : undefined;
  if (typeof data !== 'string') throw new TorboxApiError(502, 'TorBox did not return a download URL', body);
  return data;
}
