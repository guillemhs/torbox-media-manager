import { state, $, esc, setStatus, empty, loadViewMode } from './state.js';
import { jsonFetch } from './api.js';
import {
  renderPagination, renderSearchResults, renderSearchItem,
  renderBrowseTorrentSearchResults, renderBrowseUsenetSearchResults,
  titleCards, musicReleaseCards, localCards, renderTorboxLibrary,
  renderCalendar, pinRecentTorrent,
} from './render.js';

let calendarRequest = 0;

// Get selected indexers
export function getSelectedIndexers(prefix = '') {
  const indexers = [];
  if ($(`#${prefix}indexer-prowlarr`)?.checked) indexers.push('prowlarr');
  if ($(`#${prefix}indexer-torrentio`)?.checked) indexers.push('torrentio');
  return indexers;
}

// Get usenet source
export function getUsenetSource(prefix = '') {
  return $(`#${prefix}usenet-source`)?.value || 'all';
}

// Go to a specific page
export async function goToPage(viewKey, page) {
  state.currentPage[viewKey] = page;
  const offset = (page - 1) * 20;
  state.offset[viewKey] = offset;

  switch (viewKey) {
    case 'movies':
    case 'shows':
    case 'music':
      void doSearch(viewKey, page);
      break;
    case 'browse':
      void doSearch('browse', page);
      break;
    case 'browse-torrents':
      await loadMoreBrowse('torrents');
      break;
    case 'browse-usenet':
      await loadMoreBrowse('usenet');
      break;
    case 'browse-torrent-search':
      await loadMoreBrowseTorrentSearch();
      break;
    case 'browse-usenet-search':
      await loadMoreBrowseUsenetSearch();
      break;
    case 'torrents-usenet-search':
      await loadMoreTorrentsUsenetSearch();
      break;
    case 'title-torrent-search':
      await loadMoreTitleTorrentSearch();
      break;
    case 'title-usenet-search':
      await loadMoreTitleUsenetSearch();
      break;
  }
}

// Load more browse category
export async function loadMoreBrowse(category) {
  void doSearch('browse', (state.currentPage['browse'] || 1) + 1);
}

// Unified search for /browse, /movies, /shows, /music
export async function doSearch(view, page = 1) {
  const input = $(`#${view}-query`);
  if (!input) return;
  const query = input.value.trim();

  if (query.length < 2) {
    state.items[view] = [];
    state.total[view] = 0;
    state.offset[view] = 0;
    state.currentPage[view] = 1;
    const container = $(`#${view}-results`);
    if (container) container.innerHTML = '';
    const count = $(`#${view}-count`);
    if (count) { count.textContent = ''; count.style.display = 'none'; }
    const pagId = view === 'browse' ? 'browse-pagination' : `${view}-pagination`;
    const pagContainer = document.getElementById(pagId);
    if (pagContainer) { pagContainer.classList.add('hidden'); pagContainer.innerHTML = ''; }
    const moreBtn = document.getElementById(`${view}-more`);
    if (moreBtn) moreBtn.classList.toggle('hidden', true);
    return;
  }

  const sources = [];
  const indexersCheckboxId = view === 'browse' ? 'source-indexers' : `${view}-source-indexers`;
  const usenetCheckboxId = view === 'browse' ? 'source-usenet' : `${view}-source-usenet`;
  const indexersCheckbox = $(`#${indexersCheckboxId}`);
  const usenetCheckbox = $(`#${usenetCheckboxId}`);
  if (indexersCheckbox && indexersCheckbox.checked) sources.push('indexers');
  if (usenetCheckbox && usenetCheckbox.checked) sources.push('usenet');
  if (sources.length === 0) {
    setStatus(view, 'Select at least one source.');
    return;
  }

  const usenetSource = $(`#${view === 'browse' ? 'usenet-source' : `${view}-usenet-source`}`)?.value || 'all';
  const indexers = getSelectedIndexers(view === 'browse' ? '' : `${view}-`);
  const limit = 20;
  const offset = (page - 1) * limit;

  state.offset[view] = offset;
  state.currentPage[view] = page;

  setStatus(view, 'Searching…');
  try {
    let data;
    if (view === 'browse') {
      data = await jsonFetch(`/api/search?q=${encodeURIComponent(query)}&sources=${encodeURIComponent(sources.join(','))}&usenetSource=${encodeURIComponent(usenetSource)}&indexers=${encodeURIComponent(indexers.join(','))}&limit=${limit}&offset=${offset}`);
    } else {
      const kind = view === 'movies' ? 'movie' : view === 'shows' ? 'series' : 'music';
      data = await jsonFetch(`/api/${view}?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}&sources=${encodeURIComponent(sources.join(','))}&usenetSource=${encodeURIComponent(usenetSource)}&indexers=${encodeURIComponent(indexers.join(','))}&limit=${limit}&offset=${offset}`);
    }

    const tItems = data.results?.torrents?.items || data.torrents?.items || [];
    const uItems = data.results?.usenet?.items || data.usenet?.items || [];
    const torrents = tItems.map((t) => ({ ...t, _source: 'torrents' }));
    const usenet = uItems.map((u) => ({ ...u, _source: 'usenet' }));

    const hasIndexers = sources.includes('indexers');
    const hasUsenet = sources.includes('usenet');

    let rows = [];
    if (hasIndexers && hasUsenet) {
      rows = [...torrents, ...usenet];
    } else if (hasIndexers) {
      rows = torrents;
    } else if (hasUsenet) {
      rows = usenet;
    } else {
      rows = torrents;
    }

    if (view === 'browse') {
      state.total[view] = (data.torrents?.total || 0) + (data.usenet?.total || 0);
    } else {
      state.total[view] = (data.results?.torrents?.total || data.torrents?.total || 0) + (data.results?.usenet?.total || data.usenet?.total || 0);
    }

    state.items[view] = rows;
    state.offset[view] = offset + rows.length;

    const container = $(`#${view}-results`);
    if (container) {
      container.innerHTML = rows.length ? rows.map((item, idx) => renderSearchItem(item, idx)).join('') : empty('No results found.');
    }

    const pagId = view === 'browse' ? 'browse-pagination' : `${view}-pagination`;
    renderPagination(view, pagId);

    const moreBtn = document.getElementById(`${view}-more`);
    if (moreBtn) {
      const hasMore = rows.length > 0 && (state.offset[view] || 0) < state.total[view];
      moreBtn.classList.toggle('hidden', !hasMore);
    }

    setStatus(view, '');
  } catch (error) {
    setStatus(view, error.message);
  }
}

