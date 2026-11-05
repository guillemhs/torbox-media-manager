import { state, $, esc, fmtBytes, empty, observeArtwork } from './state.js';

// Source tag helper
export function sourceTag(source, contentType) {
  const sourceLabel = source || 'Unknown';
  const tooltipText = contentType || 'All';
  return `<span class="source-tag" title="${esc(tooltipText)}">${esc(sourceLabel)}</span>`;
}

// Pagination rendering
export function renderPagination(viewKey, paginationId) {
  const container = document.getElementById(paginationId);
  if (!container) return;

  const total = state.total[viewKey] || 0;
  const limit = 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  let currentPage = state.currentPage[viewKey] || 1;
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  state.totalPages[viewKey] = totalPages;
  state.currentPage[viewKey] = currentPage;

  if (totalPages <= 1) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');

  let pages = [];
  const showMax = 5;

  if (totalPages <= showMax) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  let html = `<span class="pagination-info">Page <strong>${currentPage}</strong> of ${totalPages} (${total} results)</span> `;
  html += `<button class="btn btn-outline-secondary btn-sm pagination-btn${currentPage === 1 ? ' disabled' : ''}" data-page="1" aria-label="First page">First</button> `;
  html += `<button class="btn btn-outline-secondary btn-sm pagination-btn${currentPage === 1 ? ' disabled' : ''}" data-page="${currentPage - 1}" aria-label="Previous page">&lsaquo;</button> `;

  for (const page of pages) {
    if (page === '...') {
      html += '<span class="pagination-ellipsis">…</span> ';
    } else {
      html += `<button class="btn btn-outline-secondary btn-sm pagination-btn${page === currentPage ? ' active' : ''}" data-page="${page}">${page}</button> `;
    }
  }

  html += `<button class="btn btn-outline-secondary btn-sm pagination-btn${currentPage === totalPages ? ' disabled' : ''}" data-page="${currentPage + 1}" aria-label="Next page">&rsaquo;</button> `;
  html += `<button class="btn btn-outline-secondary btn-sm pagination-btn" data-page="${totalPages}" aria-label="Last page">Last</button>`;

  container.innerHTML = html;

  container.querySelectorAll('.pagination-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (page >= 1 && page <= totalPages && page !== currentPage) {
        // goToPage is imported dynamically to avoid circular dependency
        import('./views.js').then(({ goToPage }) => goToPage(viewKey, page));
      }
    });
  });
}

// Render a single search result item
export function renderSearchItem(item, idx) {
  const source = item._source || item.source || 'Unknown';
  const isTorrent = item._source === 'torrents';
  const isUsenet = item._source === 'usenet';
  const isLocal = item._source !== 'torrents' && item._source !== 'usenet';

  const kind = item.kind || (item.titleType && /^tv/i.test(item.titleType) ? 'series' : 'movie');
  const contentType = isTorrent ? (kind === 'series' ? 'Show' : 'Movie') : (isUsenet ? 'Usenet' : 'All');

  const title = item.primaryTitle || item.name || item.title || 'Unknown';
  const year = item.startYear || item.year || 'Year unknown';
  const titleType = item.titleType || item.type || 'Unknown';

  const size = item.size ? fmtBytes(item.size) : '';
  const seeders = item.seeders !== null && item.seeders !== undefined ? `${Number(item.seeders).toLocaleString()} seeders` : '';
  const leechers = item.leechers !== null && item.leechers !== undefined ? `${Number(item.leechers).toLocaleString()} leechers` : '';
  const posted = item.posted ? new Date(item.posted * 1000).toLocaleDateString() : '';
  const complete = item.complete === false ? 'incomplete' : '';

  const metaParts = [size, seeders, leechers, posted, complete, source && !isLocal ? sourceTag(source, contentType) : ''].filter(Boolean);
  const meta = metaParts.join(' · ');

  const categoryTag = isTorrent ? `<span class="category-tag">${contentType}</span>` : (isUsenet ? '<span class="category-tag">Usenet</span>' : '');
  const sourceTagHtml = isLocal ? '' : sourceTag(source, contentType);

  const route = item.imdbId ? `/title/${encodeURIComponent(item.imdbId)}?kind=${kind}` : '#';

  let actionButtons = '';
  if (isTorrent && item.magnet) {
    actionButtons = `
      <button class="btn btn-secondary btn-sm" data-copy-magnet="${encodeURIComponent(item.magnet)}" title="Copy magnet link">Copy</button>
      <button class="btn btn-secondary btn-sm" data-add-torrent="${encodeURIComponent(item.magnet)}" data-torrent-name="${esc(title)}" data-cached-only="false" title="Add to TorBox (download if needed)">Add</button>
      ${item.downloadToken ? `<a class="btn btn-secondary btn-sm" href="/torrents/download/${encodeURIComponent(item.downloadToken)}" download="${esc(title)}.torrent" title="Download .torrent file">.torrent</a>` : ''}
      <button class="btn btn-primary btn-sm" data-add-torrent="${encodeURIComponent(item.magnet)}" data-torrent-name="${esc(title)}" data-cached-only="true" title="Add to TorBox only if cached (instant)">Cached</button>
    `;
  } else if (isUsenet) {
    actionButtons = `<button class="btn btn-primary btn-sm" data-usenet-add="${encodeURIComponent(item.name)}" data-usenet-source="${esc(source)}" title="Add to TorBox">Add to TorBox</button>`;
  }

  return `<article class="search-result-item">
    <a class="search-result-link" href="${route}" aria-label="Open ${esc(title)} details">
      <div class="search-result-header">
        <div class="search-result-title">${esc(title)}</div>
        <div class="search-result-year-type">${esc(year)} · ${esc(titleType)}</div>
        ${categoryTag}
      </div>
      ${meta ? `<div class="search-result-meta">${esc(meta)}</div>` : ''}
      ${sourceTagHtml ? `<div class="search-result-source">${sourceTagHtml}</div>` : ''}
    </a>
    ${actionButtons ? `<div class="search-result-actions">${actionButtons}</div>` : ''}
  </article>`;
}

