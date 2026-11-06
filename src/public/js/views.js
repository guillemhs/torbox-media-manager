import { state, $, esc, setStatus, empty, observeArtwork } from './state.js';
import { jsonFetch } from './api.js';
import {
  renderPagination, renderPaginationHtml, renderSearchResults, renderSearchItem,
  renderBrowseTorrentSearchResults, renderBrowseUsenetSearchResults,
  titleCards, musicReleaseCards, localCards, renderTorboxLibrary,
  renderCalendar, pinRecentTorrent, renderTitleDetail, renderTitleNotFound,
  renderMusicDetail, renderMusicNotFound,
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
    case 'browse':
      void doSearch(viewKey, page);
      break;
  }
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
    setStatus(view, '');
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
      // /api/browse supports empty q for discover mode; /api/search requires q >= 2
      data = await jsonFetch(`/api/browse?q=${encodeURIComponent(query)}&kind=all&sources=${encodeURIComponent(sources.join(','))}&limit=${limit}&offset=${offset}`);
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
      state.total[view] = (data.results?.torrents?.total || 0) + (data.results?.usenet?.total || 0);
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

    setStatus(view, '');
  } catch (error) {
    setStatus(view, error.message);
  }
}

// Local search for Discover buttons - IMDb and MusicBrainz only
export async function searchLocal(view, page = 1) {
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
    setStatus(view, '');
    return;
  }

  const limit = 20;
  const offset = (page - 1) * limit;

  state.offset[view] = offset;
  state.currentPage[view] = page;

  setStatus(view, 'Searching…');
  try {
    let data;
    if (view === 'browse') {
      data = await jsonFetch(`/api/browse?q=${encodeURIComponent(query)}&kind=all&limit=${limit}&offset=${offset}`);
    } else {
      const kind = view === 'movies' ? 'movie' : view === 'shows' ? 'series' : 'music';
      data = await jsonFetch(`/api/${view}?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}&limit=${limit}&offset=${offset}`);
    }

    const lItems = data.results?.local?.items || [];
    const local = lItems.map((l) => ({ ...l, _source: 'local' }));

    state.total[view] = view === 'browse'
      ? (data.results?.local?.total || 0)
      : (data.results?.local?.total || 0);

    state.items[view] = local;
    state.offset[view] = offset + local.length;

    const container = $(`#${view}-results`);
    if (container) {
      container.innerHTML = local.length ? local.map((item, idx) => renderSearchItem(item, idx)).join('') : empty('No results found.');
    }

    const pagId = view === 'browse' ? 'browse-pagination' : `${view}-pagination`;
    renderPagination(view, pagId);

    setStatus(view, '');
  } catch (error) {
    setStatus(view, error.message);
  }
}

