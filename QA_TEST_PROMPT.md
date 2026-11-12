# QA Test Prompt — TorBox Media Manager

Act as a Senior QA Automation Engineer. Verify and write end-to-end test suites (using Playwright / Cypress) based on the updated UI/UX specifications for our web application (TorBox Media Manager) if necessary.

Verify that the current functionality works on the application specifications:

## 1. SEARCH FUNCTIONALITY (Dual Action Flow)

For each route below, verify that entering the query and clicking the primary **Search** button dispatches requests and renders results from the correct backend sources:

| Route | Query | Expected |
|-------|-------|----------|
| `/browse` | "Nocturne" | UI renders results grid from Indexers All Results, Prowlarr, Torrentio, Usenet All Results, Usenet NZBGeek, NZBIndex and Usenet Binsearch. Check that pagination functions correctly with stable totals across pages. |
| `/movies` | "Forrest Gump" | UI renders results grid from Indexers All Results, Prowlarr, Torrentio, Usenet All Results, Usenet NZBGeek, NZBIndex and Usenet Binsearch; Prowlarr filtered by category Movies 2000. Check that pagination functions correctly with stable totals across pages. |
| `/shows` | "Breaking Bad" | UI renders results grid from Indexers All Results, Prowlarr, Torrentio, Usenet All Results, Usenet NZBGeek, NZBIndex and Usenet Binsearch; Prowlarr filtered by category TV 5000. Check that pagination functions correctly with stable totals across pages. |
| `/music` | "Michael Jackson" | UI renders results grid from Indexers All Results, Prowlarr, Usenet All Results, Usenet NZBGeek, NZBIndex and Usenet Binsearch; Prowlarr filtered by category Audio 3000 (**Important: No Torrentio added**). Check that pagination functions correctly with stable totals across pages. |

### Source Selector ALL/Children Sync
- Selecting **Indexers - ALL** checks Prowlarr and Torrentio; deselecting unchecks both.
- Selecting **Usenet - ALL** checks NZBGeek, NZBIndex, and Binsearch; deselecting unchecks all three.
- Checking every child re-checks the ALL pill; unchecking any child unchecks the ALL pill.
- **Usenet - ALL** is checked by default on all four views.

### Usenet Individual Sources
- NZBGeek, NZBIndex, and Binsearch each return results individually (not just ALL).
- NZBGeek API errors (e.g., error 103 IP not approved) surface as warnings in the search status line instead of silently returning 0 results.

### Torrentio Text Queries
- Torrentio resolves text queries via local IMDb ID lookup before calling the Stremio addon.
- Multiple IMDb IDs are fetched, deduplicated by hash/magnet, and paginated together.
- Pagination totals stay stable across pages (74 results on page 1 should remain 74 on page 2).

## 2. DISCOVER FUNCTIONALITY (Metadata Action Flow)

For each route below, verify that entering the query and clicking the secondary **Discover** button dispatches requests and renders results from metadata sources only:

| Route | Query | Expected |
|-------|-------|----------|
| `/browse` | "Nocturne" | UI renders results from local IMDb only (unfiltered). Check that pagination functions correctly. |
| `/movies` | "Forrest Gump" | UI renders results from local IMDb only (movies filter applied). Check that pagination functions correctly. |
| `/shows` | "Breaking Bad" | UI renders results from local IMDb only (TV shows & series filter applied). Check that pagination functions correctly. |
| `/music` | "Michael Jackson" | UI renders results from MusicBrainz API only. Check that pagination functions correctly. |

## 3. INITIAL LOAD, STATE TRANSITIONS & RESPONSIVE UI BEHAVIOR

- **Initial Load:** Verify that `/browse`, `/movies`, `/shows`, and `/music` display ONLY the centered hero search bar (`.input-group-lg`) on initial page load. Confirm no auto-search triggers and no empty result grids or placeholder containers are present in the DOM below the input.
- **Loading & Empty States:** Verify that submitting a query displays skeleton loading cards (`.placeholder-glow`) before results populate, and a clean alert card if 0 results are returned.
- **Responsive Grid:** Verify that the media card container adapts correctly across viewports with correct poster aspect ratios for each version.
- **Pagination:** Verify pagination controls function correctly across all routes, updating URL search parameters (`?page=N`) and refreshing the grid view when items exceed one page. URL state (`?page=N`, `?q=`) is persisted via `history.replaceState` and restored on refresh/shared links.

