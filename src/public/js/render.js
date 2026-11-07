import { state, $, esc, fmtBytes, empty, observeArtwork } from './state.js';

// ── Source badge helper ──
export function sourceBadge(source, contentType) {
  const sourceMap = {
    'torrents': { label: 'Prowlarr', class: 'prowlarr' },
    'usenet': { label: 'Usenet', class: 'usenet' },
    'local': { label: 'IMDb', class: 'imdb' },
    'local-music': { label: 'MusicBrainz', class: 'musicbrainz' },
    'torrentio': { label: 'Torrentio', class: 'torrentio' },
  };
  const info = sourceMap[source] || { label: source || 'Unknown', class: '' };
  const typeLabel = contentType || 'All';
  return `<span class="tb-source-badge ${info.class}" title="${esc(typeLabel)}">${esc(info.label)}</span>`;
}

// ── Skeleton grid HTML ──
export function renderSkeletonGrid(count = 8, kind = 'movie') {
  const isMusic = kind === 'music';
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="tb-skeleton-card">
        <div class="tb-skeleton-body">
          <div class="tb-skeleton-line title"></div>
          <div class="tb-skeleton-line meta"></div>
          <div class="tb-skeleton-line meta" style="width:40%"></div>
        </div>
      </div>
    `;
  }
  return html;
}

// ── Pagination HTML (string) ──
export function renderPaginationHtml(viewKey, totalItems, currentPage, limit) {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  if (totalPages <= 1) return '';

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

  let html = `<span class="tb-pagination-info">Page <strong>${currentPage}</strong> of ${totalPages} (${totalItems} results)</span> `;
  html += `<button class="btn btn-outline-light tb-pagination-btn${currentPage === 1 ? ' disabled' : ''}" data-page="1" aria-label="First page">First</button> `;
  html += `<button class="btn btn-outline-light tb-pagination-btn${currentPage === 1 ? ' disabled' : ''}" data-page="${currentPage - 1}" aria-label="Previous page">&lsaquo;</button> `;

  for (const page of pages) {
    if (page === '...') {
      html += '<span class="tb-pagination-ellipsis">…</span> ';
    } else {
      html += `<button class="btn btn-outline-light tb-pagination-btn${page === currentPage ? ' active' : ''}" data-page="${page}">${page}</button> `;
    }
  }

  html += `<button class="btn btn-outline-light tb-pagination-btn${currentPage === totalPages ? ' disabled' : ''}" data-page="${currentPage + 1}" aria-label="Next page">&rsaquo;</button> `;
  html += `<button class="btn btn-outline-light tb-pagination-btn" data-page="${totalPages}" aria-label="Last page">Last</button>`;

  return html;
}

// ── Media card (search results) - full width row, no image holder ──
export function renderSearchItem(item, idx) {
  const source = item._source || item.source || 'Unknown';
  const isTorrent = item._source === 'torrents';
  const isUsenet = item._source === 'usenet';
  const isLocal = item._source !== 'torrents' && item._source !== 'usenet';
  const isMusic = item._source === 'local-music' || item.kind === 'music' || item.type === 'Album' || item.type === 'Single' || item.type === 'EP';

  const kind = item.kind || (item.titleType && /^tv/i.test(item.titleType) ? 'series' : 'movie');
  const contentType = isTorrent ? (kind === 'series' ? 'Show' : 'Movie') : (isUsenet ? 'Usenet' : (isMusic ? 'Music' : 'All'));

  const title = item.primaryTitle || item.name || item.title || 'Unknown';
  const artist = item.artist || '';
  const year = item.startYear || item.year || item.date || '';
  const titleType = item.titleType || item.type || item.kind || '';
  const rating = item.averageRating || item.rating || '';
  const genres = item.genres || item.genre || '';
  const size = item.size ? fmtBytes(item.size) : '';
  const seeders = item.seeders !== null && item.seeders !== undefined ? `${Number(item.seeders).toLocaleString()}` : '';
  const leechers = item.leechers !== null && item.leechers !== undefined ? `${Number(item.leechers).toLocaleString()}` : '';
  const posted = item.posted ? new Date(item.posted * 1000).toLocaleDateString() : '';

  const route = item.imdbId ? `/title/${encodeURIComponent(item.imdbId)}?kind=${kind}`
    : (item.id ? `/music/release/${encodeURIComponent(item.id)}` : '#');

  // Build metadata line
  const metaParts = [];
  if (isMusic) {
    if (artist) metaParts.push(`Artist: ${esc(artist)}`);
    if (year) metaParts.push(`Year: ${esc(year)}`);
    if (titleType) metaParts.push(`Type: ${esc(titleType)}`);
  } else if (isLocal) {
    // Local IMDb results - show genres and rating prominently
    if (genres) metaParts.push(`Genres: ${esc(genres)}`);
    if (rating) metaParts.push(`Rating: ${esc(rating)}`);
    if (year) metaParts.push(`Year: ${esc(year)}`);
  } else {
    if (size) metaParts.push(`Size: ${esc(size)}`);
    if (seeders) metaParts.push(`Seeders: ${esc(seeders)}`);
    if (leechers) metaParts.push(`Leechers: ${esc(leechers)}`);
    if (posted) metaParts.push(`Posted: ${esc(posted)}`);
    if (rating) metaParts.push(`Rating: ${esc(rating)}`);
    if (genres) metaParts.push(`Genres: ${esc(genres)}`);
  }

  let actionButtons = '';
  if (isTorrent && item.magnet) {
    actionButtons = `
      <button class="btn btn-outline-light btn-sm" data-copy-magnet="${encodeURIComponent(item.magnet)}" title="Copy magnet link"><i class="fas fa-copy"></i></button>
      <button class="btn btn-tb-primary btn-sm" data-add-torrent="${encodeURIComponent(item.magnet)}" data-torrent-name="${esc(title)}" title="Add to TorBox"><i class="fas fa-plus"></i></button>
    `;
  } else if (isUsenet) {
    actionButtons = `<button class="btn btn-tb-primary btn-sm" data-usenet-add="${encodeURIComponent(item.name)}" data-usenet-id="${encodeURIComponent(item.id || '')}" data-usenet-source="${esc(source)}" title="Add to TorBox"><i class="fas fa-plus"></i></button>`;
  } else if (isLocal) {
    // Local IMDb results - add a View Details button
    actionButtons = `<button class="btn btn-tb-primary btn-sm" data-view-detail="${encodeURIComponent(item.imdbId)}" data-view-kind="${kind}" title="View details"><i class="fas fa-info-circle"></i> View Details</button>`;
  }

  return `
    <article class="tb-card${isMusic ? ' music-card' : ' movie-card'}">
      <div class="tb-card-header">
        <a class="tb-card-link" href="${route}" aria-label="Open ${esc(title)} details">
          <h3 class="tb-card-title" title="${esc(title)}">${esc(title)}</h3>
          ${isMusic && artist ? `<span class="tb-card-artist">${esc(artist)}</span>` : ''}
          ${year || titleType ? `<span class="tb-card-year-type">${esc(year || 'Year unknown')} · ${esc(titleType || 'Unknown')}</span>` : ''}
        </a>
        ${sourceBadge(source, contentType)}
      </div>
      <div class="tb-card-meta-row">
        ${meta ? `<span class="tb-card-meta">${esc(meta)}</span>` : ''}
      </div>
      ${isMusic && item.cover ? `<div class="tb-card-cover"><img src="${esc(item.cover)}" alt="${esc(title)} cover" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('no-cover');this.parentElement.innerHTML='<i class=\'fas fa-music\'></i>'"></div>` : ''}
      ${actionButtons ? `<div class="tb-card-actions">${actionButtons}</div>` : ''}
    </article>
  `;
}

// ── Render search results container ──
export function renderSearchResults(container, items, kind = 'movie') {
  if (!container) return;
  if (items.length === 0) {
    container.innerHTML = empty('No results found.');
    return;
  }
  container.innerHTML = items.map((item, idx) => renderSearchItem({ ...item, kind }, idx)).join('');
  observeArtwork(container);
}

// ── Title detail page ──
export function renderTitleDetail(title) {
  const kind = typeof title.titleType === 'string' && /^tv/i.test(title.titleType) ? 'series' : 'movie';
  const artworkUrl = title.artwork?.url || '';
  const artworkSource = title.artwork?.source || '';

  return `
    <section class="tb-detail-hero">
      <div class="row g-4">
        <div class="col-12 col-md-4 tb-detail-poster ${kind}">
          ${artworkUrl
            ? `<img src="${esc(artworkUrl)}" alt="${esc(title.primaryTitle || title.name || '')} poster" loading="lazy">`
            : `<div class="tb-card-cover no-cover" style="aspect-ratio: 2 / 3;"><i class="fas fa-image"></i></div>`
          }
          ${artworkSource ? `<div class="tb-source-badge imdb">${esc(artworkSource)}</div>` : ''}
        </div>
        <div class="col-12 col-md-8 tb-detail-info">
          <h1>${esc(title.primaryTitle || title.name || 'Unknown Title')}</h1>
          <div class="tb-detail-meta">
            <span>${esc(kind === 'series' ? 'TV Series' : 'Movie')}</span>
            ${title.startYear ? `<span>· ${esc(title.startYear)}</span>` : ''}
            ${title.runtimeMinutes ? `<span>· ${esc(title.runtimeMinutes)} min</span>` : ''}
            ${title.averageRating ? `<span>· ⭐ ${esc(title.averageRating)}</span>` : ''}
          </div>
          <div class="tb-detail-tags">
            <span class="tb-detail-tag">${esc(kind === 'series' ? 'TV Series' : 'Movie')}</span>
            ${title.genres ? `<span class="tb-detail-tag">${esc(title.genres)}</span>` : ''}
          </div>
          ${title.overview ? `<p class="tb-detail-overview">${esc(title.overview)}</p>` : ''}
          <div class="tb-detail-actions">
            <button class="btn btn-tb-primary"><i class="fas fa-play me-2"></i>Watch Trailer</button>
            <button class="btn btn-tb-secondary"><i class="fas fa-info-circle me-2"></i>Details</button>
          </div>
        </div>
      </div>
    </section>

    ${title.seasonCount && kind === 'series'
      ? `
      <section class="tb-accordion">
        <div class="accordion" id="title-accordion">
          <div class="accordion-item">
            <h2 class="accordion-header" id="heading-seasons">
              <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-seasons" aria-expanded="true" aria-controls="collapse-seasons">
                Seasons (${title.seasonCount})
              </button>
            </h2>
            <div id="collapse-seasons" class="accordion-collapse collapse show" data-bs-parent="#title-accordion">
              <div class="accordion-body">
                <p class="text-muted">Season details and episodes will appear here.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      `
      : ''
    }
  `;
}

export function renderTitleNotFound() {
  return `
    <section class="tb-detail-hero text-center py-5">
      <h1>Title Not Found</h1>
      <p class="text-muted">The requested title could not be found.</p>
    </section>
  `;
}

// ── Music detail page ──
export function renderMusicDetail(release) {
  const cover = release.cover || '';
  const source = release._source || 'MusicBrainz';

  return `
    <section class="tb-detail-hero">
      <div class="row g-4">
        <div class="col-12 col-md-4 tb-detail-poster music">
          ${cover
            ? `<img src="${esc(cover)}" alt="${esc(release.title || '')} cover" loading="lazy">`
            : `<div class="tb-card-cover no-cover" style="aspect-ratio: 1 / 1;"><i class="fas fa-music"></i></div>`
          }
          <div class="tb-source-badge musicbrainz">${esc(source)}</div>
        </div>
        <div class="col-12 col-md-8 tb-detail-info">
          <h1>${esc(release.title || 'Unknown Release')}</h1>
          <div class="tb-detail-meta">
            <span>${esc(release.type || 'Release')}</span>
            ${release.artist ? `<span>· ${esc(release.artist)}</span>` : ''}
            ${release.date ? `<span>· ${esc(release.date)}</span>` : ''}
          </div>
          <div class="tb-detail-tags">
            <span class="tb-detail-tag">${esc(release.type || 'Release')}</span>
            <span class="tb-detail-tag">MusicBrainz</span>
          </div>
          <div class="tb-detail-actions">
            <button class="btn btn-tb-primary"><i class="fas fa-play me-2"></i>Play Preview</button>
            <button class="btn btn-tb-secondary"><i class="fas fa-info-circle me-2"></i>View on MusicBrainz</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderMusicNotFound() {
  return `
    <section class="tb-detail-hero text-center py-5">
      <h1>Release Not Found</h1>
      <p class="text-muted">The requested music release could not be found.</p>
    </section>
  `;
}

// ── Library list rendering ──
export function renderTorboxLibrary(items) {
  const query = $('#library-query')?.value.trim().toLocaleLowerCase() || '';
  const sort = $('#library-sort')?.value || 'created';
  const filter = $('#library-filter')?.value || 'all';
  const videoExt = /\.(?:mp4|m4v|mkv|avi|mov|wmv|flv|webm|m4v|mpeg|mpg|ts)/;

  let filtered = items.filter((item) => {
    const name = item.name || item.title || item.original_name || '';
    if (query && !name.toLocaleLowerCase().includes(query)) return false;
    if (filter === 'video' && !videoExt.test(item.extension || item.file_extension || '')) return false;
    if (filter === 'music' && !/\.(?:mp3|wav|flac|m4a|aac|ogg|opus|wma|alac|ape)$/i.test(item.extension || item.file_extension || '')) return false;
    if (filter === 'other' && videoExt.test(item.extension || item.file_extension || '')) return false;
    return true;
  });

  if (sort === 'name') filtered.sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
  else if (sort === 'size') filtered.sort((a, b) => (b.bytes || b.size || 0) - (a.bytes || a.size || 0));
  else if (sort === 'status') filtered.sort((a, b) => (b.download_state || b.status || '').localeCompare(a.download_state || a.status || ''));
  else filtered.sort((a, b) => (b.id || 0) - (a.id || 0));

  return filtered.map((item) => `
    <div class="tb-list-item">
      <div class="tb-list-info">
        <div class="tb-list-title" title="${esc(item.name || item.title || item.original_name || 'Unknown')}">${esc(item.name || item.title || item.original_name || 'Unknown')}</div>
        <p class="tb-list-meta">${esc(item.extension || item.file_extension || '')} · ${fmtBytes(item.bytes || item.size || 0)}</p>
      </div>
      <div class="tb-list-actions">
        <span class="badge bg-secondary">${esc(item.download_state || item.status || 'unknown')}</span>
      </div>
    </div>
  `).join('');
}

// ── Calendar / schedule cards ──
export function scheduleCards(episodes) {
  return episodes.map((ep) => {
    const show = ep.show || {};
    const image = show.image?.medium || ep.image?.medium || '';
    const season = Number(ep.season);
    const number = Number(ep.number);
    const code = season && number ? `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}` : '';
    return `
      <article class="tb-card">
        <div class="tb-card-header">
          <h3 class="tb-card-title">${esc(ep.name || 'Untitled')}</h3>
          <span class="tb-source-badge imdb">${esc(show.name || '')}</span>
        </div>
        <div class="tb-card-meta-row">
          <span class="tb-card-meta">${esc(show.name || '')} ${code} · ${esc(show.network?.name || show.webChannel?.name || '')}</span>
        </div>
        ${ep.summary ? `<div class="tb-card-summary">${esc(ep.summary).replace(/<[^>]*>/g, ' ')}</div>` : ''}
      </article>
    `;
  }).join('');
}

// ── Calendar rendering ──
export function renderCalendar() {
  const data = state.calendarData || { episodes: [] };
  const query = $('#calendar-query')?.value.trim().toLocaleLowerCase() || '';
  const platformSelect = $('#calendar-platform');
  if (!platformSelect) return;
  const selectedPlatform = platformSelect.value;

  const filtered = data.episodes.filter((ep) => {
    const name = ep.name || '';
    const show = ep.show || {};
    const showName = show.name || '';
    if (query && !name.toLocaleLowerCase().includes(query) && !showName.toLocaleLowerCase().includes(query)) return false;
    if (selectedPlatform !== 'all') {
      const platform = show.network?.name || show.webChannel?.name || '';
      if (platform.toLocaleLowerCase() !== selectedPlatform.toLocaleLowerCase()) return false;
    }
    return true;
  });

  return filtered.length ? scheduleCards(filtered) : empty('No episodes found.');
}
