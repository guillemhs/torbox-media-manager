// API fetch helpers
export async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw Error(`Expected JSON from ${url} but got ${response.status} ${contentType}: ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  if (!response.ok) throw Error(data.error?.message || data.error || 'Request failed');
  return data;
}

export async function jsonFetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await jsonFetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
