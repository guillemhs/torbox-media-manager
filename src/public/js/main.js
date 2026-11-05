import { state, $, esc, artworkObserver, observeArtwork } from './state.js';
import { jsonFetch } from './api.js';
import {
  renderPagination, renderSearchItem, renderSearchResults,
  renderBrowseTorrentSearchResults, renderBrowseUsenetSearchResults,
  renderCandidateRows, renderTorboxLibrary,
} from './render.js';
import {
  getSelectedIndexers, getUsenetSource, goToPage, doSearch, searchUnified,
  loadView, loadCalendar, shiftCalendarDay,
  routeFromLocation, setRoute, searchRoute,
} from './views.js';

// ---- Search button handlers ----
document.getElementById('browse-search-btn')?.addEventListener('click', () => {
  void doSearch('browse', 1);
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
  void doSearch('movies', 1);
});
document.getElementById('shows-discover-btn')?.addEventListener('click', () => {
  state.showsSearched = false;
  void doSearch('shows', 1);
});
document.getElementById('music-discover-btn')?.addEventListener('click', () => {
  state.musicSearched = false;
  void doSearch('music', 1);
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
    void (async () => {
      try {
        await jsonFetch('/torbox/torrents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ magnet, name, addOnlyIfCached: false }),
        });
        alert('Added to Torbox');
      } catch (error) {
        alert(error.message);
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
    void (async () => {
      try {
        await jsonFetch('/torbox/usenet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, id, name, addOnlyIfCached: false }),
        });
        alert('Added to Torbox');
      } catch (error) {
        alert(error.message);
      }
    })();
    return;
  }
});

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

initHamburgerMenu();

// ---- Popstate ----
window.addEventListener('popstate', routeFromLocation);

// ---- Initialize ----
routeFromLocation();
