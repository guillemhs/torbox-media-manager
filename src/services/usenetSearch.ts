export interface UsenetCandidate {
  id: string;
  name: string;
  size?: number;
  posted?: number;
  complete?: boolean;
  groups?: string[];
  source: 'NZBIndex' | 'Binsearch' | 'NZBGeek';
}

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

async function readResponse(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`Indexer returned HTTP ${response.status}`);
  return response.text();
}

async function searchNzbIndex(query: string, limit = 50, offset = 0): Promise<UsenetCandidate[]> {
  const url = new URL('https://api.nzbindex.com/api/search');
  url.searchParams.set('q', query);
  url.searchParams.set('max', String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set('complete', '1');
  const payload = JSON.parse(await readResponse(await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) }))) as {
    data?: { content?: Array<Record<string, unknown>> }; error?: boolean; errorMessage?: string;
  };
  if (payload.error) throw new Error(payload.errorMessage || 'NZBIndex search failed');
  return (payload.data?.content || []).flatMap(item => {
    const id = text(item.id);
    if (!id) return [];
    return [{ id, name: text(item.name) || 'Unnamed NZB', size: Number(item.size) || undefined,
      posted: Number(item.posted) || undefined, complete: item.complete === true,
      groups: Array.isArray(item.groups) ? item.groups.filter((group): group is string => typeof group === 'string') : [], source: 'NZBIndex' as const }];
  }).slice(offset, offset + limit);
}

async function searchBinsearch(query: string, limit = 50, offset = 0): Promise<UsenetCandidate[]> {
  const url = new URL('https://www.binsearch.info/');
  url.searchParams.set('q', query);
  url.searchParams.set('max', String(Math.min(200, Math.max(1, limit))));
  const html = await readResponse(await fetch(url, { headers: { 'User-Agent': 'TorBoxMediaManager/1.0 (+self-hosted media indexer search)', Accept: 'text/html' }, signal: AbortSignal.timeout(30_000) }));
  // Binsearch exposes selected article identifiers as checkbox values. Keep parsing
  // deliberately defensive because the public HTML is not a versioned API.
  const candidates: UsenetCandidate[] = [];
  const checkbox = /<input\b[^>]*type=["']?checkbox["']?[^>]*>/gi;
  for (const match of html.matchAll(checkbox)) {
    const tag = match[0];
    const value = /\bvalue=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!value || value.length > 500 || /^(?:on|off)$/i.test(value)) continue;
    const before = html.slice(Math.max(0, (match.index || 0) - 1600), match.index || 0);
    const row = /<(?:tr|li)\b[^>]*>([\s\S]*?)$/i.exec(before)?.[1] || before.slice(-900);
    const name = row.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|lt|gt);/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name || candidates.some(candidate => candidate.id === value)) continue;
    candidates.push({ id: value, name: name.slice(-240), source: 'Binsearch' });
    if (candidates.length >= offset + limit) break;
  }
  return candidates.slice(offset, offset + limit);
}

/**
 * Search NZBGeek via its Newznab API and map results to UsenetCandidate.
 * Requires NZBGEEK_API_HOST and NZBGEEK_API_KEY environment variables.
 * Dynamic IP resilience: logs the whitelist IP reference on every client build.
 */
async function searchNzbgeek(query: string, limit = 50, offset = 0): Promise<UsenetCandidate[]> {
  const { NzbgeekClient } = await import('./nzbgeek');
  const client = new NzbgeekClient({
    host: process.env.NZBGEEK_API_HOST?.trim() || 'https://api.nzbgeek.info/',
    apiKey: process.env.NZBGEEK_API_KEY?.trim() || '',
    whitelistIp: process.env.NZBGEEK_WHITELIST_IP?.trim() || undefined,
  });
  client.logWhitelistReference();

  if (!client['apiKey']) {
    throw new Error('NZBGEEK_API_KEY is not configured. Set NZBGEEK_API_KEY in .env.');
  }

  const response = await client.search(query, {
    category: undefined,
    limit,
    offset,
    extended: true,
  });

  return response.results.map(item => ({
    id: item.id,
    name: item.title,
    size: item.size,
    posted: item.posted,
    complete: item.complete,
    groups: item.groups,
    source: 'NZBGeek' as const,
  }));
}

