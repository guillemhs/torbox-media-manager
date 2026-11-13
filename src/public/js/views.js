import { state, $, esc, setStatus, empty, observeArtwork } from './state.js';
import { jsonFetch } from './api.js';
import {
  renderPaginationHtml, renderSearchResults, renderSearchItem,
  renderTorboxLibrary, renderCalendar, renderSkeletonGrid as renderSkel,
  renderTitleDetail, renderTitleNotFound, renderMusicDetail, renderMusicNotFound,
  renderTvmazeShow, renderTvmazeShowNotFound,
} from './render.js';

let calendarRequest = 0;

// ── Reflect the current page in the URL (?page=N) without triggering navigation ──
export function setPageParam(page, query) {
  const params = new URLSearchParams(location.search);
  if (page > 1) params.set('page', String(page));
  else params.delete('page');
  if (typeof query === 'string' && query) params.set('q', query);
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
}


// ── Loading skeleton / empty-state containers per view ──
function showSkeletons(view, kind) {
  const skel = $(`#${view}-skeletons`);
  if (skel) {
    skel.innerHTML = renderSkel(8, kind);
    skel.classList.remove('hidden');
  }
  const emptyEl = $(`#${view}-empty`);
  if (emptyEl) emptyEl.classList.add('hidden');
  const results = $(`#${view}-results`);
  if (results) results.innerHTML = '';
}

function hideSkeletons(view) {
  const skel = $(`#${view}-skeletons`);
  if (skel) {
    skel.classList.add('hidden');
    skel.innerHTML = '';
  }
}

function showEmpty(view) {
  const emptyEl = $(`#${view}-empty`);
  if (emptyEl) emptyEl.classList.remove('hidden');
}

function hideEmpty(view) {
  const emptyEl = $(`#${view}-empty`);
  if (emptyEl) emptyEl.classList.add('hidden');
}

// ── Get selected source(s) (Indexers/Usenet with sub-type) ──
// Returns all checked checkboxes as arrays
const INDEXER_ALL = ['prowlarr', 'torrentio'];
const USENET_ALL = ['NZBGeek', 'NZBIndex', 'Binsearch'];
// Map from lowercase sub-type values (as appear in HTML) to canonical names
const USENET_CANONICAL = { nzbgeek: 'NZBGeek', nzbindex: 'NZBIndex', binsearch: 'Binsearch' };

function syncAllToChildren(name, group, children, checked) {
  children.forEach(subType => {
    document.querySelectorAll(`input[name="${name}"][value="${group}:${subType.toLowerCase()}"]`)
      .forEach(cb => { cb.checked = checked; });
  });
}

// Wire every "*:all" checkbox so toggling it checks/unchecks its children,
// and checking all children re-checks the "all" box.
export function initSourceCheckboxes() {
  document.querySelectorAll('input[type="checkbox"][name$="-source"]').forEach(cb => {
    const [type, subType] = cb.value.split(':');
    if (subType !== 'all') return;
    cb.addEventListener('change', () => {
      if (type === 'indexers') syncAllToChildren(cb.name, 'indexers', INDEXER_ALL, cb.checked);
      if (type === 'usenet') syncAllToChildren(cb.name, 'usenet', USENET_ALL, cb.checked);
    });
  });

  // When a child is toggled manually, update the "all" box to match.
  document.querySelectorAll('input[type="checkbox"][name$="-source"]').forEach(cb => {
    const [type, subType] = cb.value.split(':');
    if (subType === 'all') return;
    cb.addEventListener('change', () => {
      const allChildren = type === 'indexers' ? INDEXER_ALL : type === 'usenet' ? USENET_ALL : [];
      if (!allChildren.length) return;
      const allBox = document.querySelector(`input[name="${cb.name}"][value="${type}:all"]`);
      if (!allBox) return;
      const childBoxes = allChildren.map(s => document.querySelector(`input[name="${cb.name}"][value="${type}:${s.toLowerCase()}"]`));
      allBox.checked = childBoxes.every(box => box && box.checked);
    });
  });
}