// Load more for unified search
export async function loadMoreUnified(view) {
  void goToPage(view, (state.currentPage[view] || 1) + 1);
}

// Search unified for movies/shows/music
export async function searchUnified(view) {
  const query = $(`#${view}-query`)?.value.trim() || '';
  if (query.length < 2) {
    setStatus(view, 'Enter at least 2 characters to search.');
    return;
  }

  state.offset[view] = 0;
  state.items[view] = [];

  setStatus(view, 'Searching…');
  try {
    const sources = [];
    const indexersCheckbox = $(`#${view}-source-indexers`);
    const usenetCheckbox = $(`#${view}-source-usenet`);
    if (indexersCheckbox && indexersCheckbox.checked) sources.push('indexers');
    if (usenetCheckbox && usenetCheckbox.checked) sources.push('usenet');
    if (sources.length === 0) {
      setStatus(view, 'Select at least one source.');
      return;
    }

    const kind = view === 'movies' ? 'movie' : view === 'shows' ? 'series' : 'music';
    const usenetSource = $(`#${view}-usenet-source`)?.value || 'all';
    const indexers = getSelectedIndexers(`${view}-`);

    const url = `/api/search?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}&sources=${encodeURIComponent(sources.join(','))}&usenetSource=${encodeURIComponent(usenetSource)}&indexers=${encodeURIComponent(indexers.join(','))}&limit=20&offset=0`;
    const data = await jsonFetch(url);

    if (view === 'movies') {
      const movieMetadata = data.movies?.items || [];
      const movieTorrents = data.torrents?.items || [];
      const movieUsenet = data.usenet?.items || [];
      const transformedTorrents = movieTorrents.map((t) => ({
        imdbId: t.hash, primaryTitle: t.name, titleType: 'movie', startYear: '',
        seeders: t.seeders, leechers: t.leechers, size: t.size, source: t.source,
        _source: t._source || 'torrents', hash: t.hash, magnet: t.magnet, downloadToken: t.downloadToken,
      }));
      const transformedUsenet = movieUsenet.map((u) => ({
        imdbId: u.id, primaryTitle: u.name, titleType: 'movie', startYear: '',
        seeders: null, leechers: null, size: u.size, source: u.source,
        _source: u._source || 'usenet', id: u.id, name: u.name, complete: u.complete,
      }));
      state.items.movies = [...movieMetadata, ...transformedTorrents, ...transformedUsenet];
      state.total.movies = (data.movies?.total || 0) + (data.torrents?.total || 0) + (data.usenet?.total || 0);
      state.offset.movies = state.items.movies.length;
      const container = $('#movies-results');
      if (container) container.innerHTML = state.items.movies.length ? titleCards(state.items.movies.map((item) => ({ ...item, kind: 'movie' }))) : '';
      $('#movies-more')?.classList.toggle('hidden', state.items.movies.length >= state.total.movies);
      import('./render.js').then(({ observeArtwork }) => observeArtwork(container));
    } else if (view === 'shows') {
      const showMetadata = data.shows?.items || [];
      const showTorrents = data.torrents?.items || [];
      const showUsenet = data.usenet?.items || [];
      const transformedTorrents = showTorrents.map((t) => ({
        imdbId: t.hash, primaryTitle: t.name, titleType: 'tvSeries', startYear: '',
        seeders: t.seeders, leechers: t.leechers, size: t.size, source: t.source,
        _source: t._source || 'torrents', hash: t.hash, magnet: t.magnet, downloadToken: t.downloadToken,
      }));
      const transformedUsenet = showUsenet.map((u) => ({
        imdbId: u.id, primaryTitle: u.name, titleType: 'tvSeries', startYear: '',
        seeders: null, leechers: null, size: u.size, source: u.source,
        _source: u._source || 'usenet', id: u.id, name: u.name, complete: u.complete,
      }));
      state.items.shows = [...showMetadata, ...transformedTorrents, ...transformedUsenet];
      state.total.shows = (data.shows?.total || 0) + (data.torrents?.total || 0) + (data.usenet?.total || 0);
      state.offset.shows = state.items.shows.length;
      const container = $('#shows-results');
      if (container) container.innerHTML = state.items.shows.length ? titleCards(state.items.shows.map((item) => ({ ...item, kind: 'series' }))) : '';
      $('#shows-more')?.classList.toggle('hidden', state.items.shows.length >= state.total.shows);
      import('./render.js').then(({ observeArtwork }) => observeArtwork(container));
    } else if (view === 'music') {
      const musicMetadata = data.music?.items || [];
      const musicTorrents = data.torrents?.items || [];
      const musicUsenet = data.usenet?.items || [];
      const transformedTorrents = musicTorrents.map((t) => ({
        id: t.hash, title: t.name, artist: t.source || 'Unknown', date: '', type: 'Torrent',
        _source: t._source || 'torrents', hash: t.hash, magnet: t.magnet,
        seeders: t.seeders, leechers: t.leechers, size: t.size, source: t.source, downloadToken: t.downloadToken,
      }));
      const transformedUsenet = musicUsenet.map((u) => ({
        id: u.id, title: u.name, artist: u.source || 'Unknown', date: '', type: 'Usenet',
        _source: u._source || 'usenet', id: u.id, name: u.name, size: u.size, source: u.source, complete: u.complete,
      }));
      state.items.music = [...musicMetadata, ...transformedTorrents, ...transformedUsenet];
      state.total.music = (data.music?.total || 0) + (data.torrents?.total || 0) + (data.usenet?.total || 0);
      state.offset.music = state.items.music.length;
      const container = $('#music-results');
      if (container) container.innerHTML = state.items.music.length ? musicReleaseCards(state.items.music) : '';
      $('#music-more')?.classList.toggle('hidden', state.items.music.length >= state.total.music);
      const countEl = $('#music-count');
      if (countEl) countEl.textContent = `${state.items.music.length}${state.total.music > state.items.music.length ? ` of ${state.total.music}` : ''} items`;
      import('./render.js').then(({ observeArtwork }) => observeArtwork(container));
    }

    const warnings = [...(data.torrents?.warnings || []), ...(data.usenet?.warnings || [])];
    const total = (data.movies?.total || 0) + (data.shows?.total || 0) + (data.music?.total || 0) + (data.torrents?.total || 0) + (data.usenet?.total || 0);
    setStatus(view, `${total} results${warnings.length ? ` · ${warnings.join(' · ')}` : ''}`);
  } catch (error) {
    setStatus(view, error.message);
  }
}

