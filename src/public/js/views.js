import { state, $, esc, setStatus, empty, observeArtwork } from './state.js';
import { jsonFetch } from './api.js';
import {
  renderPaginationHtml, renderSearchResults, renderSearchItem,
  renderTorboxLibrary, renderCalendar, renderSkeletonGrid as renderSkel,
  renderTitleDetail, renderTitleNotFound, renderMusicDetail, renderMusicNotFound,
} from './render.js';

let calendarRequest = 0;

// ── Get selected source(s) (Indexers/Usenet with sub-type) ──
// Returns all checked checkboxes as arrays
export function getSelectedSource(prefix = '') {
  const name = prefix ? `${prefix}source` : 'source';
  const checkboxes = document.querySelectorAll(`input[name="${name}"]:checked`);

  const sources = [];
  const indexers = [];
  const usenetSource = [];

  checkboxes.forEach(cb => {
    const value = cb.value; // e.g. 'indexers:all', 'usenet:nzbgeek'
    const [type, subType] = value.split(':');

    if (type === 'indexers') {
      if (!sources.includes('indexers')) sources.push('indexers');
      if (subType === 'all') {
        if (!indexers.includes('prowlarr')) indexers.push('prowlarr');
        if (!indexers.includes('torrentio')) indexers.push('torrentio');
      } else {
        if (!indexers.includes(subType)) indexers.push(subType);
      }
    }

    if (type === 'usenet') {
      if (!sources.includes('usenet')) sources.push('usenet');
      if (subType === 'all') {
        if (!usenetSource.includes('NZBGeek')) usenetSource.push('NZBGeek');
        if (!usenetSource.includes('NZBIndex')) usenetSource.push('NZBIndex');
        if (!usenetSource.includes('Binsearch')) usenetSource.push('Binsearch');
      } else {
        if (!usenetSource.includes(subType)) usenetSource.push(subType);
      }
    }
  });

  return { sources, indexers, usenetSource };
}

// ── Get master indexers checkbox state ──
export function getIndexersMaster(prefix = '') {
  return $(`#${prefix}indexers`)?.checked || false;
}

// ── Get usenet source ──
export function getUsenetSource(prefix = '') {
  return $(`#${prefix}usenet-source`)?.value || 'all';
}

// ── Reset all per-view state (isolate each click) ──
export function resetViewState(view) {
  state.items[view] = [];
  state.total[view] = 0;
  state.offset[view] = 0;
  state.currentPage[view] = 1;
  state.totalPages[view] = 1;
  state.searchMode[view] = 'search';
  const container = $(`#${view}-results`);
  if (container) container.innerHTML = '';
  const count = $(`#${view}-count`);
  if (count) { count.textContent = ''; count.style.display = 'none'; }
  const pagId = view === 'browse' ? 'browse-pagination' : `${view}-pagination`;
  const pagContainer = document.getElementById(pagId);
  if (pagContainer) { pagContainer.classList.add('hidden'); pagContainer.innerHTML = ''; }
  // Keep the query input so pagination can re-read it
  setStatus(view, '');
}

// ── Go to a specific page ──
export async function goToPage(viewKey, page) {
  state.currentPage[viewKey] = page;
  const offset = (page - 1) * 20;
  state.offset[viewKey] = offset;

  switch (viewKey) {
    case 'movies':
    case 'shows':
    case 'music':
    case 'browse':
      // Use the same mode as the last operation (search or discover)
      if (state.searchMode?.[viewKey] === 'discover') {
        void searchLocal(viewKey, page);
      } else {
        void doSearch(viewKey, page);
      }
      break;
    case 'library':
      void loadLibraryPage(page);
      break;
  }
}