## 4. LIBRARY & CALENDAR

### Library
- Verify user library items render correctly using a valid TorBox API Key injected into the browser session/localStorage.
- Verify all library items are returned (no server-side truncation); client-side pagination shows 20 items per page with correct totals.
- Verify library items show full content: progress bar, download/upload speed, ETA, download state, size, creation date, hash, and complete file list.
- Verify action links on each item: view details (IMDb), copy magnet link, download files (individual file download links when available).
- Verify client-side search, sort (added/name/size/status), and filter (all/video/music/other) work without reloads.
- Verify library pagination functions correctly across pages.

### Calendar
- Verify the calendar view grid renders correctly with streaming-platform results (TVMaze web schedule: Netflix, Prime Video, HBO Max, Disney+, etc.).
- Verify clicking any calendar item triggers navigation to its corresponding title detail page (`/title/:id` if IMDb ID available, or `/browse?q=<show name>&kind=series` if not).
- Verify calendar search filters by title or show name.
- Verify platform dropdown is populated from calendar data and filtering works.
- Verify date picker allows selecting any date to view that day's streaming schedule.

## 5. ITEM DETAIL ROUTES & RENDERING

- **Movie Detail:** Verify `/title/tt0109830?kind=movie` renders the movie correctly with a 2:3 poster container, metadata badges, release year, genres, overview layout, and action buttons (Open on IMDb, Search Torrents, Search Usenet).
- **TV Show Detail:** Verify `/title/tt0903747?kind=series` renders the TV show correctly with poster, metadata, action buttons, and overview layout.
- **Music Release Detail:** Verify `/music/release/a87dfac7-aca6-42e0-93cd-da849434cf6d` renders the music release correctly with square cover art (1:1 ratio), metadata, tracklist, and details.
- **TVMaze Show Detail:** Verify `/tvmaze/90392` renders the TVMaze show correctly with poster, metadata, summary, network, status, and action buttons (Open Local Title, Open on IMDb, Search Usenet).
- **Poster Caption:** Verify artwork source (e.g., "TMDB") appears as a centered caption below the poster image on title detail pages.
- **Responsive Detail Layout:** Verify title detail pages stack poster and info vertically on mobile, side-by-side on desktop (≥768px).

## 6. ENVIRONMENT & CONFIGURATION

- Verify `TORZNAB_URL` and `TORZNAB_API_KEY` are configured for Prowlarr indexer searches.
- Verify `NZBGEEK_API_HOST`, `NZBGEEK_API_KEY`, `NZBGEEK_WHITELIST_IP` are configured for NZBGeek usenet searches.
- Verify `TORBOX_API_KEY` is configured for TorBox cloud library/music operations.
- Verify production `.env` is used without modification for production testing.

## 7. E2E TEST SUITES

Existing Playwright test suites in `tests/e2e/`:

| Suite | Description |
|-------|-------------|
| `pagination-consistency.spec.ts` | Pagination totals stability, URL state, source selector sync |
| `initial-load-ui.spec.ts` | Initial load, skeletons, empty states, responsive grid |
| `discover-functionality.spec.ts` | Discover action flow |
| `search-functionality.spec.ts` | Dual action flow across all routes |
| `library-calendar.spec.ts` | Library and calendar functionality |
| `item-detail-routes.spec.ts` | Item detail page rendering |
| `usenet-pipeline.spec.ts` | Usenet pipeline functionality |
| `media-manager.spec.ts` | Media manager operations |
| `simple.spec.ts` | Basic smoke tests |
| `simple_search.spec.ts` | Basic search smoke tests |

**Run with:** `BASE_URL=http://<host>:8066 npx playwright test`

**Production URL:** `http://192.168.1.5:8066`
