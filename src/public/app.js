    const state={view:'browse',calendarType:'broadcast',calendarData:null,calendarKey:'',offset:{browse:0,movies:0,shows:0,torrents:0,local:0, 'browse-movies':0, 'browse-shows':0, 'browse-music':0, 'browse-torrents':0, 'browse-usenet':0, 'browse-torrent-search':0, 'browse-usenet-search':0},total:{browse:0,movies:0,shows:0,torrents:0,local:0, 'browse-movies':0, 'browse-shows':0, 'browse-music':0, 'browse-torrents':0, 'browse-usenet':0, 'browse-torrent-search':0, 'browse-usenet-search':0},items:{browse:[],movies:[],shows:[],torrents:[],local:[]},browseResults:{movie:[],series:[],music:[],torrents:[],usenet:[]},recentTorrents:[],browseTorrentSearch:{candidates:[],total:0,query:'',kind:'',imdbId:''},browseUsenetSearch:{candidates:[],total:0,query:''}};
    const $=selector=>document.querySelector(selector);
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const fmtBytes=value=>{const bytes=Number(value)||0;if(bytes<1024)return `${bytes} B`;const units=['KB','MB','GB','TB'];let n=bytes/1024,i=0;while(n>=1024&&i<units.length-1){n/=1024;i++}return `${n.toFixed(1)} ${units[i]}`};
    const setStatus=(view,text)=>{const node=$(`#${view}-status`);if(node)node.textContent=text||''};
    const empty=(label='No results found.')=>`<div class="empty-state">${esc(label)}</div>`;
    const artworkPromises=new Map();
    function artworkUrl(key,url){if(artworkPromises.has(key))return artworkPromises.get(key);const promise=jsonFetch(url).then(data=>data.artwork?.url||null).catch(()=>null);artworkPromises.set(key,promise);return promise}
    async function loadArtwork(img){const imdbId=img.dataset.artworkId;const kind=img.dataset.artworkKind;const musicId=img.dataset.musicArtworkId;const album=img.dataset.musicArtwork;const key=imdbId?`title:${imdbId}`:musicId?`music-id:${musicId}`:`music:${album.toLocaleLowerCase()}`;const url=imdbId?`/artwork/${encodeURIComponent(imdbId)}?kind=${encodeURIComponent(kind)}`:musicId?`/music/artwork?id=${encodeURIComponent(musicId)}`:`/music/artwork?q=${encodeURIComponent(album)}`;const src=await artworkUrl(key,url);if(!src||!img.isConnected)return;img.onload=()=>img.classList.add('loaded');img.onerror=()=>img.remove();img.src=src;if(img.complete&&img.naturalWidth)img.classList.add('loaded')}
    const artworkObserver='IntersectionObserver'in window?new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){artworkObserver.unobserve(entry.target);loadArtwork(entry.target)}}),{rootMargin:'240px'}):null;
    function observeArtwork(root){root.querySelectorAll('[data-artwork-id],[data-music-artwork],[data-music-artwork-id]').forEach(img=>artworkObserver?artworkObserver.observe(img):loadArtwork(img))}
    function updateBrowseSearchMode(){const music=$('#browse-kind').value==='music';renderBrowseResults()}

// Search torrent candidates for a specific title (inline, no modal)
async function searchBrowseTorrentSearch(imdbId, kind, title) {
    state.browseTorrentSearch = { candidates: [], total: 0, query: title, kind, imdbId };
    state.offset['browse-torrent-search'] = 0;
    
    $('#browse-torrent-search-section').style.display = 'block';
    $('#browse-torrent-results').innerHTML = '';
    $('#browse-torrent-count').textContent = 'Loading…';
    $('#browse-torrent-total').textContent = '';
    $('#browse-torrent-more').classList.add('hidden');
    
    try {
        const data = await searchBrowseTorrentCandidates(imdbId, kind, title, 0, 20);
        state.browseTorrentSearch.candidates = data.candidates || [];
        state.browseTorrentSearch.total = data.total || 0;
        state.offset['browse-torrent-search'] = data.candidates?.length || 0;
        renderBrowseTorrentSearchResults();
    } catch (error) {
        $('#browse-torrent-results').innerHTML = empty(error.message);
        $('#browse-torrent-count').textContent = 'Error loading results';
    }
}