// ── Unified search for /browse, /movies, /shows, /music ──
export async function doSearch(view, page = 1) {
  const input = $(`#${view}-query`);
  if (!input) return;
  const query = input.value.trim();

  if (query.length < 2) {
    resetViewState(view);
    return;
  }

  resetViewState(view);

  const sourceSelection = getSelectedSource(`${view}-`);
  const { sources, indexers, usenetSource } = sourceSelection;
  if (sources.length === 0) {
    setStatus(view, 'Select at least one source.');
    return;
  }

  const limit = 20;
  const offset = (page - 1) * limit;

  state.offset[view] = offset;
  state.currentPage[view] = page;
  state.searchMode[view] = 'search';

  // Show skeletons while loading
  const container = $(`#${view}-results`);
  if (container) {
    container.innerHTML = renderSkel(8, view === 'music' ? 'music' : 'movie');
  }
  setStatus(view, 'Searching…');

  console.log('[USENET-PIPELINE] Frontend search:', { view, query, sources, indexers, usenetSource });

  try {
    let data;
    if (view === 'browse') {
      data = await jsonFetch(`/api/browse?q=${encodeURIComponent(query)}&kind=all&sources=${encodeURIComponent(sources.join(','))}&usenetSource=${encodeURIComponent(usenetSource)}&indexers=${encodeURIComponent(indexers.join(','))}&limit=${limit}&offset=${offset}`);
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

    if (container) {
      container.innerHTML = rows.length ? rows.map((item, idx) => renderSearchItem(item, idx)).join('') : empty('No results found.');
      observeArtwork(container);
    }

    const pagId = view === 'browse' ? 'browse-pagination' : `${view}-pagination`;
    const pagContainer = document.getElementById(pagId);
    if (pagContainer) {
      if (rows.length > 0) {
        pagContainer.classList.remove('hidden');
        pagContainer.innerHTML = renderPaginationHtml(view, state.total[view], page, limit);
      } else {
        pagContainer.classList.add('hidden');
        pagContainer.innerHTML = '';
      }
    }

    setStatus(view, '');
  } catch (error) {
    setStatus(view, error.message);
    if (container) container.innerHTML = empty('Search failed.');
  }
}

// ── Local search for Discover buttons ──
export async function searchLocal(view, page = 1) {
  const input = $(`#${view}-query`);
  if (!input) return;
  const query = input.value.trim();

  if (query.length < 2) {
    resetViewState(view);
    return;
  }

  resetViewState(view);

  const limit = 20;
  const offset = (page - 1) * limit;

  state.offset[view] = offset;
  state.currentPage[view] = page;
  state.searchMode[view] = 'discover';

  const container = $(`#${view}-results`);
  if (container) {
    container.innerHTML = renderSkel(8, view === 'music' ? 'music' : 'movie');
  }
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
    const local = lItems.map((l) => ({ ...l, _source: view === 'music' ? 'local-music' : 'local' }));

    state.total[view] = data.results?.local?.total || 0;
    state.items[view] = local;
    state.offset[view] = offset + local.length;

    if (container) {
      container.innerHTML = local.length ? local.map((item, idx) => renderSearchItem(item, idx)).join('') : empty('No results found.');
      observeArtwork(container);
    }

    const pagId = view === 'browse' ? 'browse-pagination' : `${view}-pagination`;
    const pagContainer = document.getElementById(pagId);
    if (pagContainer) {
      if (local.length > 0) {
        pagContainer.classList.remove('hidden');
        pagContainer.innerHTML = renderPaginationHtml(view, state.total[view], page, limit);
      } else {
        pagContainer.classList.add('hidden');
        pagContainer.innerHTML = '';
      }
    }

    setStatus(view, '');
  } catch (error) {
    setStatus(view, error.message);
    if (container) container.innerHTML = empty('Search failed.');
  }
}

// ── Library page load ──
export async function loadLibraryPage(page = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;

  const container = $('#library-results');
  if (container) {
    container.innerHTML = renderSkel(8, 'movie');
  }
  setStatus('library', 'Loading…');

  try {
    const data = await jsonFetch(`/library?limit=${limit}&offset=${offset}`);
    let rows = data.torbox || [];
    const recentIds = new Set(state.recentTorrents.map((item) => Number(item.id)));
    rows = [...state.recentTorrents, ...rows.filter((item) => !recentIds.has(Number(item.id)))];
    state.items['library'] = rows;
    state.offset['library'] = offset + rows.length;
    state.currentPage['library'] = page;

    if (container) {
      container.innerHTML = rows.length ? renderTorboxLibrary(rows) : empty('No Library items found.');
    }

    const count = $('#library-count');
    if (count) {
      count.textContent = rows.length ? `Showing ${rows.length} item${rows.length !== 1 ? 's' : ''}` : '';
      count.style.display = rows.length ? 'block' : 'none';
    }

    const pagContainer = document.getElementById('library-pagination');
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
    if (container) container.innerHTML = empty('Failed to load library.');
  }
}

// ── Search unified for movies/shows/music ──
export async function searchUnified(view) {
  const query = $(`#${view}-query`)?.value.trim() || '';

  if (query.length < 2) {
    resetViewState(view);
    return;
  }

  resetViewState(view);

  void doSearch(view, 1);
}