// Initialize children from the "all" state on load (indexers:all starts checked).
function initSourceCheckboxStates() {
  document.querySelectorAll('input[type="checkbox"][name$="-source"][value$="all"]').forEach(allBox => {
    const [type] = allBox.value.split(':');
    if (type === 'indexers') syncAllToChildren(allBox.name, 'indexers', INDEXER_ALL, allBox.checked);
    if (type === 'usenet') syncAllToChildren(allBox.name, 'usenet', USENET_ALL, allBox.checked);
  });
}

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
        INDEXER_ALL.forEach(s => { if (!indexers.includes(s)) indexers.push(s); });
      } else {
        if (!indexers.includes(subType)) indexers.push(subType);
      }
    }

    if (type === 'usenet') {
      if (!sources.includes('usenet')) sources.push('usenet');
      if (subType === 'all') {
        USENET_ALL.forEach(s => { if (!usenetSource.includes(s)) usenetSource.push(s); });
      } else {
        // Normalize lowercase subType to canonical name (e.g. nzbgeek -> NZBGeek)
        const canonical = USENET_CANONICAL[subType];
        if (canonical && !usenetSource.includes(canonical)) usenetSource.push(canonical);
        else if (!usenetSource.includes(subType)) usenetSource.push(subType);
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
  hideSkeletons(view);
  hideEmpty(view);
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
  setPageParam(page, query);

  // Show skeletons while loading
  const container = $(`#${view}-results`);
  showSkeletons(view, view === 'music' ? 'music' : 'movie');
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

    hideSkeletons(view);
    if (container) {
      container.innerHTML = rows.length ? rows.map((item, idx) => renderSearchItem(item, idx)).join('') : '';
      observeArtwork(container);
    }
    if (rows.length) hideEmpty(view); else showEmpty(view);

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

    const warnList = Array.isArray(data.warnings) ? data.warnings : [];
    setStatus(view, warnList.length ? '⚠ ' + warnList.join(' · ') : '');
  } catch (error) {
    setStatus(view, error.message);
    hideSkeletons(view);
    if (container) container.innerHTML = '';
    showEmpty(view);
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
  setPageParam(page, query);
  state.currentPage[view] = page;
  state.searchMode[view] = 'discover';

  const container = $(`#${view}-results`);
  showSkeletons(view, view === 'music' ? 'music' : 'movie');
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

    hideSkeletons(view);
    if (container) {
      container.innerHTML = local.length ? local.map((item, idx) => renderSearchItem(item, idx)).join('') : '';
      observeArtwork(container);
    }
    if (local.length) hideEmpty(view); else showEmpty(view);

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
  const LIBRARY_PAGE_SIZE = 20;
  setPageParam(page);

  const container = $('#library-results');
  showSkeletons('library', 'movie');
  setStatus('library', 'Loading…');

  try {
    // Fetch ALL library items (backend returns everything; client paginates)
    const data = await jsonFetch(`/library`);
    let rows = data.torbox || [];
    const recentIds = new Set(state.recentTorrents.map((item) => Number(item.id)));
    rows = [...state.recentTorrents, ...rows.filter((item) => !recentIds.has(Number(item.id)))];

    // Store ALL items for client-side pagination/filter/sort
    state.items['library'] = rows;
    state.currentPage['library'] = page;
    state.libraryPageSize = LIBRARY_PAGE_SIZE;

    hideSkeletons('library');
    renderLibraryPage(page);

    const count = $('#library-count');
    if (count) {
      count.textContent = rows.length ? `Showing ${rows.length} item${rows.length !== 1 ? 's' : ''} (total ${rows.length})` : '';
      count.style.display = rows.length ? 'block' : 'none';
    }

    const pagContainer = document.getElementById('library-pagination');
    if (pagContainer) {
      const totalPages = Math.max(1, Math.ceil(rows.length / LIBRARY_PAGE_SIZE));
      if (totalPages > 1) {
        pagContainer.classList.remove('hidden');
        pagContainer.innerHTML = renderPaginationHtml('library', rows.length, page, LIBRARY_PAGE_SIZE);
      } else {
        pagContainer.classList.add('hidden');
        pagContainer.innerHTML = '';
      }
    }

    setStatus('library', data.usenetError ? `TorBox Usenet list unavailable: ${data.usenetError}` : '');
  } catch (error) {
    setStatus('library', error.message);
    hideSkeletons('library');
    if (container) container.innerHTML = '';
    showEmpty('library');
  }
}

/** Render the current library page (client-side pagination + filter + sort). */
export function renderLibraryPage(page = 1) {
  const LIBRARY_PAGE_SIZE = state.libraryPageSize || 20;
  const container = $('#library-results');
  if (!container) return;

  const allItems = state.items['library'] || [];
  const query = $('#library-query')?.value.trim().toLocaleLowerCase() || '';
  const sort = $('#library-sort')?.value || 'created';
  const filter = $('#library-filter')?.value || 'all';

  const videoExt = /\.(?:mp4|m4v|mkv|avi|mov|wmv|flv|webm|mpeg|mpg|ts)/;
  const audioExt = /\.(?:mp3|wav|flac|m4a|aac|ogg|opus|wma|alac|ape)$/i;

  let filtered = allItems.filter((item) => {
    const name = item.name || item.title || item.original_name || '';
    if (query && !name.toLocaleLowerCase().includes(query)) return false;
    const ext = item.extension || item.file_extension || '';
    if (filter === 'video' && !videoExt.test(ext)) return false;
    if (filter === 'music' && !audioExt.test(ext)) return false;
    if (filter === 'other' && (videoExt.test(ext) || audioExt.test(ext))) return false;
    return true;
  });

  if (sort === 'name') filtered.sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
  else if (sort === 'size') filtered.sort((a, b) => (b.bytes || b.size || 0) - (a.bytes || a.size || 0));
  else if (sort === 'status') filtered.sort((a, b) => (b.download_state || b.status || '').localeCompare(a.download_state || a.status || ''));
  else filtered.sort((a, b) => (b.created || b.created_at || b.added || b.created_at || 0) - (a.created || a.created_at || a.added || b.created_at || 0));

  const total = filtered.length;
  const offset = (page - 1) * LIBRARY_PAGE_SIZE;
  const pageItems = filtered.slice(offset, offset + LIBRARY_PAGE_SIZE);

  container.innerHTML = pageItems.length ? renderTorboxLibrary(pageItems) : '';

  if (pageItems.length) hideEmpty('library'); else showEmpty('library');

  const count = $('#library-count');
  if (count) {
    count.textContent = total ? `Showing ${pageItems.length} of ${total} item${total !== 1 ? 's' : ''}` : '';
    count.style.display = total ? 'block' : 'none';
  }

  const pagContainer = document.getElementById('library-pagination');
  if (pagContainer) {
    const totalPages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
    if (totalPages > 1) {
      pagContainer.classList.remove('hidden');
      pagContainer.innerHTML = renderPaginationHtml('library', total, page, LIBRARY_PAGE_SIZE);
    } else {
      pagContainer.classList.add('hidden');
      pagContainer.innerHTML = '';
    }
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

// ── Load TVMaze show detail page ──
export async function loadTvmazeShow(tvmazeId) {
  try {
    setStatus('tvmaze', 'Loading…');
    const show = await jsonFetch(`/tvmaze/shows/${encodeURIComponent(tvmazeId)}`);

    const detailContent = $('#tvmaze-detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderTvmazeShow(show);
      observeArtwork(detailContent);
    }
    setStatus('tvmaze', '');
  } catch (error) {
    const detailContent = $('#tvmaze-detail-content');
    if (detailContent) {
      detailContent.innerHTML = renderTvmazeShowNotFound();
    }
    setStatus('tvmaze', error.message);
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
    const tvmazeId = tvmazeMatch[1];
    showView('tvmaze');
    void loadTvmazeShow(tvmazeId);
    return;
  }

  const viewMap = {
    '': 'browse', browse: 'browse', movies: 'movies', shows: 'shows',
    music: 'music', 'music-detail': 'music-detail', tvmaze: 'tvmaze',
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

    const urlParams = new URLSearchParams(location.search);
    const pageParam = Math.max(1, Number(urlParams.get('page')) || 1);

    if (view === 'library') {
      void loadLibraryPage(pageParam);
      return;
    }

    // Restore the search box from ?q= so a shared/refreshed URL re-runs the search.
    const input = $(`#${view}-query`);
    const urlQ = urlParams.get('q');
    if (input && urlQ && !input.value.trim()) input.value = urlQ;

    const q = $(`#${view}-query`)?.value || '';
    if (!q || q.length < 2) {
      resetViewState(view);
      return;
    }

    setStatus(view, 'Loading…');
    try {
      void doSearch(view, pageParam);
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
    const dateInput = $('#calendar-date');
    if (dateInput) dateInput.value = date;
    const data = await jsonFetch(`/api/calendar?date=${date}`);
    state.calendarData = data;
    populateCalendarPlatforms(data);
    const container = $('#calendar-results');
    if (container) {
      container.innerHTML = renderCalendar();
    }
    const summary = $('#calendar-summary');
    if (summary && data.episodes) {
      summary.textContent = `${data.episodes.length} episode${data.episodes.length !== 1 ? 's' : ''}`;
    }
    setStatus('calendar', '');
  } catch (error) {
    setStatus('calendar', error.message);
  }
}

/** Populate the platform dropdown with unique platforms from the calendar data. */
export function populateCalendarPlatforms(data) {
  const select = $('#calendar-platform');
  if (!select) return;
  const currentValue = select.value;
  const platforms = new Set();
  for (const ep of data.episodes || []) {
    const show = ep.show || {};
    const platform = show.network?.name || show.webChannel?.name || '';
    if (platform) platforms.add(platform);
  }
  // Rebuild options: keep 'all', then add sorted platforms
  const options = ['<option value="all">All</option>'];
  for (const p of [...platforms].sort()) {
    options.push(`<option value="${esc(p)}">${esc(p)}</option>`);
  }
  select.innerHTML = options.join('');
  // Restore previous selection if still available
  if (currentValue && currentValue !== 'all' && platforms.has(currentValue)) {
    select.value = currentValue;
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
    populateCalendarPlatforms(data);
    const container = $('#calendar-results');
    if (container) {
      container.innerHTML = renderCalendar();
    }
    const summary = $('#calendar-summary');
    if (summary && data.episodes) {
      summary.textContent = `${data.episodes.length} episode${data.episodes.length !== 1 ? 's' : ''}`;
    }
    setStatus('calendar', '');
  } catch (error) {
    setStatus('calendar', error.message);
  }
}

// ── Calendar date picker handler ──
document.getElementById('calendar-date')?.addEventListener('change', (event) => {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  if (!target || !target.value) return;
  setStatus('calendar', 'Loading…');
  void (async () => {
    try {
      const data = await jsonFetch(`/api/calendar?date=${target.value}`);
      state.calendarData = data;
      populateCalendarPlatforms(data);
      const container = $('#calendar-results');
      if (container) {
        container.innerHTML = renderCalendar();
      }
      const summary = $('#calendar-summary');
      if (summary && data.episodes) {
        summary.textContent = `${data.episodes.length} episode${data.episodes.length !== 1 ? 's' : ''}`;
      }
      setStatus('calendar', '');
    } catch (error) {
      setStatus('calendar', error.message);
    }
  })();
});

// ── Calendar platform filter handler ──
document.getElementById('calendar-platform')?.addEventListener('change', () => {
  const container = $('#calendar-results');
  if (container) {
    container.innerHTML = renderCalendar();
  }
});

// ── Calendar search input handler ──
document.getElementById('calendar-query')?.addEventListener('input', () => {
  const container = $('#calendar-results');
  if (container) {
    container.innerHTML = renderCalendar();
  }
});

// ── Calendar search button handler ──
document.getElementById('calendar-search-btn')?.addEventListener('click', () => {
  const container = $('#calendar-results');
  if (container) {
    container.innerHTML = renderCalendar();
  }
});

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

// ── Library files expand/collapse ──
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const header = target.closest('.library-files-header');
  if (!header) return;
  event.preventDefault();
  const fileList = header.parentElement?.querySelector('.library-file-list');
  const toggle = header.querySelector('.library-files-toggle');
  if (!fileList || !toggle) return;
  const isCollapsed = fileList.classList.contains('collapsed');
  if (isCollapsed) {
    fileList.classList.remove('collapsed');
    header.classList.add('expanded');
    toggle.textContent = '▼';
  } else {
    fileList.classList.add('collapsed');
    header.classList.remove('expanded');
    toggle.textContent = '▶';
  }
});

// ── Source checkbox "all" <-> children sync ──
initSourceCheckboxStates();
initSourceCheckboxes();
