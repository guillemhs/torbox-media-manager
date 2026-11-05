// Application state
export const state = {
  view: 'browse',
  calendarType: 'broadcast',
  calendarData: null,
  calendarKey: '',
  offset: {
    browse: 0, movies: 0, shows: 0, torrents: 0, local: 0,
    'browse-movies': 0, 'browse-shows': 0, 'browse-music': 0, 'browse-torrents': 0, 'browse-usenet': 0,
    'browse-torrent-search': 0, 'browse-usenet-search': 0, 'title-torrent-search': 0, 'title-usenet-search': 0,
    'torrents-usenet-search': 0,
  },
  total: {
    browse: 0, movies: 0, shows: 0, torrents: 0, local: 0,
    'browse-movies': 0, 'browse-shows': 0, 'browse-music': 0, 'browse-torrents': 0, 'browse-usenet': 0,
    'browse-torrent-search': 0, 'browse-usenet-search': 0, 'title-torrent-search': 0, 'title-usenet-search': 0,
    'torrents-usenet-search': 0,
  },
  currentPage: {
    browse: 1, movies: 1, shows: 1, torrents: 1, local: 1,
    'browse-movies': 1, 'browse-shows': 1, 'browse-music': 1, 'browse-torrents': 1, 'browse-usenet': 1,
    'browse-torrent-search': 1, 'browse-usenet-search': 1, 'title-torrent-search': 1, 'title-usenet-search': 1,
    'torrents-usenet-search': 1,
  },
  totalPages: {
    browse: 1, movies: 1, shows: 1, torrents: 1, local: 1,
    'browse-movies': 1, 'browse-shows': 1, 'browse-music': 1, 'browse-torrents': 1, 'browse-usenet': 1,
    'browse-torrent-search': 1, 'browse-usenet-search': 1, 'title-torrent-search': 1, 'title-usenet-search': 1,
    'torrents-usenet-search': 1,
  },
  items: { browse: [], movies: [], shows: [], torrents: [], local: [] },
  browseResults: { movie: [], series: [], music: [], torrents: [], usenet: [] },
  recentTorrents: [],
  browseTorrentSearch: { candidates: [], total: 0, query: '', kind: '', imdbId: '' },
  browseUsenetSearch: { candidates: [], total: 0, query: '' },
  titleTorrentSearch: { candidates: [], total: 0, query: '', kind: '', imdbId: '' },
  titleUsenetSearch: { candidates: [], total: 0, query: '' },
  torrentsUsenetSearch: { candidates: [], total: 0, query: '' },
  browseSearchInProgress: false,
  browseSearched: false,
  moviesSearched: false,
  musicSearched: false,
  showsSearched: false,
};

let loadViewMode = null;
export { loadViewMode };

// DOM helpers
export const $ = (selector) => document.querySelector(selector);

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const fmtBytes = (value) => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
};

export const setStatus = (view, text) => {
  const node = $(`#${view}-status`);
  if (node) node.textContent = text || '';
};

export const empty = (label = 'No results found.', action) =>
  `<div class="empty-state"><p class="mb-3">${esc(label)}</p>${action ? `<button class="btn btn-primary">${esc(action)}</button>` : ''}</div>`;

// Artwork lazy-loading
export const artworkPromises = new Map();

export const artworkUrl = (key, url) => {
  if (artworkPromises.has(key)) return artworkPromises.get(key);
  const promise = fetch(url).then((r) => r.json()).then((data) => data.artwork?.url || null).catch(() => null);
  artworkPromises.set(key, promise);
  return promise;
};

export const loadArtwork = (img) => {
  const imdbId = img.dataset.artworkId;
  const kind = img.dataset.artworkKind;
  const musicId = img.dataset.musicArtworkId;
  const album = img.dataset.musicArtwork;
  const key = imdbId ? `title:${imdbId}` : musicId ? `music-id:${musicId}` : `music:${album.toLocaleLowerCase()}`;
  const url = imdbId ? `/artwork/${encodeURIComponent(imdbId)}?kind=${encodeURIComponent(kind)}`
    : musicId ? `/music/artwork?id=${encodeURIComponent(musicId)}`
    : `/music/artwork?q=${encodeURIComponent(album)}`;
  const srcPromise = artworkUrl(key, url);
  srcPromise.then((src) => {
    if (!src || !img.isConnected) return;
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => img.remove();
    img.src = src;
    if (img.complete && img.naturalWidth) img.classList.add('loaded');
  });
};

export const artworkObserver = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        artworkObserver.unobserve(entry.target);
        loadArtwork(entry.target);
      }
    });
  }, { rootMargin: '240px' })
  : null;

export const observeArtwork = (root) => {
  if (!root) return;
  root.querySelectorAll('[data-artwork-id],[data-music-artwork],[data-music-artwork-id]').forEach((img) => {
    if (artworkObserver) artworkObserver.observe(img);
    else loadArtwork(img);
  });
};
