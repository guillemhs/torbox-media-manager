// Test the exact pattern from app.js line 220
const state = {
  browseResults: { movie: [], series: [], music: [], torrents: [], usenet: [] },
  total: { 'browse-movies': 100, 'browse-shows': 200, 'browse-music': 50, 'browse-torrents': 30, 'browse-usenet': 20 }
};

// Test each template literal pattern
try {
  const result1 = `${state.browseResults.movie.length}${state.total['browse-movies']>state.browseResults.movie.length?` of ${state.total['browse-movies']}`:''} items`;
  console.log('Movies pattern OK:', result1);
} catch (e) {
  console.log('Movies pattern ERROR:', e.message);
}

try {
  const result2 = `${state.browseResults.series.length}${state.total['browse-shows']>state.browseResults.series.length?` of ${state.total['browse-shows']}`:''} items`;
  console.log('Shows pattern OK:', result2);
} catch (e) {
  console.log('Shows pattern ERROR:', e.message);
}

try {
  const result3 = `${state.browseResults.music.length}${state.total['browse-music']>state.browseResults.music.length?` of ${state.total['browse-music']}`:''} items`;
  console.log('Music pattern OK:', result3);
} catch (e) {
  console.log('Music pattern ERROR:', e.message);
}

try {
  const result4 = `${state.browseResults.torrents.length}${state.total['browse-torrents']>state.browseResults.torrents.length?` of ${state.total['browse-torrents']}`:''} items`;
  console.log('Torrents pattern OK:', result4);
} catch (e) {
  console.log('Torrents pattern ERROR:', e.message);
}

try {
  const result5 = `${state.browseResults.usenet.length}${state.total['browse-usenet']>state.browseResults.usenet.length?` of ${state.total['browse-usenet']}`:''} items`;
  console.log('Usenet pattern OK:', result5);
} catch (e) {
  console.log('Usenet pattern ERROR:', e.message);
}