// Search unified for movies/shows/music
export async function searchUnified(view) {
  const query = $(`#${view}-query`)?.value.trim() || '';

  if (query.length < 2) {
    state.items[view] = [];
    state.total[view] = 0;
    state.offset[view] = 0;
    state.currentPage[view] = 1;
    const container = $(`#${view}-results`);
    if (container) container.innerHTML = '';
    const count = $(`#${view}-count`);
    if (count) { count.textContent = ''; count.style.display = 'none'; }
    const pagId = `${view}-pagination`;
    const pagContainer = document.getElementById(pagId);
    if (pagContainer) { pagContainer.classList.add('hidden'); pagContainer.innerHTML = ''; }
    setStatus(view, '');
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

    // Use individual endpoints (/api/movies, /api/shows, /api/music) which support
    // empty q for discover mode. /api/search requires q >= 2.
    const url = `/api/${view}?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}&sources=${encodeURIComponent(sources.join(','))}&usenetSource=${encodeURIComponent(usenetSource)}&indexers=${encodeURIComponent(indexers.join(','))}&limit=20&offset=0`;
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
      observeArtwork(container);
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
      observeArtwork(container);
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
      observeArtwork(container);
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

  // Browse view loads discover content via doSearch (handles empty query)

  const supported = ['browse', 'movies', 'shows', 'music', 'library', 'calendar'];
  if (supported.includes(view)) {
    showView(view);
    if (view === 'calendar') {
      void loadCalendar();
      return;
    }
    const q = $(`#${view}-query`)?.value || '';
    setStatus(view, 'Loading…');
    try {
      // Library always loads its items regardless of search query
      if (view === 'library') {
        const data = await jsonFetch(`/library?limit=1000&offset=0`);
        let rows = data.torbox || [];
        const recentIds = new Set(state.recentTorrents.map((item) => Number(item.id)));
        rows = [...state.recentTorrents, ...rows.filter((item) => !recentIds.has(Number(item.id)))];
        state.items[view] = reset ? rows : [...state.items[view], ...rows];
        state.offset[view] = state.items[view].length;
        const results = $('#library-results');
        const summary = $('#library-summary');
        if (results) {
          results.innerHTML = state.items[view].length ? renderTorboxLibrary(state.items[view]) : empty('No Library items found.');
          observeArtwork(results);
        }
        if (summary) {
          summary.textContent = state.items[view].length ? `${state.items[view].length} item${state.items[view].length !== 1 ? 's' : ''}` : '';
          summary.style.display = state.items[view].length ? 'block' : 'none';
        }
        const count = $('#library-count');
        if (count) {
          count.textContent = state.items[view].length ? `Showing ${state.items[view].length} item${state.items[view].length !== 1 ? 's' : ''}` : '';
          count.style.display = state.items[view].length ? 'block' : 'none';
        }
        // Library pagination
        const pagId = 'library-pagination';
        const pagContainer = document.getElementById(pagId);
        if (pagContainer) {
          if (state.items[view].length > 1) {
            pagContainer.classList.remove('hidden');
            pagContainer.innerHTML = renderPaginationHtml('library', state.items[view].length, 1, 20);
          } else {
            pagContainer.classList.add('hidden');
            pagContainer.innerHTML = '';
          }
        }
        setStatus(view, data.usenetError ? `TorBox Usenet list unavailable: ${data.usenetError}` : '');
        return;
      }

      // Load discover content when no query, or search when query provided
      void doSearch(view, 1);
    } catch (error) {
      setStatus(view, error.message);
    }
  }
}

// Load a specific library page
export async function loadLibraryPage(page) {
  const limit = 20;
  const offset = (page - 1) * limit;
  try {
    setStatus('library', 'Loading…');
    const data = await jsonFetch(`/library?limit=${limit}&offset=${offset}`);
    let rows = data.torbox || [];
    const recentIds = new Set(state.recentTorrents.map((item) => Number(item.id)));
    rows = [...state.recentTorrents, ...rows.filter((item) => !recentIds.has(Number(item.id)))];
    state.items['library'] = rows;
    state.offset['library'] = offset + rows.length;
    state.currentPage['library'] = page;
    const results = $('#library-results');
    const summary = $('#library-summary');
    if (results) {
      results.innerHTML = rows.length ? renderTorboxLibrary(rows) : empty('No Library items found.');
      observeArtwork(results);
    }
    if (summary) {
      summary.textContent = rows.length ? `${rows.length} item${rows.length !== 1 ? 's' : ''}` : '';
      summary.style.display = rows.length ? 'block' : 'none';
    }
    const pagId = 'library-pagination';
    const pagContainer = document.getElementById(pagId);
    if (pagContainer) {
      if (rows.length >= limit) {
        pagContainer.classList.remove('hidden');
        pagContainer.innerHTML = renderPaginationHtml('library', rows.length, page, limit);
      } else {
        pagContainer.classList.add('hidden');
        pagContainer.innerHTML = '';
      }
    }
    setStatus('library', data.usenetError ? `TorBox Usenet list unavailable: ${data.usenetError}` : '');
  } catch (error) {
    setStatus('library', error.message);
  }
}

// Show the requested view by adding the 'active' class
export function showView(viewName) {
    document.querySelectorAll('.view').forEach(node => {
      node.classList.toggle('active', node.id === `view-${viewName}`);
    });
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


// Load title detail page
export async function loadTitle(imdbId, kind = 'movie') {
  try {
    setStatus('title', 'Loading…');
    const endpoint = kind === 'series' ? 'shows' : 'movies';
    const title = await jsonFetch(`/api/${endpoint}/${encodeURIComponent(imdbId)}`);
    
    const detailContent = $('#detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderTitleDetail(title);
      observeArtwork(detailContent);
    }
    setStatus('title', '');
  } catch (error) {
    const detailContent = $('#detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderTitleNotFound();
    }
    setStatus('title', error.message);
  }
}

// Load music release detail page
export async function loadMusicDetail(mbId) {
  try {
    setStatus('music', 'Loading…');
    const release = await jsonFetch(`/api/music/${encodeURIComponent(mbId)}`);
    
    const detailContent = $('#music-detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderMusicDetail(release);
    }
    setStatus('music', '');
  } catch (error) {
    const detailContent = $('#music-detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderMusicNotFound();
    }
    setStatus('music', error.message);
  }
}

// Route from browser location
export function routeFromLocation() {
  const path = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams(location.search);
  const titleMatch = /^title\/(tt\d+)$/i.exec(path);
  const tvmazeMatch = /^tvmaze\/(\d+)$/i.exec(path);
  const musicMatch = /^music\/release\/([a-f0-9-]{36})$/i.exec(path);

  if (titleMatch) {
    const imdbId = titleMatch[1];
    const kind = params.get('kind') || 'movie';
    showView('title');
    void loadTitle(imdbId, kind);
    return;
  }
  if (musicMatch) {
    const mbId = musicMatch[1];
    showView('music-detail');
    void loadMusicDetail(mbId);
    return;
  }
  if (tvmazeMatch) {
    // TVMaze title detail view not yet implemented - load calendar
    void loadView('calendar', true);
    return;
  }

  const viewMap = {
    '': 'browse', browse: 'browse', movies: 'movies', shows: 'shows',
    music: 'music', 'music-detail': 'music-detail',
    library: 'library', calendar: 'calendar',
  };
  const view = viewMap[path] || 'browse';
  showView(view);
  void loadView(view, true);
}

// Set browser route
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

// Search route navigation
export function searchRoute(view) {
  if (view === 'browse') {
    const q = $('#browse-query')?.value.trim() || '';
    setRoute(`/browse?q=${encodeURIComponent(q)}`);
  } else if (view === 'movies') {
    void loadView('movies', true);
  } else if (view === 'shows' || view === 'music') {
    void searchUnified(view);
  } else {
    void loadView(view, true);
  }
}


// Library pagination click handler (delegated)
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const btn = target.closest('.pagination-btn[data-page]');
  if (btn && btn.closest('#library-pagination')) {
    event.preventDefault();
    const page = parseInt(btn.dataset.page);
    if (page >= 1 && !btn.disabled) {
      void loadLibraryPage(page);
    }
  }
});