// Search usenet candidates for a specific query (inline, no modal)
async function searchBrowseUsenetSearch(query) {
    state.browseUsenetSearch = { candidates: [], total: 0, query };
    state.offset['browse-usenet-search'] = 0;
    
    $('#browse-usenet-search-section').style.display = 'block';
    $('#browse-usenet-search-results').innerHTML = '';
    $('#browse-usenet-search-count').textContent = 'Loading…';
    $('#browse-usenet-search-total').textContent = '';
    $('#browse-usenet-search-more').classList.add('hidden');
    
    try {
        const source = $('#browse-usenet-search-source').value || 'all';
        const data = await searchBrowseUsenetCandidates(query, source, 0, 20);
        state.browseUsenetSearch.candidates = data.candidates || [];
        state.browseUsenetSearch.total = data.total || 0;
        state.offset['browse-usenet-search'] = data.candidates?.length || 0;
        renderBrowseUsenetSearchResults();
    } catch (error) {
        $('#browse-usenet-search-results').innerHTML = empty(error.message);
        $('#browse-usenet-search-count').textContent = 'Error loading results';
    }
}
    
    // Helper to get selected indexers
    function getSelectedIndexers(prefix = '') {
        const indexers = [];
        if ($(`#${prefix}indexer-prowlarr`).checked) indexers.push('prowlarr');
        if ($(`#${prefix}indexer-torrentio`).checked) indexers.push('torrentio');
        return indexers;
    }
    
    // Helper to get selected usenet source
    function getUsenetSource(prefix = '') {
        return $(`#${prefix}usenet-source`).value || 'all';
    }
    
    // Render torrent candidates inline (no modal)
    function renderBrowseTorrentCandidates(candidates) {
        return candidates.map(item => `<article class="candidate-row"><div><div class="candidate-name">${esc(item.name)}</div><div class="candidate-meta">${item.seeders!==null&&item.seeders!==undefined?`${Number(item.seeders).toLocaleString()} seeders`:''}${item.leechers!==null&&item.leechers!==undefined?` · ${Number(item.leechers).toLocaleString()} leechers`:''}${item.size?` · ${fmtBytes(item.size)}`:''}${item.source?` · ${esc(item.source)}`:''}</div></div><div class="candidate-actions">${item.magnet?`<a class="p-button p-button-secondary p-button-small" href="${esc(item.magnet)}">Magnet</a>`:''}${item.downloadToken?`<a class="p-button p-button-secondary p-button-small" href="/torrents/download/${encodeURIComponent(item.downloadToken)}" download="${esc(item.name)}.torrent">.torrent</a>`:''}<button class="p-button p-button-primary p-button-small" data-add-torrent="${encodeURIComponent(item.magnet)}" data-torrent-name="${esc(item.name)}">Add cached</button></div></article>`).join('')
    }
    
    // Render usenet candidates inline (no modal)
    function renderBrowseUsenetCandidates(candidates) {
        return candidates.map(item => `<article class="candidate-row"><div><div class="candidate-name">${esc(item.name)}</div><div class="candidate-meta">${esc(item.source)}${item.size?` · ${fmtBytes(item.size)}`:''}${item.complete===false?' · incomplete':''}</div></div><div class="candidate-actions"><button class="p-button p-button-primary p-button-small" data-add-usenet="${encodeURIComponent(JSON.stringify({source:item.source,id:item.id,name:item.name}))}">Add to TorBox</button></div></article>`).join('')
    }
    
    // Search torrent candidates inline with pagination
    async function searchBrowseTorrentCandidates(imdbId, kind, title, offset = 0, limit = 20) {
        const season = kind === 'series' ? 1 : undefined;
        const url = `/torrents/search?imdbId=${encodeURIComponent(imdbId)}&kind=${encodeURIComponent(kind)}&season=${season || 1}&title=${encodeURIComponent(title)}&limit=${limit}&offset=${offset}`;
        const data = await jsonFetch(url);
        return data;
    }
    
    // Search usenet candidates inline with pagination
    async function searchBrowseUsenetCandidates(query, source = 'all', offset = 0, limit = 20) {
        const url = `/usenet/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}&limit=${limit}&offset=${offset}`;
        const data = await jsonFetch(url);
        return data;
    }
    
    // Load more torrent search results
    async function loadMoreBrowseTorrentSearch() {
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
            renderBrowseTorrentSearchResults();
            setStatus('browse', '');
        } catch (error) {
            setStatus('browse', error.message);
        }
    }
    
    // Load more usenet search results
    async function loadMoreBrowseUsenetSearch() {
        const { query } = state.browseUsenetSearch;
        if (!query) return;
        
        const offset = state.offset['browse-usenet-search'] || 0;
        const limit = 20;
        const source = $('#browse-usenet-search-source').value || 'all';
        
        setStatus('browse', 'Loading more usenet results…');
        try {
            const data = await searchBrowseUsenetCandidates(query, source, offset, limit);
            const newItems = data.candidates || [];
            state.browseUsenetSearch.candidates = [...state.browseUsenetSearch.candidates, ...newItems];
            state.offset['browse-usenet-search'] += newItems.length;
            renderBrowseUsenetSearchResults();
            setStatus('browse', '');
        } catch (error) {
            setStatus('browse', error.message);
        }
    }
    
    // Render torrent search results inline
    function renderBrowseTorrentSearchResults() {
        const candidates = state.browseTorrentSearch.candidates || [];
        const total = state.browseTorrentSearch.total || 0;
        const offset = state.offset['browse-torrent-search'] || 0;
        
        $('#browse-torrent-results').innerHTML = candidates.length ? renderBrowseTorrentCandidates(candidates) : empty('No torrent candidates found.');
        $('#browse-torrent-count').textContent = `Showing ${candidates.length} of ${total} results`;
        $('#browse-torrent-total').textContent = `${candidates.length} of ${total} items`;
        $('#browse-torrent-more').classList.toggle('hidden', candidates.length >= total);
        
        // Add event listeners for add buttons
        $('#browse-torrent-results').querySelectorAll('[data-add-torrent]').forEach(button => {
            button.onclick = async () => {
                const magnet = decodeURIComponent(button.dataset.addTorrent);
                const name = button.dataset.torrentName || '';
                button.disabled = true;
                button.textContent = 'Adding…';
                try {
                    const data = await jsonFetch('/torbox/torrents', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ magnet, name, addOnlyIfCached: true })
                    });
                    button.textContent = 'Added';
                    setTimeout(() => {
                        button.textContent = 'Add cached';
                        button.disabled = false;
                    }, 1500);
                    pinRecentTorrent(data.torrent);
                    loadView('torrents', true);
                } catch (error) {
                    button.textContent = 'Add cached';
                    button.disabled = false;
                    alert(error.message);
                }
            };
        });
    }
    
    // Render usenet search results inline
    function renderBrowseUsenetSearchResults() {
        const candidates = state.browseUsenetSearch.candidates || [];
        const total = state.browseUsenetSearch.total || 0;
        
        $('#browse-usenet-search-results').innerHTML = candidates.length ? renderBrowseUsenetCandidates(candidates) : empty('No usenet results found.');
        $('#browse-usenet-search-count').textContent = `Showing ${candidates.length} of ${total} results`;
        $('#browse-usenet-search-total').textContent = `${candidates.length} of ${total} items`;
        $('#browse-usenet-search-more').classList.toggle('hidden', candidates.length >= total);
        
        // Add event listeners for add buttons
        $('#browse-usenet-search-results').querySelectorAll('[data-add-usenet]').forEach(button => {
            button.onclick = async () => {
                const usenetData = JSON.parse(decodeURIComponent(button.dataset.addUsenet));
                button.disabled = true;
                button.textContent = 'Adding…';
                try {
                    const result = await jsonFetch('/torbox/usenet', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...usenetData, addOnlyIfCached: true })
                    });
                    button.textContent = 'Added';
                    setTimeout(() => {
                        button.textContent = 'Add to TorBox';
                        button.disabled = false;
                    }, 1500);
                    loadView('torrents', true);
                } catch (error) {
                    button.disabled = false;
                    button.textContent = 'Add to TorBox';
                    alert(error.message);
                }
            };
        });
    }
    
    async function searchBrowse(){const query=$('#browse-query').value.trim();if(query.length<2){state.browseResults={movie:[],series:[],music:[],torrents:[],usenet:[]};state.browseTorrentSearch={candidates:[],total:0,query:'',kind:'',imdbId:''};state.browseUsenetSearch={candidates:[],total:0,query:''};renderBrowseResults();setStatus('browse','Enter at least 2 characters to search.');return}setStatus('browse','Searching…');try{const sources=[];if($('#source-local').checked)sources.push('local');if($('#source-indexers').checked)sources.push('indexers');if($('#source-usenet').checked)sources.push('usenet');if(sources.length===0){setStatus('browse','Select at least one source.');return}const kind=$('#browse-kind').value;const usenetSource=getUsenetSource();const indexers=getSelectedIndexers();const url=`/api/search?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}&sources=${encodeURIComponent(sources.join(','))}&usenetSource=${encodeURIComponent(usenetSource)}&indexers=${encodeURIComponent(indexers.join(','))}&limit=20&offset=0`;const data=await jsonFetch(url);state.browseResults={movie:data.movies?.items||[],series:data.shows?.items||[],music:data.music?.items||[],torrents:data.torrents?.items||[],usenet:data.usenet?.items||[]};state.total['browse-movies']=data.movies?.total||0;state.total['browse-shows']=data.shows?.total||0;state.total['browse-music']=data.music?.total||0;state.total['browse-torrents']=data.torrents?.total||0;state.total['browse-usenet']=data.usenet?.total||0;state.offset['browse-movies']=data.movies?.items?.length||0;state.offset['browse-shows']=data.shows?.items?.length||0;state.offset['browse-music']=data.music?.items?.length||0;state.offset['browse-torrents']=data.torrents?.items?.length||0;state.offset['browse-usenet']=data.usenet?.items?.length||0;renderBrowseResults();const warnings=[...(data.torrents?.warnings||[]),...(data.usenet?.warnings||[])];const total=data.movies?.total+data.shows?.total+data.music?.total+data.torrents?.total+data.usenet?.total;setStatus('browse',`${total} results${warnings.length?` · ${warnings.join(' · ')}`:''}`)}catch(error){setStatus('browse',error.message)}}
    function renderBrowseResults(){const kind=$('#browse-kind').value;const showAll=kind==='all';$('#browse-movies-section').style.display=(showAll||kind==='movie')&&$('#source-local').checked?'block':'none';$('#browse-shows-section').style.display=(showAll||kind==='series')&&$('#source-local').checked?'block':'none';$('#browse-music-section').style.display=(showAll||kind==='music')&&$('#source-local').checked?'block':'none';$('#browse-torrents-section').style.display=(showAll||kind==='torrents')&&$('#source-indexers').checked?'block':'none';$('#browse-usenet-section').style.display=(showAll||kind==='usenet')&&$('#source-usenet').checked?'block':'none';$('#browse-torrent-search-section').style.display='none';$('#browse-usenet-search-section').style.display='none';if(showAll||kind==='movie'){$('#browse-movies-results').innerHTML=state.browseResults.movie.length?titleCards(state.browseResults.movie.map(item=>({...item,kind:'movie'}))):empty('No movies found.');$('#browse-movies-count').textContent=`${state.browseResults.movie.length}${state.total['browse-movies']>state.browseResults.movie.length?` of ${state.total['browse-movies']}`:''} items';$('#browse-movies-more').classList.toggle('hidden',state.browseResults.movie.length>=state.total['browse-movies']);observeArtwork($('#browse-movies-results'))}if(showAll||kind==='series'){$('#browse-shows-results').innerHTML=state.browseResults.series.length?titleCards(state.browseResults.series.map(item=>({...item,kind:'series'}))):empty('No shows found.');$('#browse-shows-count').textContent=`${state.browseResults.series.length}${state.total['browse-shows']>state.browseResults.series.length?` of ${state.total['browse-shows']}`:''} items';$('#browse-shows-more').classList.toggle('hidden',state.browseResults.series.length>=state.total['browse-shows']);observeArtwork($('#browse-shows-results'))}if(showAll||kind==='music'){$('#browse-music-results').innerHTML=state.browseResults.music.length?musicReleaseCards(state.browseResults.music):empty('No music releases found.');$('#browse-music-count').textContent=`${state.browseResults.music.length}${state.total['browse-music']>state.browseResults.music.length?` of ${state.total['browse-music']}`:''} items';$('#browse-music-more').classList.toggle('hidden',state.browseResults.music.length>=state.total['browse-music']);observeArtwork($('#browse-music-results'))}if(showAll||kind==='torrents'){$('#browse-torrents-results').innerHTML=state.browseResults.torrents.length?renderTorrentCandidates(state.browseResults.torrents):empty('No torrents found.');$('#browse-torrents-count').textContent=`${state.browseResults.torrents.length}${state.total['browse-torrents']>state.browseResults.torrents.length?` of ${state.total['browse-torrents']}`:''} items';$('#browse-torrents-more').classList.toggle('hidden',state.browseResults.torrents.length>=state.total['browse-torrents'])}if(showAll||kind==='usenet'){$('#browse-usenet-results').innerHTML=state.browseResults.usenet.length?renderUsenetCandidates(state.browseResults.usenet):empty('No Usenet results found.');$('#browse-usenet-count').textContent=`${state.browseResults.usenet.length}${state.total['browse-usenet']>state.browseResults.usenet.length?` of ${state.total['browse-usenet']}`:''} items';$('#browse-usenet-more').classList.toggle('hidden',state.browseResults.usenet.length>=state.total['browse-usenet'])}}
    function renderTorrentCandidates(candidates){return candidates.map(item=>`<article class="candidate-row"><div><div class="candidate-name">${esc(item.name)}</div><div class="candidate-meta">${item.seeders!==null&&item.seeders!==undefined?`${Number(item.seeders).toLocaleString()} seeders`:''}${item.leechers!==null&&item.leechers!==undefined?` · ${Number(item.leechers).toLocaleString()} leechers`:''}${item.size?` · ${fmtBytes(item.size)}`:''}${item.source?` · ${esc(item.source)}`:''}</div></div><div class="candidate-actions">${item.magnet?`<a class="p-button p-button-secondary p-button-small" href="${esc(item.magnet)}">Magnet</a>`:''}${item.downloadToken?`<a class="p-button p-button-secondary p-button-small" href="/torrents/download/${encodeURIComponent(item.downloadToken)}" download="${esc(item.name)}.torrent">.torrent</a>`:''}<button class="p-button p-button-primary p-button-small" data-add-torrent="${encodeURIComponent(item.magnet)}" data-torrent-name="${esc(item.name)}">Add cached</button></div></article>`).join('')}
    function renderUsenetCandidates(candidates){return candidates.map(item=>`<article class="candidate-row"><div><div class="candidate-name">${esc(item.name)}</div><div class="candidate-meta">${esc(item.source)}${item.size?` · ${fmtBytes(item.size)}`:''}${item.complete===false?' · incomplete':''}</div></div><div class="candidate-actions"><button class="p-button p-button-primary p-button-small" data-add-usenet="${encodeURIComponent(JSON.stringify({source:item.source,id:item.id,name:item.name}))}">Add to TorBox</button></div></article>`).join('')}
    async function loadMoreBrowse(category){const query=$('#browse-query').value.trim();if(query.length<2)return;const kind=$('#browse-kind').value;const sources=[];if($('#source-local').checked)sources.push('local');if($('#source-indexers').checked)sources.push('indexers');if($('#source-usenet').checked)sources.push('usenet');if(sources.length===0)return;const usenetSource=getUsenetSource();const indexers=getSelectedIndexers();const offset=state.offset[`browse-${category}`]||0;const limit=20;setStatus('browse',`Loading more ${category}…`);try{const url=`/api/search?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}&sources=${encodeURIComponent(sources.join(','))}&usenetSource=${encodeURIComponent(usenetSource)}&indexers=${encodeURIComponent(indexers.join(','))}&limit=${limit}&offset=${offset}`;const data=await jsonFetch(url);const newItems=category==='movies'?data.movies?.items||[]:category==='shows'?data.shows?.items||[]:category==='music'?data.music?.items||[]:category==='torrents'?data.torrents?.items||[]:data.usenet?.items||[];state.browseResults[category==='movies'?'movie':category==='shows'?'series':category]=[...(state.browseResults[category==='movies'?'movie':category==='shows'?'series':category]||[]),...newItems];state.offset[`browse-${category}`]+=newItems.length;renderBrowseResults();setStatus('browse','')}catch(error){setStatus('browse',error.message)}}
    function showView(view){state.view=view;document.querySelectorAll('.view').forEach(node=>node.classList.toggle('active',node.id===`view-${view}`));document.querySelectorAll('[data-view]').forEach(node=>{const active=node.dataset.view===view;node.classList.toggle('p-selected',active);if(active)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current')});const labels={browse:'Browse',movies:'Movies',shows:'Shows',torrents:'TorBox Library',local:'Local Media',music:'Music',calendar:'Calendar',title:'Title details'};$('#page-title').textContent=labels[view]||'TorBox Media Manager';if(view==='browse')updateBrowseSearchMode();loadView(view,true)}
    async function loadTitle(imdbId,kind){$('#page-title').textContent='Loading title…';$('#detail-content').innerHTML='<div class="detail-layout"><div class="detail-poster"></div><div><div class="skeleton" style="width:38%"></div><div class="skeleton" style="width:78%;height:34px;margin:14px 0"></div><div class="skeleton" style="width:52%"></div></div></div>';try{const endpoint=kind==='series'?'shows':'movies';const title=await jsonFetch(`/api/${endpoint}/${encodeURIComponent(imdbId)}`);const actualKind=/^tv/i.test(title.titleType)?'series':'movie';const genres=String(title.genres||'').split(',').map(value=>value.trim()).filter(Boolean);$('#page-title').textContent=title.primaryTitle;const poster=title.artwork?.url?`<img class="loaded" src="${esc(title.artwork.url)}" alt="${esc(`${title.primaryTitle} poster`)}">`:`<img loading="eager" alt="${esc(`${title.primaryTitle} poster`)}" data-artwork-id="${esc(title.imdbId)}" data-artwork-kind="${actualKind}">`;const extra=actualKind==='series'?`${title.seasonCount?`${title.seasonCount} ${title.seasonCount===1?'season':'seasons'}`:''}${title.showStatus?` · ${title.showStatus}`:''}`:`${title.releaseDate?`Released ${esc(new Date(`${title.releaseDate}T12:00:00`).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}))}`:''}`;$('#detail-content').innerHTML=`<div class="detail-layout"><div class="detail-poster">${poster}</div><div class="detail-copy"><div class="detail-kicker">${actualKind==='series'?'TV series':'Movie'}</div><h2>${esc(title.primaryTitle)}</h2><div class="detail-subtitle">${esc([title.startYear||'Year unknown',extra,title.runtimeMinutes?`${title.runtimeMinutes} min`:null].filter(Boolean).join(' · '))}</div>${title.averageRating?`<div class="detail-tags"><span class="detail-tag">★ ${Number(title.averageRating).toFixed(1)} IMDb</span>${title.numVotes?`<span class="detail-tag">${Number(title.numVotes).toLocaleString()} votes</span>`:''}</div>`:''}<div class="detail-tags">${genres.length?genres.map(genre=>`<span class="detail-tag">${esc(genre)}</span>`).join(''):'<span class="detail-tag">Genres unavailable</span>'}</div><div class="detail-actions"><a class="p-button p-button-primary" href="https://www.imdb.com/title/${encodeURIComponent(title.imdbId)}/" target="_blank" rel="noopener noreferrer">Open on IMDb ↗</a><button class="p-button p-button-secondary" id="detail-find-torrents">Search results</button></div></div></div>${title.overview?`<p class="detail-description">${esc(title.overview.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim())}</p>`:''}<div class="detail-results-link"><div class="tab-row" role="tablist" aria-label="Search result type"><button class="p-button p-button-secondary active" role="tab" aria-selected="true" data-title-search-tab="torrent">Torrents</button><button class="p-button p-button-secondary" role="tab" aria-selected="false" data-title-search-tab="usenet">Usenet</button></div><div class="status-line" id="title-search-status" role="status">Choose a tab to search.</div><div id="title-search-results"></div></div>`;observeArtwork($('#detail-content'));$('#detail-find-torrents').onclick=()=>{$('[data-title-search-tab="torrent"]').click()};document.querySelectorAll('[data-title-search-tab]').forEach(tab=>tab.onclick=()=>{document.querySelectorAll('[data-title-search-tab]').forEach(item=>{const active=item===tab;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active))});void loadTitleSearchResults(title,actualKind,tab.dataset.titleSearchTab)}); }catch(error){$('#page-title').textContent='Title details';$('#detail-content').innerHTML=`<div class="empty-state detail-error">${esc(error.message)}<p>This title may not be in the local IMDb catalog yet.</p></div>`}}
    async function loadTitleSearchResults(title,kind,source){const status=$('#title-search-status'),results=$('#title-search-results');status.innerHTML=`<span class="spinner"></span>Searching ${source==='torrent'?'torrent sources':'NZBIndex and Binsearch'}…`;results.innerHTML='';try{const data=source==='torrent'?await jsonFetch(`/torrents/search?imdbId=${encodeURIComponent(title.imdbId)}&kind=${encodeURIComponent(kind)}&season=1&title=${encodeURIComponent(title.primaryTitle)}`):await jsonFetch(`/usenet/search?q=${encodeURIComponent(title.primaryTitle)}&source=all`);if(!status.isConnected)return;const candidates=data.candidates||[];if(!candidates.length){status.textContent='Search complete.';results.innerHTML='<div class="empty-state">No matches found.</div>';return}status.textContent=`${candidates.length} results${data.warnings?.length?` · ${data.warnings.join(' · ')}`:''}`;results.innerHTML=`<div class="candidate-list">${candidates.slice(0,30).map((item,index)=>`<article class="candidate-row"><div><div class="candidate-name">${esc(item.name)}</div><div class="candidate-meta">${source==='torrent'?`${item.seeders!==null&&item.seeders!==undefined?`${Number(item.seeders).toLocaleString()} seeders`:''}${item.size?` · ${fmtBytes(item.size)}`:''}${item.source?` · ${esc(item.source)}`:''}`:`${esc(item.source)}${item.size?` · ${fmtBytes(item.size)}`:''}${item.complete===false?' · incomplete':''}`}</div><div class="candidate-meta" data-title-result-status="${index}" role="status"></div></div><div class="candidate-actions">${source==='torrent'?`<a class="p-button p-button-secondary p-button-small" href="${esc(item.magnet)}">Magnet</a>${item.downloadToken?`<a class="p-button p-button-secondary p-button-small" href="/torrents/download/${encodeURIComponent(item.downloadToken)}" download="${esc(item.name)}.torrent">.torrent</a>`:''}<button class="p-button p-button-primary p-button-small" data-title-result-add="${index}">Add cached</button>`:`<button class="p-button p-button-primary p-button-small" data-title-result-add="${index}">Add to TorBox</button>`}</div></article>`).join('')}</div>`;results.querySelectorAll('[data-title-result-add]').forEach(button=>button.onclick=async()=>{const item=candidates[Number(button.dataset.titleResultAdd)],line=button.closest('.candidate-row').querySelector('[data-title-result-status]');button.disabled=true;button.textContent=source==='torrent'?'Adding…':'Sending…';try{const data=source==='torrent'?await jsonFetch('/torbox/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({magnet:item.magnet,name:item.name,addOnlyIfCached:true})}):await jsonFetch('/torbox/usenet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:item.source,id:item.id,name:item.name,addOnlyIfCached:false})});button.textContent=source==='torrent'?'Added':'Added to TorBox';line.textContent=data.detail||'Added to TorBox';void loadView('torrents',true)}catch(error){button.disabled=false;button.textContent=source==='torrent'?'Add cached':'Add to TorBox';line.textContent=error.message}})}catch(error){if(status.isConnected)status.textContent=error.message}}
    async function loadTvmazeTitle(id){$('#page-title').textContent='Loading title…';$('#detail-content').innerHTML='<div class="empty-state"><span class="spinner"></span>Loading show details…</div>';try{const show=await jsonFetch(`/tvmaze/shows/${id}`);const image=show.image?.original||show.image?.medium||'';const imdbId=typeof show.externals?.imdb==='string'&&/^tt\d+$/.test(show.externals.imdb)?show.externals.imdb:'';const network=show.network?.name||show.webChannel?.name||'';const years=[show.premiered,show.ended].filter(Boolean).map(value=>String(value).slice(0,4)).join('–');const rating=Number(show.rating?.average);const seasons=Array.isArray(show._embedded?.seasons)?show._embedded.seasons.length:0;$('#page-title').textContent=show.name;const url=typeof show.url==='string'&&/^https:\/\/www\.tvmaze\.com\//.test(show.url)?show.url:'';$('#detail-content').innerHTML=`<div class="detail-layout"><div class="detail-poster">${image?`<img class="loaded" src="${esc(image)}" alt="${esc(show.name)} poster">`:''}</div><div class="detail-copy"><div class="detail-kicker">TV series · TVMaze</div><h2>${esc(show.name)}</h2><div class="detail-subtitle">${esc([show.type,seasons?`${seasons} ${seasons===1?'season':'seasons'}`:'',years,show.status,show.language,network].filter(Boolean).join(' · ')||'Series information')}</div><div class="detail-tags">${rating?`<span class="detail-tag">★ ${rating.toFixed(1)} TVMaze</span>`:''}${(show.genres||[]).map(genre=>`<span class="detail-tag">${esc(genre)}</span>`).join('')}</div><div class="detail-actions">${url?`<a class="p-button p-button-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open on TVMaze ↗</a>`:''}${imdbId?`<a class="p-button p-button-secondary" href="/title/${encodeURIComponent(imdbId)}?kind=series">Local IMDb title</a><a class="p-button p-button-secondary" href="https://www.imdb.com/title/${encodeURIComponent(imdbId)}/" target="_blank" rel="noopener noreferrer">IMDb ↗</a><button class="p-button p-button-primary" data-find-torrents data-imdb="${esc(imdbId)}" data-kind="series" data-title="${esc(show.name)}">Find torrents</button>`:`<a class="p-button p-button-secondary" href="/shows?q=${encodeURIComponent(show.name)}">Find in local catalog</a>`}</div></div></div>${plainText(show.summary)?`<p class="detail-description">${esc(plainText(show.summary))}</p>`:''}<div class="detail-results-link"><p class="muted">Find a candidate torrent from the IMDb title page, then add it to TorBox only if it is already cached.</p></div>`}catch(error){$('#detail-content').innerHTML=`<div class="empty-state detail-error">${esc(error.message)}<p>Could not load this TVMaze show.</p><a class="p-button p-button-secondary" href="/calendar">Back to calendar</a></div>`}}
    function routeFromLocation(){const path=decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g,'');const params=new URLSearchParams(location.search);const titleMatch=/^title\/(tt\d+)$/i.exec(path);const tvmazeMatch=/^tvmaze\/(\d+)$/i.exec(path);const musicMatch=/^music\/release\/([a-f0-9-]{36})$/i.exec(path);if(titleMatch||tvmazeMatch||musicMatch){document.querySelectorAll('.view').forEach(node=>node.classList.toggle('active',node.id==='view-title'));document.querySelectorAll('[data-view]').forEach(node=>{node.classList.remove('p-selected');node.removeAttribute('aria-current')});state.view='title';$('#page-title').textContent='Loading title…';window.scrollTo({top:0,behavior:'smooth'});if(titleMatch)void loadTitle(titleMatch[1],params.get('kind')==='series'?'series':'movie');else if(tvmazeMatch)void loadTvmazeTitle(Number(tvmazeMatch[1]));else loadMusicRelease(musicMatch[1],params);return}const views=['browse','movies','shows','torrents','local','music','calendar'];const view=views.includes(path)?path:'browse';if((view==='shows'||view==='movies'||view==='browse')&&params.has('q')){const input=view==='browse'?'#browse-query':`#${view}-query`;$(input).value=params.get('q')||''}if(view==='browse'&&['all','movie','series','music','torrents','usenet'].includes(params.get('kind'))){$('#browse-kind').value=params.get('kind')}showView(view);window.scrollTo({top:0,behavior:'smooth'})}
    function setRoute(path){const destination=path.startsWith('/')?path:`/${path}`;if(location.pathname+location.search===destination)routeFromLocation();else{history.pushState(null,'',destination);routeFromLocation()}}
    function searchRoute(view){
        if(view==='browse'){
            const q=$('#browse-query').value.trim();
            setRoute(`/browse?q=${encodeURIComponent(q)}&kind=${encodeURIComponent($('#browse-kind').value)}`)
        }else if(view==='movies' || view==='shows' || view==='music'){
            // Use unified search endpoint for movies, shows, music with pagination
            void searchUnified(view)
        }else{
            void loadView(view,true)
        }
    }
    
    // Unified search for movies, shows, music views with pagination
    async function searchUnified(view){
        const query=$(`#${view}-query`).value.trim();
        if(query.length<2){
            setStatus(view,'Enter at least 2 characters to search.');
            return
        }
        
        // Reset offset for new search
        state.offset[view]=0;
        state.items[view]=[];
        
        setStatus(view,'Searching…');
        try{
            const sources=[];
            const localCheckbox=$(`#${view}-source-local`);
            const indexersCheckbox=$(`#${view}-source-indexers`);
            const usenetCheckbox=$(`#${view}-source-usenet`);
            
            if(localCheckbox && localCheckbox.checked) sources.push('local');
            if(indexersCheckbox && indexersCheckbox.checked) sources.push('indexers');
            if(usenetCheckbox && usenetCheckbox.checked) sources.push('usenet');
            
            if(sources.length===0){
                setStatus(view,'Select at least one source.');
                return
            }
            
            const kind=view==='movies'?'movie':view==='shows'?'series':'music';
            const usenetSource=$(`#${view}-usenet-source`).value||'all';
            const indexers=getSelectedIndexers(view+'-');
            
            const url=`/api/search?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}&sources=${encodeURIComponent(sources.join(','))}&usenetSource=${encodeURIComponent(usenetSource)}&indexers=${encodeURIComponent(indexers.join(','))}&limit=20&offset=0`;
            const data=await jsonFetch(url);
            
            // Store results based on view
            if(view==='movies'){
                state.items.movies=data.movies?.items||[];
                state.total.movies=data.movies?.total||0;
                state.offset.movies=data.movies?.items?.length||0;
                $('#movies-results').innerHTML=state.items.movies.length?titleCards(state.items.movies.map(item=>({...item,kind:'movie'}))):empty('No movies found.');
                $('#movies-count').textContent=`${state.items.movies.length}${state.total.movies>state.items.movies.length?` of ${state.total.movies}`:''} items`;
                $('#movies-more').classList.toggle('hidden',state.items.movies.length>=state.total.movies);
                observeArtwork($('#movies-results'));
            }else if(view==='shows'){
                state.items.shows=data.shows?.items||[];
                state.total.shows=data.shows?.total||0;
                state.offset.shows=data.shows?.items?.length||0;
                $('#shows-results').innerHTML=state.items.shows.length?titleCards(state.items.shows.map(item=>({...item,kind:'series'}))):empty('No shows found.');
                $('#shows-count').textContent=`${state.items.shows.length}${state.total.shows>state.items.shows.length?` of ${state.total.shows}`:''} items`;
                $('#shows-more').classList.toggle('hidden',state.items.shows.length>=state.total.shows);
                observeArtwork($('#shows-results'));
            }else if(view==='music'){
                state.items.music=data.music?.items||[];
                state.total.music=data.music?.total||0;
                state.offset.music=data.music?.items?.length||0;
                $('#music-search-results').innerHTML=state.items.music.length?musicReleaseCards(state.items.music):empty('No music releases found.');
                $('#music-count').textContent=`${state.items.music.length}${state.total.music>state.items.music.length?` of ${state.total.music}`:''} items`;
                $('#music-more').classList.toggle('hidden',state.items.music.length>=state.total.music);
                observeArtwork($('#music-search-results'));
            }
            
            const warnings=[...(data.torrents?.warnings||[]),...(data.usenet?.warnings||[])];
            const total=(data.movies?.total||0)+(data.shows?.total||0)+(data.music?.total||0)+(data.torrents?.total||0)+(data.usenet?.total||0);
            setStatus(view,`${total} results${warnings.length?` · ${warnings.join(' · ')}`:''}`)
        }catch(error){
            setStatus(view,error.message)
        }
    }
    
    // Load more for movies, shows, music views
    async function loadMoreUnified(view){
        const query=$(`#${view}-query`).value.trim();
        if(query.length<2)return;
        
        const sources=[];
        const localCheckbox=$(`#${view}-source-local`);
        const indexersCheckbox=$(`#${view}-source-indexers`);
        const usenetCheckbox=$(`#${view}-source-usenet`);
        
        if(localCheckbox && localCheckbox.checked) sources.push('local');
        if(indexersCheckbox && indexersCheckbox.checked) sources.push('indexers');
        if(usenetCheckbox && usenetCheckbox.checked) sources.push('usenet');
        
        if(sources.length===0)return;
        
        const kind=view==='movies'?'movie':view==='shows'?'series':'music';
        const usenetSource=$(`#${view}-usenet-source`).value||'all';
        const indexers=getSelectedIndexers(view+'-');
        const offset=state.offset[view]||0;
        const limit=20;
        
        setStatus(view,`Loading more…`);
        try{
            const url=`/api/search?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}&sources=${encodeURIComponent(sources.join(','))}&usenetSource=${encodeURIComponent(usenetSource)}&indexers=${encodeURIComponent(indexers.join(','))}&limit=${limit}&offset=${offset}`;
            const data=await jsonFetch(url);
            
            let newItems=[];
            if(view==='movies') newItems=data.movies?.items||[];
            else if(view==='shows') newItems=data.shows?.items||[];
            else if(view==='music') newItems=data.music?.items||[];
            
            state.items[view]=[...state.items[view],...newItems];
            state.offset[view]+=newItems.length;
            
            if(view==='movies'){
                $('#movies-results').innerHTML=state.items.movies.length?titleCards(state.items.movies.map(item=>({...item,kind:'movie'}))):empty('No movies found.');
                $('#movies-count').textContent=`${state.items.movies.length}${state.total.movies>state.items.movies.length?` of ${state.total.movies}`:''} items`;
                $('#movies-more').classList.toggle('hidden',state.items.movies.length>=state.total.movies);
                observeArtwork($('#movies-results'));
            }else if(view==='shows'){
                $('#shows-results').innerHTML=state.items.shows.length?titleCards(state.items.shows.map(item=>({...item,kind:'series'}))):empty('No shows found.');
                $('#shows-count').textContent=`${state.items.shows.length}${state.total.shows>state.items.shows.length?` of ${state.total.shows}`:''} items`;
                $('#shows-more').classList.toggle('hidden',state.items.shows.length>=state.total.shows);
                observeArtwork($('#shows-results'));
            }else if(view==='music'){
                $('#music-search-results').innerHTML=state.items.music.length?musicReleaseCards(state.items.music):empty('No music releases found.');
                $('#music-count').textContent=`${state.items.music.length}${state.total.music>state.items.music.length?` of ${state.total.music}`:''} items`;
                $('#music-more').classList.toggle('hidden',state.items.music.length>=state.total.music);
                observeArtwork($('#music-search-results'));
            }
            
            setStatus(view,'')
        }catch(error){
            setStatus(view,error.message)
        }
    }
    function titleCards(items){return items.map(item=>{const kind=/^tv/i.test(item.titleType)?'series':'movie';const route=`/title/${encodeURIComponent(item.imdbId)}?kind=${kind}`;return `<article class="p-card result-row"><a class="result-row-link" href="${route}" aria-label="Open ${esc(item.primaryTitle)} details"><div><div class="result-row-title">${esc(item.primaryTitle)}</div><div class="result-row-meta">${esc(item.startYear||'Year unknown')} · ${esc(item.titleType)}${item.averageRating?` · ★ ${esc(item.averageRating)}`:''}</div></div><span class="result-row-arrow" aria-hidden="true">›</span></a></article>`}).join('')}
    let activeCandidateSearch=null;
    async function findTorrentCandidates(imdbId,kind,title){activeCandidateSearch={imdbId,kind,title};$('#candidate-sort').value='seeders';$('#candidate-min-seeders').value='';$('#candidate-min-leechers').value='';$('#candidate-title').textContent=`Torrent candidates · ${title}`;$('#candidate-results').innerHTML='';$('#candidate-status').innerHTML='<span class="spinner"></span>Searching torrent sources…';$('#candidate-season-field').classList.toggle('hidden',kind!=='series');$('#candidate-modal').classList.remove('hidden');await fetchTorrentCandidates(imdbId,kind,title)}
    async function fetchTorrentCandidates(imdbId,kind,title){try{const season=kind==='series'?Math.max(1,Math.min(99,Number($('#candidate-season').value)||1)):1;const data=await jsonFetch(`/torrents/search?imdbId=${encodeURIComponent(imdbId)}&kind=${encodeURIComponent(kind)}&season=${season}&title=${encodeURIComponent(title)}`);$('#candidate-status').textContent=data.total?`${data.total} candidates from ${data.source}. Add checks TorBox cache first.${data.warnings?.length?` Some providers failed: ${data.warnings.join('; ')}`:''}`:data.warnings?.length?data.warnings.join('; '):'No candidates found for this title.';renderCandidateRows(data)}catch(error){$('#candidate-results').innerHTML='';$('#candidate-status').textContent=error.message}}
    function musicReleaseCards(releases){return releases.map(item=>{const route=`/music/release/${encodeURIComponent(item.id)}?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist||'')}&date=${encodeURIComponent(item.date||'')}&type=${encodeURIComponent(item.type||'')}`;return `<article class="p-card result-row"><a class="result-row-link" href="${route}" aria-label="Open ${esc(item.title)} by ${esc(item.artist||'Unknown artist')}"><div><div class="result-row-title">${esc(item.title)}</div><div class="result-row-meta">${esc(item.artist||'Unknown artist')}${item.date?` · ${esc(item.date)}`:''}${item.type?` · ${esc(item.type)}`:''}</div></div><span class="result-row-arrow" aria-hidden="true">›</span></a></article>`}).join('')}
    function loadMusicRelease(id,params){const release={id,title:params.get('title')||'Music release',artist:params.get('artist')||'Unknown artist',date:params.get('date')||'',type:params.get('type')||'Release'};$('#page-title').textContent=release.title;$('#detail-content').innerHTML=`<div class="detail-layout"><div class="detail-poster"><img class="loaded" src="/music/artwork?id=${encodeURIComponent(id)}" alt="${esc(release.title)} cover art" onerror="this.remove()"></div><div class="detail-copy"><div class="detail-kicker">Music release · ${esc(release.type)}</div><h2>${esc(release.title)}</h2><div class="detail-subtitle">${esc([release.artist,release.date].filter(Boolean).join(' · '))}</div><div class="detail-actions"><a class="p-button p-button-primary" href="https://musicbrainz.org/release-group/${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer">Open on MusicBrainz ↗</a></div></div></div><div class="detail-results-link"><div class="tab-row" role="tablist" aria-label="Music search result type"><button class="p-button p-button-secondary active" role="tab" aria-selected="true" data-music-result-tab="torrent">Torrents</button><button class="p-button p-button-secondary" role="tab" aria-selected="false" data-music-result-tab="usenet">Usenet</button></div><div class="status-line" id="music-release-status" role="status">Searching torrent sources…</div><div id="music-release-results"></div></div>`;document.querySelectorAll('[data-music-result-tab]').forEach(tab=>tab.onclick=()=>{document.querySelectorAll('[data-music-result-tab]').forEach(item=>{const active=item===tab;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active))});void searchMusicRelease(release,tab.dataset.musicResultTab)});void searchMusicRelease(release,'torrent')}
    async function searchMusicRelease(release,source){const status=$('#music-release-status'),results=$('#music-release-results');const query=[release.title,release.artist].filter(value=>value&&value!=='Unknown artist').join(' ').slice(0,180);status.innerHTML=`<span class="spinner"></span>Searching ${source==='torrent'?'music torrent indexers':'NZBIndex and Binsearch'}…`;results.innerHTML='';try{const data=source==='torrent'?await jsonFetch(`/music/torrents/search?q=${encodeURIComponent(query)}`):await jsonFetch(`/usenet/search?q=${encodeURIComponent(query)}&source=all`);if(!status.isConnected)return;const candidates=data.candidates||[];status.textContent=`${candidates.length} ${source==='torrent'?'torrent':'Usenet'} results${data.source?` · ${data.source}`:''}${data.warnings?.length?` · ${data.warnings.join(' · ')}`:''}`;if(!candidates.length){results.innerHTML='<div class="empty-state">No matching results found.</div>';return}results.innerHTML=`<div class="candidate-list">${candidates.slice(0,40).map((item,index)=>`<article class="candidate-row"><div><div class="candidate-name">${esc(item.name)}</div><div class="candidate-meta">${source==='torrent'?`${item.seeders!==null&&item.seeders!==undefined?`${Number(item.seeders).toLocaleString()} seeders`:''}${item.size?` · ${fmtBytes(item.size)}`:''}${item.source?` · ${esc(item.source)}`:''}`:`${esc(item.source)}${item.size?` · ${fmtBytes(item.size)}`:''}${item.complete===false?' · incomplete':''}`}</div><div class="candidate-meta" data-music-result-status="${index}" role="status"></div></div><div class="candidate-actions">${source==='torrent'?`${item.magnet?`<a class="p-button p-button-secondary p-button-small" href="${esc(item.magnet)}">Magnet</a>`:''}${item.downloadToken?`<a class="p-button p-button-secondary p-button-small" href="/music/torrents/download/${encodeURIComponent(item.downloadToken)}" download> .torrent</a>`:''}<button class="p-button p-button-primary p-button-small" data-music-add="${index}">Add cached</button>`:`<button class="p-button p-button-primary p-button-small" data-music-add="${index}">Add to TorBox</button>`}</div></article>`).join('')}</div>`;results.querySelectorAll('[data-music-add]').forEach(button=>button.onclick=async()=>{const item=candidates[Number(button.dataset.musicAdd)];const line=button.closest('.candidate-row').querySelector('[data-music-result-status]');button.disabled=true;button.textContent=source==='torrent'?'Adding…':'Sending…';try{const result=source==='torrent'?await jsonFetch('/torbox/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({magnet:item.magnet,name:item.name,addOnlyIfCached:true})}):await jsonFetch('/torbox/usenet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:item.source,id:item.id,name:item.name,addOnlyIfCached:false})});button.textContent='Added';line.textContent=result.detail||'Added to TorBox';void loadView('torrents',true)}catch(error){button.disabled=false;button.textContent=source==='torrent'?'Add cached':'Add to TorBox';line.textContent=error.message}})}catch(error){if(status.isConnected)status.textContent=error.message}}
    async function searchUsenet(){const query=$('#usenet-query').value.trim();if(query.length<2){$('#usenet-status').textContent='Enter at least 2 characters to search Usenet.';return}const source=$('#usenet-source').value||'all';$('#usenet-status').innerHTML='<span class="spinner"></span>Searching NZBIndex and Binsearch…';$('#usenet-results').innerHTML='';try{const data=await jsonFetch(`/usenet/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`);const candidates=data.candidates||[];$('#usenet-status').textContent=`${candidates.length} results${data.warnings?.length?` · ${data.warnings.join(' · ')}`:''}`;$('#usenet-results').innerHTML=candidates.length?candidates.map((item,index)=>`<article class="candidate-row"><div><div class="candidate-name">${esc(item.name)}</div><div class="candidate-meta">${esc(item.source)}${item.size?` · ${fmtBytes(item.size)}`:''}${item.complete===false?' · incomplete':''}</div><div class="candidate-meta" data-usenet-status="${index}"></div></div><button class="p-button p-button-primary p-button-small" data-usenet-add="${index}">Add to TorBox</button></article>`).join(''):empty(data.warnings?.length?data.warnings.join(' · '):'No results found.');$('#usenet-results').querySelectorAll('[data-usenet-add]').forEach(button=>button.onclick=async()=>{const item=candidates[Number(button.dataset.usenetAdd)];const line=button.closest('.candidate-row').querySelector('[data-usenet-status]');button.disabled=true;button.textContent='Sending…';try{const result=await jsonFetch('/torbox/usenet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:item.source,id:item.id,name:item.name,addOnlyIfCached:$('#usenet-cached-only').checked})});button.textContent='Added';line.textContent=result.detail||'Added to TorBox';void loadView('torrents',true)}catch(error){button.disabled=false;button.textContent='Add to TorBox';line.textContent=error.message}})}catch(error){$('#usenet-status').textContent=error.message}}
    async function searchMusicReleases(){const query=$('#music-query').value.trim();if(query.length<2){$('#music-status').textContent='Enter at least 2 characters to search music.';return}$('#music-feed-heading').textContent='Search results';$('#music-status').innerHTML='<span class="spinner"></span>Searching MusicBrainz…';$('#music-search-results').innerHTML='';try{const data=await jsonFetch(`/music/search?q=${encodeURIComponent(query)}`);$('#music-search-results').innerHTML=musicReleaseCards(data.releases)||empty('No matching music releases found.');$('#music-status').textContent=`${data.total} releases from ${data.source}.`;observeArtwork($('#music-search-results'));}catch(error){$('#music-status').textContent=error.message}}
    async function findMusicTorrentCandidates(query){$('#candidate-sort').value='seeders';$('#candidate-min-seeders').value='';$('#candidate-min-leechers').value='';$('#candidate-title').textContent=`Music torrents · ${query}`;$('#candidate-results').innerHTML='';$('#candidate-status').innerHTML='<span class="spinner"></span>Searching music indexers…';$('#candidate-season-field').classList.add('hidden');$('#candidate-modal').classList.remove('hidden');try{const data=await jsonFetch(`/music/torrents/search?q=${encodeURIComponent(query)}`);$('#candidate-status').textContent=data.total?`${data.total} candidates from ${data.source}. Add checks TorBox cache first.`:'No candidates found.';renderCandidateRows(data)}catch(error){$('#candidate-status').textContent=error.message}}
    let currentCandidateData=null;function renderCandidateRows(data){currentCandidateData=data;const sort=$('#candidate-sort').value;const minSeeders=$('#candidate-min-seeders').value===''?null:Number($('#candidate-min-seeders').value);const minLeechers=$('#candidate-min-leechers').value===''?null:Number($('#candidate-min-leechers').value);const candidates=[...data.candidates].filter(item=>(minSeeders===null||(item.seeders!==null&&Number(item.seeders)>=minSeeders))&&(minLeechers===null||(item.leechers!==null&&Number(item.leechers)>=minLeechers)));candidates.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):((Number(b[sort])||-1)-(Number(a[sort])||-1)));$('#candidate-count').textContent=`Showing ${candidates.length} of ${data.candidates.length} results`;$(`#candidate-results`).innerHTML=candidates.length?candidates.map((item,index)=>`<article class="candidate-row"><div><div class="candidate-name">${esc(item.name)}</div><div class="candidate-meta">${item.seeders!==null&&item.seeders!==undefined?`${Number(item.seeders).toLocaleString()} seeders`:''}${item.leechers!==null&&item.leechers!==undefined?` · ${Number(item.leechers).toLocaleString()} leechers`:''}${item.size?` · ${fmtBytes(item.size)}`:''}${item.source?` · ${esc(item.source)}`:''}</div></div><div class="candidate-actions"><button class="p-button p-button-secondary p-button-small" data-copy-magnet="${index}">Copy magnet</button>${item.downloadToken?`<a class="p-button p-button-secondary p-button-small" href="/music/torrents/download/${esc(item.downloadToken)}" download>Download .torrent</a>`:''}<button class="p-button p-button-primary p-button-small" data-add-candidate="${index}">Add cached</button></div></article>`).join(''):'<div class="empty-state">No results match these filters.</div>';$('#candidate-sort').onchange=()=>renderCandidateRows(currentCandidateData);$('#candidate-min-seeders').oninput=()=>renderCandidateRows(currentCandidateData);$('#candidate-min-leechers').oninput=()=>renderCandidateRows(currentCandidateData);$('#candidate-results').querySelectorAll('[data-copy-magnet]').forEach(button=>{button.onclick=async()=>{const item=candidates[Number(button.dataset.copyMagnet)];try{await navigator.clipboard.writeText(item.magnet);button.textContent='Copied';setTimeout(()=>{if(button.isConnected)button.textContent='Copy magnet'},1500)}catch{const field=document.createElement('textarea');field.value=item.magnet;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();const copied=document.execCommand('copy');field.remove();button.textContent=copied?'Copied':'Copy failed';setTimeout(()=>{if(button.isConnected)button.textContent='Copy magnet'},1500)}}});$('#candidate-results').querySelectorAll('[data-add-candidate]').forEach((button,index)=>{button.onclick=async()=>{button.disabled=true;button.textContent='Adding…';try{const item=candidates[index];const result=await jsonFetch('/torbox/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({magnet:item.magnet,name:item.name,addOnlyIfCached:true})});button.textContent='Added to library';pinRecentTorrent(result.torrent);void loadView('torrents',true);$('#candidate-status').textContent=`${result.detail}${result.torrent?.torrent_id?` · TorBox ID ${result.torrent.torrent_id}`:''}`}catch(error){button.disabled=false;button.textContent='Add cached';$('#candidate-status').textContent=error.message}}})}
    function pinRecentTorrent(torrent){if(!torrent||typeof torrent!=='object'||!Number.isSafeInteger(Number(torrent.id)))return;const id=Number(torrent.id);state.recentTorrents=[torrent,...state.recentTorrents.filter(item=>Number(item.id)!==id)].slice(0,20)}
    function localCards(items){return items.map(item=>`<article class="p-card"><div class="p-card-content"><div class="p-card-title">${esc(item.title)}</div><div class="p-card-text">${esc(item.type)} · ${esc(item.extension)} · ${fmtBytes(item.bytes)}</div></div></article>`).join('')}
    function renderTorboxLibrary(items){const query=$('#library-query').value.trim().toLocaleLowerCase();const sort=$('#library-sort').value;const filter=$('#library-filter').value;const videoExt=/\.(?:mp4|m4v|mkv|avi|mov|wmv|ts|m2ts|webm|mpeg|mpg|m4v|3gp|ogv|flv)$/i;const audioExt=/\.(?:mp3|flac|m4a|m4b|ogg|wav|aac|wma|alac|aiff|opus)$/i;const mediaFile=file=>videoExt.test(String(file.name||file.path||''))||audioExt.test(String(file.name||file.path||''));const category=item=>{const files=Array.isArray(item.files)?item.files:[];const names=[...files.map(file=>String(file.name||file.path||'')),String(item.name||'')];if(names.some(name=>videoExt.test(name)))return 'video';if(names.some(name=>audioExt.test(name)))return 'music';return 'other'};const matches=items.filter(item=>{const files=Array.isArray(item.files)?item.files:[];const searchable=[item.name,item.hash,item.download_state,item.status,...files.map(file=>file.name||file.path)].join(' ').toLocaleLowerCase();return (filter==='all'||category(item)===filter)&&(!query||searchable.includes(query))});const dateValue=item=>item.created_at??item.createdAt??item.added??item.created??item.updated_at??0;const dateTime=item=>{const value=dateValue(item),numeric=Number(value),date=new Date(Number.isFinite(numeric)&&numeric>0?(numeric<1e12?numeric*1000:numeric):value);return Number.isNaN(date.valueOf())?0:date.valueOf()};matches.sort((a,b)=>sort==='name'?String(a.name||'').localeCompare(String(b.name||'')):sort==='size'?(Number(b.size||0)-Number(a.size||0)):sort==='status'?String(a.download_state||a.status||'').localeCompare(String(b.download_state||b.status||'')):dateTime(b)-dateTime(a));const totalBytes=matches.reduce((total,item)=>total+Number(item.size||item.downloaded||0),0);$('#library-summary').textContent=`${matches.length} of ${items.length} downloads · ${fmtBytes(totalBytes)} total`;const html=matches.map(item=>{const allFiles=Array.isArray(item.files)?item.files:[];const files=item._media_type==='usenet'?allFiles.filter(mediaFile):allFiles;const media=files.find(mediaFile);const date=dateTime(item)?new Date(dateTime(item)).toLocaleDateString():'';const status=item.download_state||item.status||(item.download_finished?'Complete':'Added');const hash=item.hash||item.info_hash||'';const title=item._media_type==='usenet'?(media?.name||media?.path||String(item.name||'Usenet download').replace(/\.nzb$/i,'')):item.name||'Unnamed torrent';const filesHtml=files.length?`<details class="library-files"><summary>${files.length} media ${files.length===1?'file':'files'}</summary><div class="track-list">${files.slice(0,100).map(file=>{const fileId=file.id??file.file_id;const link=item._media_type==='usenet'&&fileId!==undefined?`<a class="p-button p-button-secondary p-button-small" href="/torbox/usenet/${encodeURIComponent(item.id??item.usenet_id)}/files/${encodeURIComponent(fileId)}">Download</a>`:'';return `<div class="track-row"><span>${esc(file.name||file.path||'Media file')} <span class="muted">${fmtBytes(file.size||file.bytes)}</span></span>${link}</div>`}).join('')}</div></details>`:'';return `<article class="p-card library-item"><div class="library-item-main"><div class="library-item-title">${esc(title)}</div><div class="library-item-meta"><span class="library-state">${item._media_type==='usenet'?'Usenet · ':''}${esc(status)}</span><span>${fmtBytes(media?.size||item.size||item.downloaded)}</span>${date?`<span>Added ${esc(date)}</span>`:''}${hash?`<span title="${esc(hash)}">${esc(hash.slice(0,10))}…</span>`:''}</div></div>${Number.isFinite(Number(item.id))?`<span class="muted">#${esc(item.id)}</span>`:''}${filesHtml}${item._media_type==='usenet'&&!files.length?'<div class="muted">TorBox is processing the Usenet download. Media files will appear here when ready.</div>':''}</article>`}).join('');$('#torrents-results').innerHTML=html||empty(query||filter!=='all'?'No library items match these filters.':'Your TorBox library is empty.');return html||empty(query||filter!=='all'?'No library items match these filters.':'Your TorBox library is empty.')}
    function musicCards(albums){return albums.map(album=>`<article class="p-card album-card"><div class="album-cover"><img loading="lazy" alt="${esc(`${album.name} album cover`)}" data-music-artwork="${esc(album.name)}"></div><div class="album-info"><div class="p-card-title">${esc(album.name)}</div><div class="p-card-text">${album.tracks.length} tracks · ${esc(album.downloadState||'TorBox library')}</div><details class="album-details"><summary>Show tracks</summary><div class="track-list">${album.tracks.slice(0,100).map(track=>`<div class="track-row"><span>${esc(track.name)} <span class="muted">${fmtBytes(track.bytes)}</span></span><a class="p-button p-button-secondary p-button-small" href="/music/${Number(album.torrentId)}/${Number(track.id)}/stream">Play</a></div>`).join('')}</div></details></div></article>`).join('')}
    function plainText(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim()}
    function scheduleCards(episodes){return episodes.map(ep=>{const show=ep.show||{};const image=show.image?.medium||ep.image?.medium||'';const season=Number(ep.season),number=Number(ep.number);const code=season&&number?`S${String(season).padStart(2,'0')}E${String(number).padStart(2,'0')}`:'';const route=Number.isSafeInteger(Number(show.id))&&Number(show.id)>0?`/tvmaze/${Number(show.id)}`:typeof show.externals?.imdb==='string'&&/^tt\d+$/.test(show.externals.imdb)?`/title/${encodeURIComponent(show.externals.imdb)}?kind=series`:`/shows?q=${encodeURIComponent(show.name||'')}`;const title=`${show.name||'Show'} · ${ep.name||'Episode'}`;return `<article class="p-card episode-card"><a class="episode-link" href="${route}" aria-label="Open ${esc(show.name||'show')} details">${image?`<img class="episode-art" loading="lazy" src="${esc(image)}" alt="${esc(show.name||'Show artwork')}">`:'<div class="episode-art"></div>'}</a><div class="episode-copy"><span class="episode-time">${esc(ep.airtime||'Time TBD')}</span><a class="episode-link" href="${route}"><div class="episode-name">${esc(title)}</div></a><div class="episode-meta">${esc(code)}${ep.runtime?` · ${esc(ep.runtime)} min`:''}${show.network?.name?` · ${esc(show.network.name)}`:show.webChannel?.name?` · ${esc(show.webChannel.name)}`:''}</div>${plainText(ep.summary)?`<div class="episode-summary">${esc(plainText(ep.summary))}</div>`:''}</div></article>`}).join('')}
    function updateMore(view){const button=$(`#${view}-more`);if(button)button.classList.toggle('hidden',state.items[view].length>=state.total[view])}
    async function jsonFetch(url,options){const response=await fetch(url,options);const data=await response.json();if(!response.ok)throw Error(data.error?.message||data.error||'Request failed');return data}
    async function jsonFetchWithTimeout(url,timeoutMs){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await jsonFetch(url,{signal:controller.signal})}finally{clearTimeout(timer)}}
    let calendarRequest=0;async function loadCalendar(){const request=++calendarRequest;setStatus('calendar','Loading schedule…');const date=$('#calendar-date').value;const country=$('#calendar-country').value||'US';const type=state.calendarType;const key=`${date}:${country}:${type}`;try{if(state.calendarKey!==key){const data=await jsonFetch(`/api/calendar?date=${encodeURIComponent(date)}&country=${encodeURIComponent(country)}${type==='web'?'&type=web':''}`);if(request!==calendarRequest)return;state.calendarData=data;state.calendarKey=key}if(request===calendarRequest)renderCalendar()}catch(error){if(request!==calendarRequest)return;$('#calendar-results').innerHTML=empty(error.message);setStatus('calendar',error.message)}}
    function renderCalendar(){const data=state.calendarData||{episodes:[]};const query=$('#calendar-query').value.trim().toLocaleLowerCase();const platformSelect=$('#calendar-platform');const selectedPlatform=platformSelect.value;const allEpisodes=Array.isArray(data.episodes)?data.episodes:[];const platformOf=ep=>String(ep.show?.webChannel?.name||ep.show?.network?.name||'').trim();const platforms=[...new Set(allEpisodes.map(platformOf).filter(Boolean))].sort((a,b)=>a.localeCompare(b));platformSelect.innerHTML='<option value="">All channels and services</option>'+platforms.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');if(platforms.includes(selectedPlatform))platformSelect.value=selectedPlatform;const platform=platformSelect.value.toLocaleLowerCase();const episodes=allEpisodes.slice().sort((a,b)=>String(a.airtime||a.airstamp||'99:99').localeCompare(String(b.airtime||b.airstamp||'99:99'))).filter(ep=>{const show=ep.show||{};const channel=platformOf(ep);const season=Number(ep.season),number=Number(ep.number);const code=season&&number?`S${String(season).padStart(2,'0')}E${String(number).padStart(2,'0')}`:'';const searchable=`${show.name||''} ${ep.name||''} ${code} ${channel} ${show.network?.country?.name||''} ${plainText(ep.summary)}`.toLocaleLowerCase();return(!query||searchable.includes(query))&&(!platform||channel.toLocaleLowerCase()===platform)});$('#calendar-results').innerHTML=episodes.length?scheduleCards(episodes):empty(query||platform?'No episodes match these search and filter settings.':'No episodes scheduled for this day.');const rawDate=$('#calendar-date').value;const dateParts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);const parsedDate=dateParts?new Date(Number(dateParts[1]),Number(dateParts[2])-1,Number(dateParts[3]),12):null;const day=parsedDate&&!Number.isNaN(parsedDate.valueOf())?parsedDate.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}):'Selected date';$('#calendar-summary').textContent=`${episodes.length} of ${allEpisodes.length} ${allEpisodes.length===1?'episode':'episodes'} · ${day}`;$('#calendar-source').textContent=state.calendarType==='web'?'Streaming services · TVMaze':data.stale?'Cached schedule · offline fallback':data.cached?'Cached schedule':'TVMaze schedule';setStatus('calendar','')}
    function shiftCalendarDay(days){const date=new Date(`${$('#calendar-date').value}T12:00:00`);date.setDate(date.getDate()+days);$('#calendar-date').value=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;loadCalendar()}
    async function loadView(view,reset=false){if(reset&&state.offset[view]!==undefined){state.offset[view]=0;state.items[view]=[]}if(view==='browse')return searchBrowse();const supported=['browse','movies','shows','torrents','local'];if(supported.includes(view)){setStatus(view,'Loading…');try{const limit=view==='torrents'?1000:50,offset=view==='torrents'?0:state.offset[view];let data,rows=[];if(view==='movies'||view==='shows'){const q=$(`#${view}-query`).value;data=await jsonFetch(`/api/${view}?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);rows=data.items;state.total[view]=data.total}else if(view==='torrents'){data=await jsonFetch(`/library?limit=${limit}&offset=${offset}`);rows=data.torbox||[];state.total.torrents=rows.length}else{data=await jsonFetch(`/library?limit=${limit}&offset=${offset}`);rows=data.localMedia.items;state.total.local=data.localMedia.total;state.localErrors=data.localMedia.errors}if(view==='torrents'){const recentIds=new Set(state.recentTorrents.map(item=>Number(item.id)));rows=[...state.recentTorrents,...rows.filter(item=>!recentIds.has(Number(item.id)))];}state.items[view]=reset?rows:[...state.items[view],...rows];state.offset[view]=state.items[view].length;const count=$(`#${view}-count`);if(count)count.textContent=`${state.items[view].length}${state.total[view]>state.items[view].length?` of ${state.total[view]}`:''} items`;const results=$(`#${view}-results`);results.innerHTML=state.items[view].length?(view==='torrents'?renderTorboxLibrary(state.items[view]):view==='local'?localCards(state.items[view]):titleCards(state.items[view])):empty(view==='torrents'?'No TorBox items found.':'No results yet. The IMDb catalog may still be importing.');observeArtwork(results);setStatus(view,view==='local'&&state.localErrors?`${state.localErrors} paths could not be scanned.`:view==='torrents'&&data.usenetError?`TorBox Usenet list unavailable: ${data.usenetError}`:'');updateMore(view)}catch(error){setStatus(view,error.message);if(reset)$(`#${view}-results`).innerHTML=empty(error.message)}}else if(view==='music'){setStatus(view,'Loading recent releases…');$('#music-feed-heading').textContent='Latest releases';try{const data=await jsonFetch('/music/recent');$('#music-search-results').innerHTML=data.releases.length?musicReleaseCards(data.releases):empty('No recent releases were found.');observeArtwork($('#music-search-results'));setStatus(view,`${data.total} recent releases from ${data.source} · last ${data.periodDays} days`)}catch(error){$('#music-search-results').innerHTML=empty(error.message);setStatus(view,error.message)}}else if(view==='calendar'){await loadCalendar()}}
    if(location.hash){const legacy=location.hash.slice(1);history.replaceState(null,'',legacy.startsWith('/')?legacy:`/${legacy}`)}if(location.pathname==='/'&&!location.hash)history.replaceState(null,'','/browse');routeFromLocation();
    document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setRoute(`/${button.dataset.view}`)));
    document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target:null;if(!target)return;const musicButton=target.closest('[data-music-torrent]');if(musicButton){event.preventDefault();findMusicTorrentCandidates(musicButton.dataset.musicTorrent);return}const button=target.closest('[data-find-torrents],#detail-find-torrents');if(button){event.preventDefault();event.stopImmediatePropagation();let imdbId=button.dataset.imdb,kind=button.dataset.kind,title=button.dataset.title;if(button.id==='detail-find-torrents'){imdbId=(location.pathname.match(/title\/(tt\d+)/)||[])[1];kind=new URLSearchParams(location.search).get('kind')||'movie';title=$('#detail-content .detail-copy h2')?.textContent||'Selected title'}if(imdbId)searchBrowseTorrentSearch(imdbId,kind==='series'?'series':'movie',title||'Selected title')}const addTorrentBtn=target.closest('[data-add-torrent]');if(addTorrentBtn){event.preventDefault();const magnet=decodeURIComponent(addTorrentBtn.dataset.addTorrent);const name=addTorrentBtn.dataset.torrentName||'';addTorrentBtn.disabled=true;addTorrentBtn.textContent='Adding…';jsonFetch('/torbox/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({magnet,name,addOnlyIfCached:true})}).then(data=>{addTorrentBtn.textContent='Added';setTimeout(()=>{addTorrentBtn.textContent='Add cached';addTorrentBtn.disabled=false},1500);pinRecentTorrent(data.torrent);loadView('torrents',true)}).catch(error=>{addTorrentBtn.textContent='Add cached';addTorrentBtn.disabled=false;alert(error.message)})}const addUsenetBtn=target.closest('[data-add-usenet]');if(addUsenetBtn){event.preventDefault();const usenetData=JSON.parse(decodeURIComponent(addUsenetBtn.dataset.addUsenet));addUsenetBtn.disabled=true;addUsenetBtn.textContent='Adding…';jsonFetch('/torbox/usenet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...usenetData,addOnlyIfCached:true})}).then(data=>{addUsenetBtn.textContent='Added';setTimeout(()=>{addUsenetBtn.textContent='Add to TorBox';addUsenetBtn.disabled=false},1500);loadView('torrents',true)}).catch(error=>{addUsenetBtn.textContent='Add to TorBox';addUsenetBtn.disabled=false;alert(error.message)})}} ,true);
    $('#candidate-close').onclick=()=>$('#candidate-modal').classList.add('hidden');$('#candidate-modal').addEventListener('click',event=>{if(event.target===$('#candidate-modal'))$('#candidate-modal').classList.add('hidden')});$('#candidate-season').addEventListener('change',()=>{if(activeCandidateSearch?.kind==='series')fetchTorrentCandidates(activeCandidateSearch.imdbId,'series',activeCandidateSearch.title)});
    document.querySelectorAll('[data-search]').forEach(button=>button.addEventListener('click',()=>searchRoute(button.dataset.search)));
    $('#browse-kind').addEventListener('change',updateBrowseSearchMode);
    $('#source-local').addEventListener('change',()=>{$('#usenet-filters').style.display='none';$('#indexer-filters').style.display='none';searchBrowse()});
    $('#source-indexers').addEventListener('change',()=>{$('#usenet-filters').style.display='none';$('#indexer-filters').style.display=$('#source-indexers').checked?'block':'none';searchBrowse()});
    $('#source-usenet').addEventListener('change',()=>{$('#usenet-filters').style.display=$('#source-usenet').checked?'block':'none';$('#indexer-filters').style.display='none';searchBrowse()});
    $('#indexer-prowlarr').addEventListener('change',()=>{if($('#source-indexers').checked)searchBrowse()});
    $('#indexer-torrentio').addEventListener('change',()=>{if($('#source-indexers').checked)searchBrowse()});
    $('#usenet-source').addEventListener('change',()=>{if($('#source-usenet').checked)searchBrowse()});
    $('#browse-torrent-sort').addEventListener('change',()=>renderBrowseTorrentSearchResults());
    $('#browse-torrent-min-seeders').addEventListener('input',()=>renderBrowseTorrentSearchResults());
    $('#browse-torrent-min-leechers').addEventListener('input',()=>renderBrowseTorrentSearchResults());
    $('#browse-usenet-search-source').addEventListener('change',()=>{if($('#source-usenet').checked)searchBrowseUsenetSearch()});
    $('#browse-movies-more').addEventListener('click',()=>loadMoreBrowse('movies'));
    $('#browse-shows-more').addEventListener('click',()=>loadMoreBrowse('shows'));
    $('#browse-music-more').addEventListener('click',()=>loadMoreBrowse('music'));
    $('#browse-torrents-more').addEventListener('click',()=>loadMoreBrowse('torrents'));
    $('#browse-usenet-more').addEventListener('click',()=>loadMoreBrowse('usenet'));
    $('#browse-torrent-more').addEventListener('click',()=>loadMoreBrowseTorrentSearch());
    $('#browse-usenet-search-more').addEventListener('click',()=>loadMoreBrowseUsenetSearch());
    $('#browse-indexer-search').onclick=()=>{const query=$('#browse-query').value.trim();if(query.length<2){setStatus('browse','Enter at least 2 characters to search indexers.');return}findMusicTorrentCandidates(query)};
    for(const view of ['browse','movies','shows'])$(`#${view}-query`).addEventListener('keydown',event=>{if(event.key==='Enter')searchRoute(view)});
    $('#music-query').addEventListener('keydown',event=>{if(event.key==='Enter')searchRoute('music')});
    
    // Movies view filter controls
    $('#movies-source-local').addEventListener('change',()=>{$('#movies-usenet-filters').style.display='none';$('#movies-indexer-filters').style.display='none';searchRoute('movies')});
    $('#movies-source-indexers').addEventListener('change',()=>{$('#movies-usenet-filters').style.display='none';$('#movies-indexer-filters').style.display=$('#movies-source-indexers').checked?'block':'none';searchRoute('movies')});
    $('#movies-source-usenet').addEventListener('change',()=>{$('#movies-usenet-filters').style.display=$('#movies-source-usenet').checked?'block':'none';$('#movies-indexer-filters').style.display='none';searchRoute('movies')});
    $('#movies-indexer-prowlarr').addEventListener('change',()=>{if($('#movies-source-indexers').checked)searchRoute('movies')});
    $('#movies-indexer-torrentio').addEventListener('change',()=>{if($('#movies-source-indexers').checked)searchRoute('movies')});
    $('#movies-usenet-source').addEventListener('change',()=>{if($('#movies-source-usenet').checked)searchRoute('movies')});
    
    // Shows view filter controls
    $('#shows-source-local').addEventListener('change',()=>{$('#shows-usenet-filters').style.display='none';$('#shows-indexer-filters').style.display='none';searchRoute('shows')});
    $('#shows-source-indexers').addEventListener('change',()=>{$('#shows-usenet-filters').style.display='none';$('#shows-indexer-filters').style.display=$('#shows-source-indexers').checked?'block':'none';searchRoute('shows')});
    $('#shows-source-usenet').addEventListener('change',()=>{$('#shows-usenet-filters').style.display=$('#shows-source-usenet').checked?'block':'none';$('#shows-indexer-filters').style.display='none';searchRoute('shows')});
    $('#shows-indexer-prowlarr').addEventListener('change',()=>{if($('#shows-source-indexers').checked)searchRoute('shows')});
    $('#shows-indexer-torrentio').addEventListener('change',()=>{if($('#shows-source-indexers').checked)searchRoute('shows')});
    $('#shows-usenet-source').addEventListener('change',()=>{if($('#shows-source-usenet').checked)searchRoute('shows')});
    
    // Music view filter controls
    $('#music-source-local').addEventListener('change',()=>{$('#music-usenet-filters').style.display='none';$('#music-indexer-filters').style.display='none';searchRoute('music')});
    $('#music-source-indexers').addEventListener('change',()=>{$('#music-usenet-filters').style.display='none';$('#music-indexer-filters').style.display=$('#music-source-indexers').checked?'block':'none';searchRoute('music')});
    $('#music-source-usenet').addEventListener('change',()=>{$('#music-usenet-filters').style.display=$('#music-source-usenet').checked?'block':'none';$('#music-indexer-filters').style.display='none';searchRoute('music')});
    $('#music-indexer-prowlarr').addEventListener('change',()=>{if($('#music-source-indexers').checked)searchRoute('music')});
    $('#music-indexer-torrentio').addEventListener('change',()=>{if($('#music-source-indexers').checked)searchRoute('music')});
    $('#music-usenet-source').addEventListener('change',()=>{if($('#music-source-usenet').checked)searchRoute('music')});
    
    // Load more buttons for movies, shows, music views
    $('#movies-more').addEventListener('click',()=>loadMoreUnified('movies'));
    $('#shows-more').addEventListener('click',()=>loadMoreUnified('shows'));
    $('#music-more').addEventListener('click',()=>loadMoreUnified('music'));
    
    // Other load more buttons (torrents, local, etc.)
    document.querySelectorAll('[id$="-more"]:not(#movies-more):not(#shows-more):not(#music-more)').forEach(button=>button.addEventListener('click',()=>loadView(button.id.replace('-more',''))));
    $('#refresh-torrents').onclick=()=>loadView('torrents',true);$('#library-query').addEventListener('input',()=>renderTorboxLibrary(state.items.torrents));$('#library-filter').addEventListener('change',()=>renderTorboxLibrary(state.items.torrents));$('#library-sort').addEventListener('change',()=>renderTorboxLibrary(state.items.torrents));
    $('#usenet-search-open').onclick=()=>{$('#usenet-modal').classList.remove('hidden');$('#usenet-query').focus()};$('#usenet-search-submit').onclick=searchUsenet;$('#usenet-query').addEventListener('keydown',event=>{if(event.key==='Enter')searchUsenet()});$('#usenet-close').onclick=()=>$('#usenet-modal').classList.add('hidden');$('#usenet-modal').addEventListener('click',event=>{if(event.target===$('#usenet-modal'))$('#usenet-modal').classList.add('hidden')});
    const today=new Date();$('#calendar-date').value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    $('#detail-back').onclick=()=>{if(document.referrer.startsWith(location.origin))history.back();else setRoute('/browse')};
    window.addEventListener('popstate',routeFromLocation);
    $('#calendar-prev').onclick=()=>shiftCalendarDay(-1);$('#calendar-next').onclick=()=>shiftCalendarDay(1);$('#calendar-today').onclick=()=>{$('#calendar-date').value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;loadCalendar()};$('#calendar-date').onchange=()=>loadCalendar();$('#calendar-country').onchange=()=>{state.calendarKey='';loadCalendar()};$('#calendar-query').addEventListener('input',renderCalendar);$('#calendar-query').addEventListener('search',renderCalendar);$('#calendar-query').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();renderCalendar()}});$('#calendar-platform').addEventListener('change',renderCalendar);$('#calendar-search').onclick=renderCalendar;document.querySelectorAll('[data-calendar-type]').forEach(button=>button.onclick=()=>{state.calendarType=button.dataset.calendarType;$('#calendar-country').disabled=state.calendarType==='web';$('#calendar-country').title=state.calendarType==='web'?'Streaming results include global and local services':'Choose a broadcast country';document.querySelectorAll('[data-calendar-type]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button))});state.calendarKey='';loadCalendar()});
    $('#add-open').onclick=()=>{$('#add-modal').classList.remove('hidden');$('#magnet-input').focus()};$('#add-cancel').onclick=()=>$('#add-modal').classList.add('hidden');$('#add-modal').addEventListener('click',event=>{if(event.target===$('#add-modal'))$('#add-modal').classList.add('hidden')});
    $('#add-form').addEventListener('submit',async event=>{event.preventDefault();const button=$('#add-submit');button.disabled=true;$('#add-status').innerHTML='<span class="spinner"></span>Sending to TorBox…';try{const data=await jsonFetch('/torbox/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({magnet:$('#magnet-input').value.trim(),name:$('#torrent-name').value.trim(),addOnlyIfCached:$('#cached-only').checked})});$('#add-status').textContent=`${data.detail}${data.torrent?.torrent_id?` · TorBox ID ${data.torrent.torrent_id}`:''}`;$('#magnet-input').value='';$('#torrent-name').value='';pinRecentTorrent(data.torrent);void loadView('torrents',true);setTimeout(()=>{$('#add-modal').classList.add('hidden')},1800)}catch(error){$('#add-status').textContent=error.message}finally{button.disabled=false}});
    jsonFetchWithTimeout('/health',5000).then(data=>$('#mode-pill').textContent=data.mode==='torbox-integrated'?'TorBox configured':'Local mode').catch(()=>$('#mode-pill').textContent='TorBox status unavailable');
    async function refreshImportStatus(){try{const data=await jsonFetchWithTimeout('/admin/imdb/status',10000);const progress=data.progress||{};if(progress.running)$('#import-status').textContent=`Importing IMDb ${progress.dataset.includes('ratings')?'ratings':'titles'} · ${Number(progress.importedRows||0).toLocaleString()} processed`;else if(progress.error)$('#import-status').textContent=`IMDb import failed · ${progress.error}`;else if(data.datasets.length>=2)$('#import-status').textContent=`${Number(data.titles).toLocaleString()} IMDb titles · catalog ready`;else $('#import-status').textContent=`IMDb catalog waiting to import · ${Number(data.titles).toLocaleString()} titles`;if(progress.running||data.datasets.length<2)setTimeout(refreshImportStatus,5000)}catch{$('#import-status').textContent='IMDb status unavailable · retrying';setTimeout(refreshImportStatus,10000)}}
    void refreshImportStatus();