export function renderSearchResults(container, items) {
  if (!container) return;
  container.innerHTML = items.length ? items.map((item, idx) => renderSearchItem(item, idx)).join('') : empty('No results found.');
}

// Torrent search results (browse)
export function renderBrowseTorrentSearchResults(candidates, total) {
  const titleEl = document.getElementById('browse-torrent-search-title');
  if (titleEl) {
    if (candidates.length === 0 && total === 0) {
      titleEl.style.display = 'none';
    } else if (candidates.length === 0) {
      titleEl.style.display = 'block';
      titleEl.textContent = 'Torrent Search Results - No results found';
    } else {
      titleEl.style.display = 'block';
      titleEl.textContent = `Torrent Search Results (${candidates.length} of ${total})`;
    }
  }

  const resultsContainer = document.getElementById('browse-torrent-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = candidates.length ? candidates.map(renderSearchItem).join('') : empty('No torrent candidates found.');
    resultsContainer.querySelectorAll('[data-add-torrent]').forEach((button) => {
      button.onclick = async () => {
        const magnet = decodeURIComponent(button.dataset.addTorrent);
        const name = button.dataset.torrentName || '';
        button.disabled = true;
        button.textContent = 'Adding…';
        try {
          const data = await fetch('/torbox/torrents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magnet, name, addOnlyIfCached: true }),
          }).then((r) => r.json());
          button.textContent = 'Added';
          setTimeout(() => {
            button.textContent = 'Add cached';
            button.disabled = false;
          }, 1500);
          import('./views.js').then(({ loadView }) => {
            pinRecentTorrent(data.torrent);
            loadView('library', true);
          });
        } catch (error) {
          button.textContent = 'Add cached';
          button.disabled = false;
          alert(error.message);
        }
      };
    });
  }

  const moreBtn = document.getElementById('browse-torrent-more');
  if (moreBtn) moreBtn.classList.toggle('hidden', candidates.length >= total);
  renderPagination('browse-torrent-search', 'browse-torrent-pagination');
}

// Usenet search results (browse)
export function renderBrowseUsenetSearchResults(candidates, total) {
  const titleEl = document.getElementById('browse-usenet-search-title');
  if (titleEl) {
    if (candidates.length === 0 && total === 0) {
      titleEl.style.display = 'none';
    } else if (candidates.length === 0) {
      titleEl.style.display = 'block';
      titleEl.textContent = 'Usenet Search Results - No results found';
    } else {
      titleEl.style.display = 'block';
      titleEl.textContent = `Usenet Search Results (${candidates.length} of ${total})`;
    }
  }

  const resultsContainer = document.getElementById('browse-usenet-search-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = candidates.length ? candidates.map(renderSearchItem).join('') : empty('No usenet results found.');
    resultsContainer.querySelectorAll('[data-add-usenet]').forEach((button) => {
      button.onclick = async () => {
        const usenetData = JSON.parse(decodeURIComponent(button.dataset.addUsenet));
        button.disabled = true;
        button.textContent = 'Adding…';
        try {
          const result = await fetch('/torbox/usenet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...usenetData, addOnlyIfCached: true }),
          }).then((r) => r.json());
          button.textContent = 'Added';
          setTimeout(() => {
            button.textContent = 'Add to TorBox';
            button.disabled = false;
          }, 1500);
          import('./views.js').then(({ loadView }) => loadView('library', true));
        } catch (error) {
          button.disabled = false;
          button.textContent = 'Add to TorBox';
          alert(error.message);
        }
      };
    });
  }

  const moreBtn = document.getElementById('browse-usenet-search-more');
  if (moreBtn) moreBtn.classList.toggle('hidden', candidates.length >= total);
  renderPagination('browse-usenet-search', 'browse-usenet-search-pagination');
}

