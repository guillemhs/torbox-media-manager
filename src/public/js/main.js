import { state, $, esc, artworkObserver, observeArtwork, showModal, showToast } from './state.js';
import { jsonFetch } from './api.js';
import {
  renderSearchItem, renderTorboxLibrary,
} from './render.js';
import {
  getSelectedSource, goToPage, doSearch, searchLocal,
  searchUnified, loadView, loadCalendar, shiftCalendarDay,
  routeFromLocation, setRoute, searchRoute, loadLibraryPage, loadTitle, loadMusicDetail,
} from './views.js';

// ---- Search button handlers ----
document.getElementById('browse-search-btn')?.addEventListener('click', () => {
  void doSearch('browse', 1);
});

document.getElementById('browse-discover-btn')?.addEventListener('click', () => {
  void searchLocal('browse', 1);
});

document.getElementById('movies-search-btn')?.addEventListener('click', () => {
  state.moviesSearched = true;
  void doSearch('movies', 1);
});

document.getElementById('shows-search-btn')?.addEventListener('click', () => {
  state.showsSearched = true;
  void doSearch('shows', 1);
});

document.getElementById('music-search-btn')?.addEventListener('click', () => {
  state.musicSearched = true;
  void doSearch('music', 1);
});

// ---- Discover button handlers ----
document.getElementById('movies-discover-btn')?.addEventListener('click', () => {
  state.moviesSearched = false;
  void searchLocal('movies', 1);
});

document.getElementById('shows-discover-btn')?.addEventListener('click', () => {
  state.showsSearched = false;
  void searchLocal('shows', 1);
});

document.getElementById('music-discover-btn')?.addEventListener('click', () => {
  state.musicSearched = false;
  void searchLocal('music', 1);
});

// ---- Link interception ----
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('button')) return;
  const link = target.closest('a[href]');
  if (link) {
    const href = link.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('//')) {
      event.preventDefault();
      setRoute(href);
      return;
    }
  }
});

// ---- Torrent add/copy buttons (delegated) ----
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const addBtn = target.closest('[data-add-torrent]');
  if (addBtn) {
    event.preventDefault();
    const magnet = decodeURIComponent(addBtn.dataset.addTorrent);
    const name = addBtn.dataset.torrentName || '';
    const originalText = addBtn.innerHTML;
    addBtn.innerHTML = '<i class="fas fa-check"></i> Added';
    addBtn.classList.replace('btn-tb-primary', 'btn-tb-secondary');
    addBtn.disabled = true;
    void (async () => {
      try {
        await jsonFetch('/torbox/torrents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ magnet, name, addOnlyIfCached: false }),
        });
        showToast('Added to TorBox');
        setTimeout(() => {
          if (addBtn.isConnected) {
            addBtn.innerHTML = originalText;
            addBtn.classList.replace('btn-tb-secondary', 'btn-tb-primary');
            addBtn.disabled = false;
          }
        }, 1500);
      } catch (error) {
        showToast(error.message, 'error');
        addBtn.innerHTML = originalText;
        addBtn.classList.replace('btn-tb-secondary', 'btn-tb-primary');
        addBtn.disabled = false;
      }
    })();
    return;
  }

  const copyBtn = target.closest('[data-copy-magnet]');
  if (copyBtn) {
    event.preventDefault();
    const magnet = decodeURIComponent(copyBtn.dataset.copyMagnet);
    copyBtn.disabled = true;
    copyBtn.textContent = 'Copying…';
    void (async () => {
      try {
        await navigator.clipboard.writeText(magnet);
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          if (copyBtn.isConnected) copyBtn.textContent = 'Copy magnet';
          copyBtn.disabled = false;
        }, 1500);
      } catch {
        const field = document.createElement('textarea');
        field.value = magnet;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        copyBtn.textContent = copied ? 'Copied' : 'Copy failed';
        copyBtn.disabled = false;
        setTimeout(() => {
          if (copyBtn.isConnected) copyBtn.textContent = 'Copy magnet';
        }, 1500);
      }
    })();
    return;
  }

  const usenetBtn = target.closest('[data-usenet-add]');
  if (usenetBtn) {
    event.preventDefault();
    const name = usenetBtn.dataset.usenetAdd;
    const id = usenetBtn.dataset.usenetId || '';
    const source = usenetBtn.dataset.usenetSource;
    const originalText = usenetBtn.innerHTML;
    usenetBtn.innerHTML = '<i class="fas fa-check"></i> Added';
    usenetBtn.classList.replace('btn-tb-primary', 'btn-tb-secondary');
    usenetBtn.disabled = true;
    void (async () => {
      try {
        await jsonFetch('/torbox/usenet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, id, name, addOnlyIfCached: false }),
        });
        showToast('Added to TorBox');
        setTimeout(() => {
          if (usenetBtn.isConnected) {
            usenetBtn.innerHTML = originalText;
            usenetBtn.classList.replace('btn-tb-secondary', 'btn-tb-primary');
            usenetBtn.disabled = false;
          }
        }, 1500);
      } catch (error) {
        showToast(error.message, 'error');
        usenetBtn.innerHTML = originalText;
        usenetBtn.classList.replace('btn-tb-secondary', 'btn-tb-primary');
        usenetBtn.disabled = false;
      }
    })();
    return;
  }

  const pipelineBtn = target.closest('[data-usenet-pipeline]');
  if (pipelineBtn) {
    event.preventDefault();
    const name = decodeURIComponent(pipelineBtn.dataset.usenetPipeline);
    const id = pipelineBtn.dataset.usenetId || '';
    const source = pipelineBtn.dataset.usenetSource;
    const originalText = pipelineBtn.innerHTML;
    pipelineBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Pipeline…';
    pipelineBtn.classList.replace('btn-tb-secondary', 'btn-tb-outline');
    pipelineBtn.disabled = true;
    void (async () => {
      try {
        // Step 1: Run the full pipeline
        const response = await jsonFetch('/usenet/pipeline/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: name,
            nzbId: id,
            category: undefined,
            fileName: name,
          }),
        });
        const job = response.job || response;
        showToast('Pipeline started: ' + job.id);

        // Step 2: Poll for completion
        let status = job.status;
        let logs = job.logs || [];
        while (status === 'queued' || status === 'searching' || status === 'downloading-nzb' || status === 'assembling' || status === 'uploading' || status === 'cleaning-up') {
          await new Promise((r) => setTimeout(r, 3000));
          const statusResp = await jsonFetch(`/usenet/pipeline/status/${encodeURIComponent(job.id)}`);
          const currentJob = statusResp.job;
          status = currentJob.status;
          logs = currentJob.logs || logs;
          if (currentJob.error) {
            showToast('Pipeline failed: ' + currentJob.error, 'error');
            break;
          }
        }

        if (status === 'completed') {
          showToast('Pipeline completed successfully');
        } else if (status === 'failed') {
          showToast('Pipeline failed', 'error');
        }
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        if (pipelineBtn.isConnected) {
          pipelineBtn.innerHTML = originalText;
          pipelineBtn.classList.replace('btn-tb-outline', 'btn-tb-secondary');
          pipelineBtn.disabled = false;
        }
      }
    })();
    return;
  }

  const viewDetailBtn = target.closest('[data-view-detail]');
  if (viewDetailBtn) {
    event.preventDefault();
    const imdbId = viewDetailBtn.dataset.viewDetail;
    const kind = viewDetailBtn.dataset.viewKind || 'movie';
    if (kind === 'music') {
      setRoute(`/music/release/${encodeURIComponent(imdbId)}`);
    } else {
      setRoute(`/title/${encodeURIComponent(imdbId)}?kind=${kind}`);
    }
    return;
  }
});