// ── Load title detail page ──
export async function loadTitle(imdbId, kind = 'movie') {
  try {
    setStatus('title', 'Loading…');
    const endpoint = kind === 'series' ? 'shows' : 'movies';
    const title = await jsonFetch(`/api/${endpoint}/${encodeURIComponent(imdbId)}`);

    const detailContent = $('#title-detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderTitleDetail(title);
      observeArtwork(detailContent);
    }
    setStatus('title', '');
  } catch (error) {
    const detailContent = $('#title-detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderTitleNotFound();
    }
    setStatus('title', error.message);
  }
}

// ── Load music release detail page ──
export async function loadMusicDetail(mbId) {
  try {
    setStatus('music-detail', 'Loading…');
    const release = await jsonFetch(`/api/music/${encodeURIComponent(mbId)}`);

    const detailContent = $('#music-detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderMusicDetail(release);
    }
    setStatus('music-detail', '');
  } catch (error) {
    const detailContent = $('#music-detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderMusicNotFound();
    }
    setStatus('music-detail', error.message);
  }
}

// ── Route from browser location ──
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

// ── Set browser route ──
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

// ── Search route navigation ──
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

// ── Load view ──
export async function loadView(view, reset = false) {
  if (reset) {
    resetViewState(view);
  }

  const supported = ['browse', 'movies', 'shows', 'music', 'library', 'calendar'];
  if (supported.includes(view)) {
    showView(view);

    if (view === 'calendar') {
      void loadCalendar();
      return;
    }

    if (view === 'library') {
      void loadLibraryPage(1);
      return;
    }

    const q = $(`#${view}-query`)?.value || '';
    if (!q || q.length < 2) {
      resetViewState(view);
      return;
    }

    setStatus(view, 'Loading…');
    try {
      void doSearch(view, 1);
    } catch (error) {
      setStatus(view, error.message);
    }
  }
}

// ── Show the requested view ──
export function showView(viewName) {
  document.querySelectorAll('.view').forEach(node => {
    node.classList.toggle('active', node.id === `view-${viewName}`);
  });
}

// ── Load calendar ──
export async function loadCalendar() {
  try {
    setStatus('calendar', 'Loading…');
    const date = new Date().toISOString().slice(0, 10);
    const data = await jsonFetch(`/api/calendar?date=${date}`);
    state.calendarData = data;
    const container = $('#calendar-results');
    if (container) {
      container.innerHTML = renderCalendar();
    }
    const summary = $('#calendar-summary');
    if (summary && data.episodes) {
      summary.textContent = `\${data.episodes.length} episode\${data.episodes.length !== 1 ? 's' : ''}`;
    }
    setStatus('calendar', '');
  } catch (error) {
    setStatus('calendar', error.message);
  }
}

// ── Shift calendar day ──
export async function shiftCalendarDay(offset) {
  try {
    setStatus('calendar', 'Loading…');
    const today = new Date();
    today.setDate(today.getDate() + offset);
    const date = today.toISOString().slice(0, 10);
    const data = await jsonFetch(`/api/calendar?date=${date}`);
    state.calendarData = data;
    const container = $('#calendar-results');
    if (container) {
      container.innerHTML = renderCalendar();
    }
    const summary = $('#calendar-summary');
    if (summary && data.episodes) {
      summary.textContent = `\${data.episodes.length} episode\${data.episodes.length !== 1 ? 's' : ''}`;
    }
    setStatus('calendar', '');
  } catch (error) {
    setStatus('calendar', error.message);
  }
}

// ── Pagination click handler (all views) ──
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const btn = target.closest('.tb-pagination-btn[data-page]');
  if (!btn || btn.disabled) return;

  // Determine which pagination container was clicked
  const container = btn.closest('[id$="-pagination"]');
  if (!container) return;

  const pagId = container.id;
  let viewKey = '';

  if (pagId === 'library-pagination') {
    viewKey = 'library';
  } else if (pagId === 'browse-pagination') {
    viewKey = 'browse';
  } else if (pagId === 'movies-pagination') {
    viewKey = 'movies';
  } else if (pagId === 'shows-pagination') {
    viewKey = 'shows';
  } else if (pagId === 'music-pagination') {
    viewKey = 'music';
  } else {
    return;
  }

  event.preventDefault();
  const page = parseInt(btn.dataset.page);
  if (page >= 1) {
    if (viewKey === 'library') {
      void loadLibraryPage(page);
    } else {
      void goToPage(viewKey, page);
    }
  }
});

// ── Popstate ──
window.addEventListener('popstate', routeFromLocation);