// Load calendar
export async function loadCalendar() {
  const request = ++calendarRequest;
  setStatus('calendar', 'Loading schedule…');
  const date = $('#calendar-date')?.value || '';
  const country = $('#calendar-country')?.value || 'US';
  const type = state.calendarType;
  const key = `${date}:${country}:${type}`;
  try {
    if (state.calendarKey !== key) {
      const data = await jsonFetch(`/api/calendar?date=${encodeURIComponent(date)}&country=${encodeURIComponent(country)}${type === 'web' ? '&type=web' : ''}`);
      if (request !== calendarRequest) return;
      state.calendarData = data;
      state.calendarKey = key;
    }
    if (request === calendarRequest) renderCalendar();
  } catch (error) {
    if (request !== calendarRequest) return;
    const calRes = $('#calendar-results');
    if (calRes) calRes.innerHTML = empty(error.message);
    setStatus('calendar', error.message);
  }
}

// Shift calendar day
export function shiftCalendarDay(days) {
  const dateInput = $('#calendar-date');
  if (!dateInput) return;
  const date = new Date(`${dateInput.value}T12:00:00`);
  date.setDate(date.getDate() + days);
  dateInput.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  void loadCalendar();
}

// Load view
export async function loadView(view, reset = false) {
  if (reset) {
    state.offset[view] = 0;
    state.items[view] = [];
  }

  if (view === 'browse') {
    const q = $('#browse-query')?.value || '';
    if (!q || q.length < 2) {
      state.items[view] = [];
      state.total[view] = 0;
      state.offset[view] = 0;
      state.currentPage[view] = 1;
      const container = $('#browse-results');
      if (container) container.innerHTML = '';
      const count = $('#browse-count');
      if (count) { count.textContent = ''; count.style.display = 'none'; }
      const pagContainer = document.getElementById('browse-pagination');
      if (pagContainer) { pagContainer.classList.add('hidden'); pagContainer.innerHTML = ''; }
      const moreBtn = document.getElementById('browse-more');
      if (moreBtn) moreBtn.classList.add('hidden');
      setStatus(view, '');
      return;
    }
    void doSearch('browse', 1);
    return;
  }

  const supported = ['browse', 'movies', 'shows', 'music', 'library'];
  if (supported.includes(view)) {
    const q = $(`#${view}-query`)?.value || '';
    if (!q) {
      state.items[view] = [];
      state.total[view] = 0;
      state.offset[view] = 0;
      state.currentPage[view] = 1;
      const results = $(`#${view}-results`);
      if (results) results.innerHTML = '';
      const count = $(`#${view}-count`);
      if (count) { count.textContent = ''; count.style.display = 'none'; }
      const pagId = `${view}-pagination`;
      const pagContainer = document.getElementById(pagId);
      if (pagContainer) { pagContainer.classList.add('hidden'); pagContainer.innerHTML = ''; }
      const moreBtn = document.getElementById(`${view}-more`);
      if (moreBtn) moreBtn.classList.add('hidden');
      setStatus(view, '');
      return;
    }

    setStatus(view, 'Loading…');
    try {
      if (view === 'library') {
        const data = await jsonFetch(`/library?limit=1000&offset=0`);
        let rows = data.torbox || [];
        const recentIds = new Set(state.recentTorrents.map((item) => Number(item.id)));
        rows = [...state.recentTorrents, ...rows.filter((item) => !recentIds.has(Number(item.id)))];
        state.items[view] = reset ? rows : [...state.items[view], ...rows];
        state.offset[view] = state.items[view].length;
        const results = $('#library-results');
        if (results) {
          results.innerHTML = state.items[view].length ? renderTorboxLibrary(state.items[view]) : empty('No Library items found.');
          import('./render.js').then(({ observeArtwork }) => observeArtwork(results));
        }
        setStatus(view, data.usenetError ? `TorBox Usenet list unavailable: ${data.usenetError}` : '');
        updateMore(view);
        return;
      }

      void doSearch(view, 1);
    } catch (error) {
      setStatus(view, error.message);
    }
  }
  loadViewMode = null;
}