// Title cards for movies/shows
export function titleCards(items) {
  return items.map((item, index) => {
    const kind = /^tv/i.test(item.titleType || '') ? 'series' : 'movie';
    const imdbId = item.imdbId || item.id || '';
    const route = `/title/${encodeURIComponent(imdbId)}?kind=${kind}`;
    const source = item._source || item.source || 'Unknown';
    const isTorrent = item._source === 'torrents';
    const isUsenet = item._source === 'usenet';

    const title = item.primaryTitle || item.name || item.title || 'Unknown';
    const year = item.startYear || item.year || 'Year unknown';
    const size = item.size ? fmtBytes(item.size) : '';
    const seeders = item.seeders !== null && item.seeders !== undefined ? `${Number(item.seeders).toLocaleString()} seeders` : '';
    const leechers = item.leechers !== null && item.leechers !== undefined ? `${Number(item.leechers).toLocaleString()} leechers` : '';

    const metaParts = [size, seeders, leechers, source && !isTorrent && !isUsenet ? sourceTag(source, kind) : ''].filter(Boolean);

    return `<article class="card search-card">
      <div class="card-body">
        <div class="result-list-header">
          <a class="result-list-link" href="${route}">
            <div class="result-list-title">${esc(title)}</div>
            <div class="result-list-year-type">${esc(year)} · ${esc(item.titleType || item.type || 'Unknown')}</div>
          </a>
        </div>
        ${metaParts.length ? `<div class="result-list-meta">${metaParts.join(' · ')}</div>` : ''}
        <img class="card-img-top" loading="lazy" data-artwork-id="${esc(imdbId)}" data-artwork-kind="${esc(kind)}" alt="${esc(title)} poster" />
      </div>
    </article>`;
  }).join('');
}

// Music release cards
export function musicReleaseCards(releases) {
  return releases.map((item) => {
    const route = `/music/release/${encodeURIComponent(item.id)}?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist || '')}&date=${encodeURIComponent(item.date || '')}&type=${encodeURIComponent(item.type || 'Release')}`;
    return `<article class="card search-card">
      <div class="card-body">
        <div class="result-list-header">
          <a class="result-list-link" href="${route}">
            <div class="result-list-title">${esc(item.title)}</div>
            <div class="result-list-year-type">${esc(item.artist || 'Unknown artist')} · ${esc(item.date || '')}</div>
          </a>
        </div>
        <img class="card-img-top" loading="lazy" src="${esc(item.cover || '')}" alt="${esc(item.title)} cover" />
      </div>
    </article>`;
  }).join('');
}

// Local media cards
export function localCards(items) {
  return items.map((item) => `<article class="card"><div class="card-body"><div class="card-title">${esc(item.title)}</div><div class="card-text">${esc(item.type)} · ${esc(item.extension)} · ${fmtBytes(item.bytes)}</div></div></article>`).join('');
}

// TorBox library rendering
export function renderTorboxLibrary(items) {
  const query = $('#library-query')?.value.trim().toLocaleLowerCase() || '';
  const sort = $('#library-sort')?.value || 'created';
  const filter = $('#library-filter')?.value || 'all';
  const videoExt = /\.(?:mp4|m4v|mkv|avi|mov|wmv|flv|webm|m4v|mpeg|mpg|ts)/;

  let filtered = items.filter((item) => {
    const name = item.name || item.title || '';
    if (query && !name.toLocaleLowerCase().includes(query)) return false;
    if (filter === 'video' && !videoExt.test(item.extension || '')) return false;
    if (filter === 'music' && !/\.(?:mp3|wav|flac|m4a|aac|ogg|opus|wma|alac|ape)$/i.test(item.extension || '')) return false;
    if (filter === 'other' && videoExt.test(item.extension || '')) return false;
    return true;
  });

  if (sort === 'name') filtered.sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
  else if (sort === 'size') filtered.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  else if (sort === 'status') filtered.sort((a, b) => (b.download_state || '').localeCompare(a.download_state || ''));
  else filtered.sort((a, b) => (b.id || 0) - (a.id || 0));

  return filtered.map((item) => `<article class="library-item">
    <div class="library-item-main">
      <div class="library-item-title">${esc(item.name || item.title || 'Unknown')}</div>
      <div class="library-item-meta">${esc(item.extension || '')} · ${fmtBytes(item.bytes || 0)}</div>
    </div>
    <div class="library-state">${esc(item.download_state || 'unknown')}</div>
  </article>`).join('');
}