// ---- Fetch API status on load ----
async function fetchApiStatus() {
  try {
    const data = await jsonFetch('/health');
    const statusEl = $('#app-status');
    const badgeEl = $('#api-status-badge');
    if (data.mode === 'torbox-integrated') {
      if (statusEl) {
        statusEl.textContent = '● Online';
        statusEl.classList.replace('status-offline', 'status-online');
        statusEl.classList.add('status-online');
      }
      if (badgeEl) {
        badgeEl.textContent = 'API Key Connected';
        badgeEl.classList.replace('missing', 'connected');
        badgeEl.classList.add('connected');
      }
    } else {
      if (statusEl) {
        statusEl.textContent = '● Offline';
        statusEl.classList.replace('status-online', 'status-offline');
        statusEl.classList.add('status-offline');
      }
      if (badgeEl) {
        badgeEl.textContent = 'API Key Missing';
        badgeEl.classList.add('missing');
      }
    }
  } catch (error) {
    const statusEl = $('#app-status');
    const badgeEl = $('#api-status-badge');
    if (statusEl) statusEl.textContent = '● Offline';
    if (badgeEl) {
      badgeEl.textContent = 'API Key Missing';
      badgeEl.classList.add('missing');
    }
  }
}

// ---- Hamburger menu ----
function initHamburgerMenu() {
  const hamburgerBtn = document.getElementById('hamburger-menu');
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (!hamburgerBtn || !sidebar || !overlay) return;

  function closeSidebar() {
    const wasOpen = sidebar.classList.contains('open');
    if (!wasOpen) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.classList.remove('sidebar-open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleSidebar() {
    const isOpen = sidebar.classList.toggle('open');
    overlay.classList.toggle('visible', isOpen);
    document.body.classList.toggle('sidebar-open', isOpen);
    hamburgerBtn.setAttribute('aria-expanded', isOpen);
  }

  hamburgerBtn.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', toggleSidebar);

  sidebar.querySelectorAll('[data-view]').forEach((item) => {
    item.addEventListener('click', closeSidebar);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 760) closeSidebar();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });

  window.closeSidebar = closeSidebar;
}

void fetchApiStatus();
initHamburgerMenu();

// ---- Popstate ----
window.addEventListener('popstate', routeFromLocation);

// ---- Initialize ----
routeFromLocation();
