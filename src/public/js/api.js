// API fetch helpers
export async function jsonFetch(url, options) {
  const response = await fetch(url, options);
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