// Schedule cards for calendar
export function scheduleCards(episodes) {
  return episodes.map((ep) => {
    const show = ep.show || {};
    const image = show.image?.medium || ep.image?.medium || '';
    const season = Number(ep.season);
    const number = Number(ep.number);
    const code = season && number ? `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}` : '';
    return `<article class="episode-card">
      ${image ? `<img src="${esc(image)}" alt="${esc(show.name || '')} ${code}" />` : ''}
      <div class="episode-copy">
        <div class="episode-name">${esc(ep.name || 'Untitled')}</div>
        <div class="episode-time">${esc(ep.airtime || '')}</div>
        <div class="episode-meta">${esc(show.name || '')} ${code} · ${esc(show.network?.name || show.webChannel?.name || '')}</div>
        <div class="episode-summary">${esc(ep.summary || '').replace(/<[^>]*>/g, ' ')}</div>
      </div>
    </article>`;
  }).join('');
}

// Calendar rendering
export function renderCalendar() {
  const data = state.calendarData || { episodes: [] };
  const query = $('#calendar-query')?.value.trim().toLocaleLowerCase() || '';
  const platformSelect = $('#calendar-platform');
  if (!platformSelect) return;
  const selectedPlatform = platformSelect.value;
  const allEpisodes = Array.isArray(data.episodes) ? data.episodes : [];
  const platformOf = (ep) => String(ep.show?.webChannel?.name || ep.show?.network?.name || '').trim();
  const platforms = [...new Set(allEpisodes.map(platformOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  platformSelect.innerHTML = '<option value="">All channels and services</option>' + platforms.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if (platforms.includes(selectedPlatform)) platformSelect.value = selectedPlatform;
  const platform = platformSelect.value.toLocaleLowerCase();
  const episodes = allEpisodes.slice().sort((a, b) => String(a.airtime || a.airstamp || '99:99').localeCompare(String(b.airtime || b.airstamp || '99:99'))).filter((ep) => {
    const show = ep.show || {};
    const channel = platformOf(ep);
    const season = Number(ep.season), number = Number(ep.number);
    const code = season && number ? `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}` : '';
    const searchable = `${show.name || ''} ${ep.name || ''} ${code} ${channel} ${show.network?.country?.name || ''} ${plainText(ep.summary)}`.toLocaleLowerCase();
    return (!query || searchable.includes(query)) && (!platform || channel.toLocaleLowerCase() === platform);
  });
  const calRes = $('#calendar-results');
  if (calRes) calRes.innerHTML = episodes.length ? scheduleCards(episodes) : empty(query || platform ? 'No episodes match these search and filter settings.' : 'No episodes scheduled for this day.');
  const rawDate = $('#calendar-date')?.value || '';
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
  const parsedDate = dateParts ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]), 12) : null;
  const day = parsedDate && !Number.isNaN(parsedDate.valueOf()) ? parsedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Selected date';
  const calSum = $('#calendar-summary');
  if (calSum) calSum.textContent = `${episodes.length} of ${allEpisodes.length} ${allEpisodes.length === 1 ? 'episode' : 'episodes'} · ${day}`;
  const calSrc = $('#calendar-source');
  if (calSrc) calSrc.textContent = state.calendarType === 'web' ? 'Streaming services · TVMaze' : data.stale ? 'Cached schedule · offline fallback' : data.cached ? 'Cached schedule' : 'TVMaze schedule';
  setStatus('calendar', '');
}

export function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// Candidate rows for modal
export function renderCandidateRows(data) {
  const sort = $('#candidate-sort')?.value || 'seeders';
  const minSeeders = $('#candidate-min-seeders')?.value === '' ? null : Number($('#candidate-min-seeders')?.value);
  // ... (simplified - full implementation in views.js)
  return data.map((item) => `<article class="candidate-row">${esc(item.name || item.title || 'Unknown')}</article>`).join('');
}

// Pin recent torrent
export function pinRecentTorrent(torrent) {
  if (!torrent || typeof torrent !== 'object' || !Number.isSafeInteger(Number(torrent.id))) return;
  const id = Number(torrent.id);
  state.recentTorrents = [torrent, ...state.recentTorrents.filter((item) => Number(item.id) !== id)];
}
