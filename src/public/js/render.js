import { state, $, esc, fmtBytes, empty, observeArtwork } from './state.js';

// ── Source badge helper ──
export function sourceBadge(source, contentType) {
  const sourceMap = {
    'torrents': { label: 'Prowlarr', class: 'prowlarr' },
    'usenet': { label: 'Usenet', class: 'usenet' },
    'usenet-nzbgeek': { label: 'NZBGeek', class: 'usenet' },
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
      <div class="tb-skeleton-card placeholder-glow">
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
  html += `<button class="btn btn-outline-light btn-sm tb-pagination-btn" data-page="1" aria-label="First page">First</button> `;
  html += `<button class="btn btn-outline-light btn-sm tb-pagination-btn" data-page="${currentPage - 1}" aria-label="Previous page">&lsaquo;</button> `;

  for (const page of pages) {
    if (page === '...') {
      html += '<span class="pagination-ellipsis">…</span> ';
    } else {
      html += `<button class="btn btn-outline-light btn-sm tb-pagination-btn" data-page="${page}" aria-label="Page ${page}">${page}</button> `;
    }
  }

  html += `<button class="btn btn-outline-light btn-sm tb-pagination-btn" data-page="${currentPage + 1}" aria-label="Next page">&rsaquo;</button> `;
  html += `<button class="btn btn-outline-light btn-sm tb-pagination-btn" data-page="${totalPages}" aria-label="Last page">Last</button>`;

  return html;
}

// ── Media card (search results) ──
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
  const seeders = item.seeders !== null && item.seeders !== undefined ? Number(item.seeders).toLocaleString() : '';
  const leechers = item.leechers !== null && item.leechers !== undefined ? Number(item.leechers).toLocaleString() : '';
  const posted = item.posted ? new Date(item.posted * 1000).toLocaleDateString() : '';

  const route = item.imdbId ? '/title/' + encodeURIComponent(item.imdbId) + '?kind=' + kind
    : (item.id ? '/music/release/' + encodeURIComponent(item.id) : '#');

  const metaParts = [];
  if (isMusic) {
    if (artist) metaParts.push('Artist: ' + esc(artist));
    if (year) metaParts.push('Year: ' + esc(year));
    if (titleType) metaParts.push('Type: ' + esc(titleType));
  } else if (isLocal) {
    if (genres) metaParts.push('Genres: ' + esc(genres));
    if (rating) metaParts.push('Rating: ' + esc(rating));
    if (year) metaParts.push('Year: ' + esc(year));
  } else {
    if (size) metaParts.push('Size: ' + esc(size));
    if (seeders) metaParts.push('Seeders: ' + esc(seeders));
    if (leechers) metaParts.push('Leechers: ' + esc(leechers));
    if (posted) metaParts.push('Posted: ' + esc(posted));
    if (rating) metaParts.push('Rating: ' + esc(rating));
    if (genres) metaParts.push('Genres: ' + esc(genres));
  }

  let actionButtons = '';
  if (isTorrent && item.magnet) {
    actionButtons = '<button class="btn btn-outline-light btn-sm" data-copy-magnet="' + encodeURIComponent(item.magnet) + '" title="Copy magnet link"><i class="fas fa-copy"></i></button>' +
      '<button class="btn btn-tb-primary btn-sm" data-add-torrent="' + encodeURIComponent(item.magnet) + '" data-torrent-name="' + esc(title) + '" title="Add to TorBox"><i class="fas fa-plus"></i></button>';
  } else if (isUsenet) {
    const isNzbgeek = source === 'NZBGeek' || item._source === 'usenet-nzbgeek';
    actionButtons = '<button class="btn btn-tb-primary btn-sm" data-usenet-add="' + encodeURIComponent(item.name) + '" data-usenet-id="' + encodeURIComponent(item.id || '') + '" data-usenet-source="' + esc(item.source || source) + '" title="Add to TorBox"><i class="fas fa-plus"></i></button>' +
      (isNzbgeek ? '<button class="btn btn-tb-secondary btn-sm" data-usenet-pipeline="' + encodeURIComponent(item.name) + '" data-usenet-id="' + encodeURIComponent(item.id || '') + '" data-usenet-source="' + esc(item.source || source) + '" title="Run full pipeline" (download + upload + cleanup)"><i class="fas fa-download"></i></button>' : '');
  } else if (isLocal) {
    const detailId = isMusic ? item.id : item.imdbId;
    const detailKind = isMusic ? 'music' : kind;
    actionButtons = '<button class="btn btn-tb-primary btn-sm" data-view-detail="' + encodeURIComponent(detailId) + '" data-view-kind="' + detailKind + '" title="View details"><i class="fas fa-info-circle"></i> View Details</button>';
  }

  return `<article class="tb-card${isMusic ? ' music-card' : ' movie-card'}">
    <div class="tb-card-header">
      <a class="tb-card-link" href="${route}" aria-label="Open ${esc(title)} details">
        <h3 class="tb-card-title" title="${esc(title)}">${esc(title)}</h3>
        ${isMusic && artist ? '<span class="tb-card-artist">' + esc(artist) + '</span>' : ''}
        ${year || titleType ? '<span class="tb-card-year-type">' + esc(year || 'Year unknown') + ' · ' + esc(titleType || 'Unknown') + '</span>' : ''}
      </a>
      ${sourceBadge(source, contentType)}
      </div>
      <div class="tb-card-meta-row">
        ${metaParts.length ? '<span class="tb-card-meta">' + esc(metaParts.join(' · ')) + '</span>' : ''}
      </div>
${isMusic && item.cover ? '<div class="tb-card-cover"><img src="' + esc(item.cover) + '" alt="' + esc(title) + ' cover" loading="lazy" onerror="this.onerror=null;this.src=\'data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;300&quot; height=&quot;300&quot; fill=&quot;%23334155&quot;/><text x=&quot;50%&quot; y=&quot;50%&quot; font-size=&quot;14&quot; fill=&quot;%2394a3b8&quot; text-anchor=&quot;middle&quot; dominant-baseline=&quot;middle&quot;>No Cover</text></svg>\'"></div>' : ''}
      ${actionButtons ? '<div class="tb-card-actions">' + actionButtons + '</div>' : ''}
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
    <section class="title-detail">
      <div class="title-detail-header">
        <h1>${esc(title.primaryTitle || title.name || 'Unknown Title')}</h1>
        <div class="title-meta">
          ${esc(kind === 'series' ? 'TV Series' : 'Movie')}
          ${title.startYear ? `· ${esc(title.startYear)}` : ''}
          ${title.runtimeMinutes ? `· ${esc(title.runtimeMinutes)} min` : ''}
          ${title.averageRating ? `· ⭐ ${esc(title.averageRating)}` : ''}
        </div>
      </div>

      <div class="detail-content">
        <div class="detail-poster ${kind}">
          ${artworkUrl ? `<img src="${esc(artworkUrl)}" alt="${esc(title.primaryTitle || title.name || '')} poster" loading="lazy" class="${kind}">` : '<div class="no-poster">No Poster Available</div>'}
          ${artworkSource ? `<div class="artwork-source">${esc(artworkSource)}</div>` : ''}
        </div>

        <div class="detail-info">
          <h2>Details</h2>
          ${title.overview ? `<p>${esc(title.overview)}</p>` : ''}
          ${title.releaseDate ? `<p><strong>Release Date:</strong> ${esc(title.releaseDate)}</p>` : ''}
          ${title.seasonCount ? `<p><strong>Seasons:</strong> ${esc(title.seasonCount)}</p>` : ''}
          ${title.showStatus ? `<p><strong>Status:</strong> ${esc(title.showStatus)}</p>` : ''}
          ${title.genres ? `<p><strong>Genres:</strong> ${esc(title.genres)}</p>` : ''}
          <div class="detail-actions">
            ${title.imdbId ? `<a href="https://www.imdb.com/title/${encodeURIComponent(title.imdbId)}/" target="_blank" rel="noopener noreferrer" class="btn btn-outline-light btn-sm"><i class="fas fa-external-link-alt"></i> Open on IMDb</a>` : ''}
            <button class="btn btn-tb-primary btn-sm" data-search-title="${encodeURIComponent(title.imdbId)}" data-search-kind="${kind}" data-search-title-text="${esc(title.primaryTitle || title.name || '')}"><i class="fas fa-search"></i> Search Torrents</button>
            <button class="btn btn-outline-secondary btn-sm" data-search-usenet="${encodeURIComponent(title.primaryTitle || title.name || '')}"><i class="fas fa-download"></i> Search Usenet</button>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

export function renderTitleNotFound() {
  return `
    <article class="title-detail">
      <div class="title-detail-header">
        <h1>Title Not Found</h1>
      </div>
      <div class="detail-content">
        <p>The requested title could not be found.</p>
      </div>
    </article>`;
}

// ── Music detail page ──
export function renderMusicDetail(release) {
  const cover = release.cover || '';
  const source = release._source || 'MusicBrainz';

  return `
    <section class="music-detail">
      <div class="music-detail-header">
        <h1>${esc(release.title || 'Unknown Release')}</h1>
        <div class="music-meta">
          ${esc(release.type || 'Release')}
          ${release.artist ? `· ${esc(release.artist)}` : ''}
          ${release.date ? `· ${esc(release.date)}` : ''}
        </div>
        <div class="music-source">${esc(source)}</div>
      </div>

      <div class="detail-content">
        <div class="music-poster">
          ${cover ? `<img src="${esc(cover)}" alt="${esc(release.title || '')} cover" loading="lazy">` : '<div class="no-poster">No Cover Available</div>'}
        </div>

        <div class="music-info">
          <h2>Details</h2>
          <p><strong>Title:</strong> ${esc(release.title || 'Unknown')}</p>
          ${release.artist ? `<p><strong>Artist:</strong> ${esc(release.artist)}</p>` : ''}
          ${release.date ? `<p><strong>Release Date:</strong> ${esc(release.date)}</p>` : ''}
          ${release.type ? `<p><strong>Type:</strong> ${esc(release.type)}</p>` : ''}
          ${release.id ? `<p><strong>MusicBrainz ID:</strong> ${esc(release.id)}</p>` : ''}
        </div>
      </div>
    </section>
  `;
}

export function renderMusicNotFound() {
  return `
    <article class="music-detail">
      <div class="music-detail-header">
        <h1>Release Not Found</h1>
      </div>
      <div class="detail-content">
        <p>The requested music release could not be found.</p>
      </div>
    </article>`;
}

// ── Library list rendering ──
export function renderTorboxLibrary(items) {
  const videoExt = /\.(?:mp4|m4v|mkv|avi|mov|wmv|flv|webm|mpeg|mpg|ts)/;

  return items.map((item) => {
    const imdbId = item.imdbId || item.imdb_id || '';
    const kind = item.kind || (item.titleType && /^tv/i.test(item.titleType) ? 'series' : 'movie');
    const isMusic = item._source === 'local-music' || item.kind === 'music' || item.type === 'Album' || item.type === 'Single' || item.type === 'EP';
    const isVideo = /\.(?:mp4|m4v|mkv|avi|mov|wmv|flv|webm|mpeg|mpg|ts)$/i.test(item.extension || item.file_extension || '');
    const isAudio = /\.(?:mp3|wav|flac|m4a|aac|ogg|opus|wma|alac|ape)$/i.test(item.extension || item.file_extension || '');
    const category = isMusic ? 'music' : (isVideo ? 'video' : (isAudio ? 'music' : 'other'));
    const status = item.download_state || item.status || 'unknown';
    const size = fmtBytes(item.bytes || item.size || 0);
    const created = item.created || item.created_at || item.added || item.created_at || '';
    const createdDate = created ? new Date(created).toLocaleDateString() : '';
    const hash = item.hash || item.info_hash || '';
    const hashShort = hash ? hash.slice(0, 8) + '\u2026' : '';
    const itemId = item.id || item.idx || 0;
    const progress = item.progress !== undefined ? Number(item.progress) : 0;
    const pct = (progress * 100).toFixed(1);
    const downloadSpeed = item.download_speed ? fmtBytes(item.download_speed) + '/s' : '';
    const uploadSpeed = item.upload_speed ? fmtBytes(item.upload_speed) + '/s' : '';
    const eta = item.eta ? new Date(item.eta * 1000).toLocaleTimeString() : '';
    const downloadPresent = item.download_present === true || item.download_present === 1;
    const magnet = item.magnet || '';

    // Build file list (all files)
    let filesHtml = '';
    const files = item.files || item.files_list || [];
    if (files && files.length > 0) {
      const fileList = files.map(f => {
        const fName = f.name || 'File';
        const fSize = fmtBytes(f.size || f.bytes || 0);
        const fId = f.id || '';
        const dlLink = fId && downloadPresent ? `<a href="/torbox/usenet/${itemId}/files/${fId}" class="library-file-download" title="Download">${esc(fName)}</a>` : `<span class="library-file-name">${esc(fName)}</span>`;
        return `<div class="library-file-row">${dlLink}<span class="library-file-size">${esc(fSize)}</span></div>`;
      }).join('');
      filesHtml = `<div class="library-files"><div class="library-files-header">${files.length} file${files.length !== 1 ? 's' : ''}</div>${fileList}</div>`;
    }

    // Build action links
    let actionLinks = '';
    if (imdbId) {
      actionLinks += `<a href="/title/${encodeURIComponent(imdbId)}?kind=${kind}" class="library-action-btn" title="View details"><i class="fas fa-info-circle"></i></a>`;
    }
    if (magnet) {
      actionLinks += `<button class="library-action-btn" data-copy-magnet="${encodeURIComponent(magnet)}" title="Copy magnet"><i class="fas fa-copy"></i></button>`;
    }
    if (downloadPresent && itemId) {
      actionLinks += `<a href="/torbox/usenet/${itemId}/files/0" class="library-action-btn dl-link" title="Download"><i class="fas fa-download"></i></a>`;
    }
    if (itemId) {
      actionLinks += `<button class="library-action-btn delete-link" data-delete-torrent="${itemId}" title="Delete torrent"><i class="fas fa-trash-alt"></i></button>`;
    }
    

    // Progress bar
    const progressBar = `
      <div class="library-progress">
        <div class="library-progress-bar" style="width: ${pct}%"></div>
        <span class="library-progress-text">${pct}%</span>
      </div>
    `;

    return `
      <article class="library-item${isMusic ? ' music-item' : ''}${isVideo ? ' video-item' : ''}">
        <div class="library-item-main">
          <div class="library-item-header">
            <div class="library-item-title">
              ${imdbId ? `<a href="/title/${encodeURIComponent(imdbId)}?kind=${kind}" class="library-item-link" title="View details">${esc(item.name || item.title || item.original_name || 'Unknown')}</a>` : `<span title="${esc(item.name || item.title || item.original_name || 'Unknown')}">${esc(item.name || item.title || item.original_name || 'Unknown')}</span>`}
            </div>
            <div class="library-item-actions-links">${actionLinks}</div>
          </div>
          <div class="library-item-meta">
            <span class="library-item-category">${category}</span>
            <span class="library-item-size">${size}</span>
            ${createdDate ? `<span class="library-item-date">${esc(createdDate)}</span>` : ''}
            ${hashShort ? `<span class="library-item-hash" title="${esc(hash)}">${hashShort}</span>` : ''}
            ${itemId ? `<span class="library-item-id">#${itemId}</span>` : ''}
          </div>
          ${progressBar}
          <div class="library-item-meta-row">
            ${downloadSpeed ? `<span class="library-item-speed">\u2193 ${esc(downloadSpeed)}</span>` : ''}
            ${uploadSpeed ? `<span class="library-item-speed">\u2191 ${esc(uploadSpeed)}</span>` : ''}
            ${eta ? `<span class="library-item-eta">ETA ${esc(eta)}</span>` : ''}
          </div>
        </div>
        <div class="library-item-actions">
          <span class="library-item-status ${status}">${esc(status)}</span>
        </div>
      </div>
      ${filesHtml ? filesHtml : ''}
    </article>
  `;
  }).join('');
};

// ── Calendar / schedule cards ──// ── Calendar / schedule cards ──// ── Calendar / schedule cards ──
export function scheduleCards(episodes) {
  return episodes.map((ep) => {
    const show = ep.show || {};
    const image = show.image?.medium || ep.image?.medium || '';
    const season = Number(ep.season);
    const number = Number(ep.number);
    const code = season && number ? `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}` : '';
    const showId = show.id || '';
    const imdbId = show.externals?.imdb || '';
    const detailLink = imdbId ? `/title/${encodeURIComponent(imdbId)}?kind=series` : `/tvmaze/${showId}`;
    return `
      <article class="episode-card">
        <a href="${detailLink}" class="episode-link" title="View ${esc(show.name || '')} details">
          ${image ? `<img src="${esc(image)}" alt="${esc(show.name || '')} ${code}" loading="lazy" />` : ''}
          <div class="episode-copy">
            <div class="episode-name">${esc(ep.name || 'Untitled')}</div>
            <div class="episode-time">${esc(ep.airtime || '')}</div>
            <div class="episode-meta">${esc(show.name || '')} ${code} · ${esc(show.network?.name || show.webChannel?.name || '')}</div>
            <div class="episode-summary">${esc((ep.summary || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())}</div>
          </div>
        </a>
      </article>
    `;
  }).join('');
};

// ── Calendar rendering ──// ── Calendar rendering ──
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