export function updateMore(view) {
  const button = $(`#${view}-more`);
  if (button) button.classList.toggle('hidden', state.items[view].length >= state.total[view]);
}

// Search torrent candidates for a specific title
async function searchBrowseTorrentCandidates(imdbId, kind, title, offset = 0, limit = 20) {
  const season = kind === 'series' ? 1 : undefined;
  const url = `/torrents/search?imdbId=${encodeURIComponent(imdbId)}&kind=${encodeURIComponent(kind)}&season=${season || 1}&title=${encodeURIComponent(title)}&limit=${limit}&offset=${offset}`;
  return await jsonFetch(url);
}

// Search usenet candidates
async function searchBrowseUsenetCandidates(query, source = 'all', offset = 0, limit = 20) {
  const url = `/usenet/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}&limit=${limit}&offset=${offset}`;
  return await jsonFetch(url);
}

// Load more torrent search results (browse)
export async function loadMoreBrowseTorrentSearch() {
  const { query, kind, imdbId } = state.browseTorrentSearch;
  if (!query || !imdbId) return;
  const offset = state.offset['browse-torrent-search'] || 0;
  const limit = 20;
  setStatus('browse', 'Loading more torrent results…');
  try {
    const data = await searchBrowseTorrentCandidates(imdbId, kind, query, offset, limit);
    const newItems = data.candidates || [];
    state.browseTorrentSearch.candidates = [...state.browseTorrentSearch.candidates, ...newItems];
    state.offset['browse-torrent-search'] += newItems.length;
    import('./render.js').then(({ renderBrowseTorrentSearchResults }) => renderBrowseTorrentSearchResults(state.browseTorrentSearch.candidates, state.browseTorrentSearch.total));
    setStatus('browse', '');
  } catch (error) {
    setStatus('browse', error.message);
  }
}

