export interface UsenetCandidate {
  id: string;
  name: string;
  size?: number;
  posted?: number;
  complete?: boolean;
  groups?: string[];
  source: 'NZBIndex' | 'Binsearch';
}

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

async function readResponse(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`Indexer returned HTTP ${response.status}`);
  return response.text();
}

async function searchNzbIndex(query: string): Promise<UsenetCandidate[]> {
  const url = new URL('https://api.nzbindex.com/api/search');
  url.searchParams.set('q', query);
  url.searchParams.set('max', '50');
  url.searchParams.set('complete', '1');
  const payload = JSON.parse(await readResponse(await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }))) as {
    data?: { content?: Array<Record<string, unknown>> }; error?: boolean; errorMessage?: string;
  };
  if (payload.error) throw new Error(payload.errorMessage || 'NZBIndex search failed');
  return (payload.data?.content || []).flatMap(item => {
    const id = text(item.id);
    if (!id) return [];
    return [{ id, name: text(item.name) || 'Unnamed NZB', size: Number(item.size) || undefined,
      posted: Number(item.posted) || undefined, complete: item.complete === true,
      groups: Array.isArray(item.groups) ? item.groups.filter((group): group is string => typeof group === 'string') : [], source: 'NZBIndex' as const }];
  });
}

async function searchBinsearch(query: string): Promise<UsenetCandidate[]> {
  const url = new URL('https://www.binsearch.info/');
  url.searchParams.set('q', query);
  url.searchParams.set('max', '100');
  const html = await readResponse(await fetch(url, { headers: { 'User-Agent': 'TorBoxMediaManager/1.0 (+self-hosted media indexer search)', Accept: 'text/html' }, signal: AbortSignal.timeout(15_000) }));
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
    if (candidates.length >= 50) break;
  }
  return candidates;
}

export async function searchUsenet(query: string, source: 'all' | 'NZBIndex' | 'Binsearch') {
  const sources = source === 'all' ? ['NZBIndex', 'Binsearch'] as const : [source] as const;
  const results = await Promise.allSettled(sources.map(name => name === 'NZBIndex' ? searchNzbIndex(query) : searchBinsearch(query)));
  const candidates = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const warnings = results.flatMap((result, index) => result.status === 'rejected'
    ? [`${sources[index]}: ${result.reason instanceof Error ? result.reason.message : 'search failed'}`] : []);
  return { candidates, warnings, configured: { NZBIndex: true, Binsearch: true } };
}

export async function fetchUsenetNzb(source: 'NZBIndex' | 'Binsearch', id: string): Promise<Buffer> {
  let url: URL;
  if (source === 'NZBIndex') {
    if (!/^[a-f\d-]{36}$/i.test(id)) throw new Error('Invalid NZBIndex result ID');
    url = new URL(`https://api.nzbindex.com/api/download/${encodeURIComponent(id)}.nzb`);
  } else {
    if (!/^[\w.,%+@=-]{1,500}$/.test(id)) throw new Error('Invalid Binsearch result ID');
    url = new URL(`https://www.binsearch.info/nzb?${id.split('&').map(part => part.includes('=') ? part : `${encodeURIComponent(part)}=on`).join('&')}`);
  }
  const response = await fetch(url, { headers: { Accept: 'application/x-nzb, application/xml, */*' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Indexer NZB download returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const prefix = bytes.toString('utf8', 0, Math.min(bytes.length, 4096)).replace(/^\uFEFF/, '').trimStart();
  if (bytes.length < 20 || bytes.length > 20 * 1024 * 1024 || !/<(?:[\w.-]+:)?nzb(?:\s|>)/i.test(prefix)) {
    throw new Error('Indexer response was not an NZB XML file. It may be an article fragment or an indexer error page.');
  }
  return bytes;
}