export async function searchUsenet(query: string, source: 'all' | 'NZBIndex' | 'Binsearch' | 'NZBGeek', limit = 50, offset = 0) {
  const sources = source === 'all' ? ['NZBIndex', 'Binsearch', 'NZBGeek'] as const : [source] as const;
  const results = await Promise.allSettled(sources.map(name => {
    if (name === 'NZBIndex') return searchNzbIndex(query, limit, offset);
    if (name === 'Binsearch') return searchBinsearch(query, limit, offset);
    return searchNzbgeek(query, limit, offset);
  }));
  const candidates = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const warnings = results.flatMap((result, index) => result.status === 'rejected'
    ? [`${sources[index]}: ${result.reason instanceof Error ? result.reason.message : 'search failed'}`] : []);
  console.warn('[Usenet] search response:', {
    source,
    query,
    nzbIndexCount: results[0]?.status === 'fulfilled' ? results[0].value.length : 0,
    binsearchCount: results[1]?.status === 'fulfilled' ? results[1].value.length : 0,
    nzbgeekCount: results[2]?.status === 'fulfilled' ? results[2].value.length : 0,
    warnings
  });
  return { candidates: candidates.slice(offset, offset + limit), warnings, configured: { NZBIndex: true, Binsearch: true, NZBGeek: Boolean(process.env.NZBGEEK_API_KEY?.trim()) } };
}

export async function fetchUsenetNzb(source: 'NZBIndex' | 'Binsearch' | 'NZBGeek', id: string): Promise<Buffer> {
  if (source === 'NZBGeek') {
    const { NzbgeekClient } = await import('./nzbgeek');
    const client = new NzbgeekClient({
      host: process.env.NZBGEEK_API_HOST?.trim() || 'https://api.nzbgeek.info/',
      apiKey: process.env.NZBGEEK_API_KEY?.trim() || '',
      whitelistIp: process.env.NZBGEEK_WHITELIST_IP?.trim() || undefined,
    });
    client.logWhitelistReference();
    // NZBGeek IDs may be full URLs (e.g. https://nzbgeek.info/geekseek.php?guid=XXXX)
    // Extract the guid parameter if present, otherwise use the id as-is.
    let nzbId = id;
    try {
      const url = new URL(id);
      const guid = url.searchParams.get('guid');
      if (guid) nzbId = guid;
    } catch {
      // Not a URL, use as-is
    }
    return client.downloadNzb(nzbId);
  }

  let url: URL;
  if (source === 'NZBIndex') {
    if (!/^[a-f\d-]{36}$/i.test(id)) throw new Error('Invalid NZBIndex result ID');
    url = new URL(`https://api.nzbindex.com/api/download/${encodeURIComponent(id)}.nzb`);
  } else {
    if (!/^[\w.,%+@=-]{1,500}$/.test(id)) throw new Error('Invalid Binsearch result ID');
    url = new URL(`https://www.binsearch.info/nzb?${id.split('&').map(part => part.includes('=') ? part : `${encodeURIComponent(part)}=on`).join('&')}`);
  }
  const response = await fetch(url, { headers: { Accept: 'application/x-nzb, application/xml, */*' }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Indexer NZB download returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const prefix = bytes.toString('utf8', 0, Math.min(bytes.length, 4096)).replace(/^\uFEFF/, '').trimStart();
  if (bytes.length < 20 || bytes.length > 20 * 1024 * 1024 || !/<(?:[\w.-]+:)?nzb(?:\s|>)/i.test(prefix)) {
    throw new Error('Indexer response was not an NZB XML file. It may be an article fragment or an indexer error page.');
  }
  return bytes;
}