// Load more usenet search results (browse)
export async function loadMoreBrowseUsenetSearch() {
  const { query } = state.browseUsenetSearch;
  if (!query) return;
  const offset = state.offset['browse-usenet-search'] || 0;
  const limit = 20;
  const source = $('#browse-usenet-search-source')?.value || 'all';
  setStatus('browse', 'Loading more usenet results…');
  try {
    const data = await searchBrowseUsenetCandidates(query, source, offset, limit);
    const newItems = data.candidates || [];
    state.browseUsenetSearch.candidates = [...state.browseUsenetSearch.candidates, ...newItems];
    state.offset['browse-usenet-search'] += newItems.length;
    import('./render.js').then(({ renderBrowseUsenetSearchResults }) => renderBrowseUsenetSearchResults(state.browseUsenetSearch.candidates, state.browseUsenetSearch.total));
    setStatus('browse', '');
  } catch (error) {
    setStatus('browse', error.message);
  }
}

// Load more title torrent search
export async function loadMoreTitleTorrentSearch() {
  const { query, kind, imdbId } = state.titleTorrentSearch;
  if (!query || !imdbId) return;
  const offset = state.offset['title-torrent-search'] || 0;
  const limit = 20;
  setStatus('browse', 'Loading more torrent results…');
  try {
    const data = await searchBrowseTorrentCandidates(imdbId, kind, query, offset, limit);
    const newItems = data.candidates || [];
    state.titleTorrentSearch.candidates = [...state.titleTorrentSearch.candidates, ...newItems];
    state.offset['title-torrent-search'] += newItems.length;
    import('./render.js').then(() => {
      // Title torrent search results rendered inline
    });
    setStatus('browse', '');
  } catch (error) {
    setStatus('browse', error.message);
  }
}

// Load more title usenet search
export async function loadMoreTitleUsenetSearch() {
  const { query } = state.titleUsenetSearch;
  if (!query) return;
  const offset = state.offset['title-usenet-search'] || 0;
  const limit = 20;
  const source = $('#title-usenet-search-source')?.value || 'all';
  setStatus('browse', 'Loading more usenet results…');
  try {
    const data = await searchBrowseUsenetCandidates(query, source, offset, limit);
    const newItems = data.candidates || [];
    state.titleUsenetSearch.candidates = [...state.titleUsenetSearch.candidates, ...newItems];
    state.offset['title-usenet-search'] += newItems.length;
    import('./render.js').then(() => {});
    setStatus('browse', '');
  } catch (error) {
    setStatus('browse', error.message);
  }
}

// Load more torrents/usenet search
export async function loadMoreTorrentsUsenetSearch() {
  const { query } = state.torrentsUsenetSearch;
  if (!query) return;
  const offset = state.offset['torrents-usenet-search'] || 0;
  const limit = 20;
  const source = $('#torrents-usenet-search-source')?.value || 'all';
  setStatus('library', 'Loading more usenet results…');
  try {
    const data = await searchBrowseUsenetCandidates(query, source, offset, limit);
    const newItems = data.candidates || [];
    state.torrentsUsenetSearch.candidates = [...state.torrentsUsenetSearch.candidates, ...newItems];
    state.offset['torrents-usenet-search'] += newItems.length;
    import('./render.js').then(() => {});
    setStatus('library', '');
  } catch (error) {
    setStatus('library', error.message);
  }
}

// Load title detail
export async function loadTitle(imdbId, kind) {
  const pageTitle = $('#page-title');
  if (pageTitle) pageTitle.textContent = 'Loading title…';
  const detailContent = $('#detail-content');
  if (detailContent) detailContent.innerHTML = '<div class="detail-layout"><div class="detail-poster"></div><div><div class="skeleton" style="width:38%"></div><div class="skeleton" style="width:78%;height:34px;margin:14px 0"></div><div class="skeleton" style="width:52%"></div></div></div>';
  try {
    const endpoint = kind === 'series' ? 'shows' : 'movies';
    const title = await jsonFetch(`/api/${endpoint}/${encodeURIComponent(imdbId)}`);
    if (!title.imdbId) title.imdbId = imdbId;
    const actualKind = /^tv/i.test(title.titleType) ? 'series' : 'movie';
    const genres = String(title.genres || '').split(',').map((v) => v.trim()).filter(Boolean);
    if (pageTitle) pageTitle.textContent = title.primaryTitle;
    // Render detail (simplified - full HTML in original app.js)
    detailContent.innerHTML = `<div class="detail-layout"><div class="detail-poster"><img loading="lazy" data-artwork-id="${esc(imdbId)}" data-artwork-kind="${esc(actualKind)}" alt="${esc(title.primaryTitle)} poster" /></div><div class="detail-copy"><h2>${esc(title.primaryTitle)}</h2><div class="detail-meta">${esc(genres.join(', '))} · ${esc(title.startYear || '')}</div><div class="detail-description">${esc(title.overview || '')}</div></div></div>`;
    import('./render.js').then(({ observeArtwork }) => observeArtwork(detailContent));
  } catch (error) {
    const detailContent = $('#detail-content');
    if (detailContent) detailContent.innerHTML = `<div class="detail-error">${esc(error.message)}</div>`;
    setStatus('title', error.message);
  }
}

// Load TVMaze title
export async function loadTvmazeTitle(id) {
  const pageTitle = $('#page-title');
  if (pageTitle) pageTitle.textContent = 'Loading title…';
  const detailContent = $('#detail-content');
  if (detailContent) detailContent.innerHTML = '<div class="empty-state"><span class="spinner"></span>Loading…</div>';
  try {
    // TVMaze show lookup
    setStatus('title', '');
  } catch (error) {
    setStatus('title', error.message);
  }
}

// Route from location
export function routeFromLocation() {
  const path = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams(location.search);
  const titleMatch = /^title\/(tt\d+)$/i.exec(path);
  const tvmazeMatch = /^tvmaze\/(\d+)$/i.exec(path);

  if (titleMatch) {
    const imdbId = titleMatch[1];
    const kind = params.get('kind') || 'movie';
    void loadTitle(imdbId, kind);
    return;
  }
  if (tvmazeMatch) {
    void loadTvmazeTitle(tvmazeMatch[1]);
    return;
  }

  // Map URL paths to views
  const viewMap = {
    '': 'browse', browse: 'browse', movies: 'movies', shows: 'shows',
    music: 'music', library: 'library', calendar: 'calendar',
  };
  const view = viewMap[path] || 'browse';
  void loadView(view, true);
}

// Set route
export function setRoute(path) {
  const destination = path.startsWith('/') ? path : `/${path}`;
  if (location.pathname + location.search === destination) {
    routeFromLocation();
  } else {
    history.pushState(null, '', destination);
    routeFromLocation();
    if (typeof window.closeSidebar === 'function') window.closeSidebar();
  }
}

// Search route
export function searchRoute(view) {
  if (view === 'browse') {
    const q = $('#browse-query')?.value.trim() || '';
    setRoute(`/browse?q=${encodeURIComponent(q)}`);
  } else if (view === 'movies') {
    loadViewMode = 'search';
    void loadView('movies', true);
  } else if (view === 'shows' || view === 'music') {
    void searchUnified(view);
  } else {
    void loadView(view, true);
  }
}
