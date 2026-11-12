# TorBox Media Manager — Release Notes

**Release:** `20261111`  
**Date:** 2026-11-11  
**Previous release:** `20261106`  
**Deployed:** `user@0.0.0.0:/opt/torbox-media-manager` (production, `http://localhost:8066`)

---

## 🎯 Highlights

- **Torrentio text queries now return results** — Torrentio's Stremio addon resolves streams by IMDb ID, not free text. The app now looks up text queries in the local IMDb database to get IMDb ID(s), then calls Torrentio with those IMDb IDs. Only Torrentio results are shown when Torrentio is the sole source selected.
- **Stable pagination totals** — page 1 no longer shows a different total than page 2. Each provider is fetched once (`limit=100, offset=0`), results are deduplicated by hash/magnet across all providers and IMDb IDs, then sliced per page. A 5-minute provider cache prevents totals from drifting while navigating pages.
- **Usenet works per source and as "All"** — NZBGeek, NZBIndex, and Binsearch now return results individually; `usenetSource=all` returns all sources combined. NZBGeek API errors (e.g. `103: IP Address … Not Approved`) are surfaced as warnings instead of silently returning 0 results.
- **Source selector ALL ↔ children sync** — selecting **Indexers - ALL** checks Prowlarr + Torrentio; deselecting unchecks both. Same for **Usenet - ALL** ↔ NZBGeek/NZBIndex/Binsearch. `Usenet - ALL` is checked by default on Browse, Movies, Shows, and Music.
- **URL state persistence** — `?page=N` and `?q=` are synced into the URL and restored on refresh/shared links.
- **E2e test suites** — Playwright coverage for pagination consistency, source-selector sync, URL state, initial load/UI, and discover functionality.

---

## 🐛 Bug fixes

### Search / indexers
- **Torrentio text queries** — resolve to local IMDb IDs before calling the Stremio addon; per-ID movie/series kind selection based on `titleType`; multiple IMDb IDs are fetched, deduplicated, and paginated together. (`dfe2e4f`, `d5865ec`)
- **Pagination totals drift** — fetch full batch per provider, dedupe by hash/magnet, slice per page; 5-minute in-memory provider result cache. (`facd452`, `93a4eac`)
- **`usenetSource=all` returned 0 results** — routes passed an empty source list; now `undefined` means all sources. (`6a7f470`)
- **Usenet no longer gated on Torznab config** — usenet search works without `TORZNAB_URL`/`TORZNAB_API_KEY`. (`6a7f470`)
- **Binsearch returned 0 results individually** — parser now reads `/details/<id>` result links with checkbox `name` attribute fallback. (`a80aaca`)
- **NZBGeek `<error>` responses ignored** — Newznab `<error code description>` bodies (HTTP 200) now throw and surface as warnings; observed egress IP logged next to `NZBGEEK_WHITELIST_IP`. (`cd6e643`)
- **Season/episode parsing** — queries like `silo s03` are stripped to the base title for IMDb lookups so Torrentio series searches return results. (`d5865ec`)

### Frontend / UI
- **Source selector ALL sync** — bidirectional check/uncheck between ALL pills and their children; deselecting ALL leaves nothing selected. (`0f4feab`)
- **Skeleton loading cards** — `placeholder-glow` skeletons shown while searching; dedicated empty-state container per view. (`2e01e21`)
- **SPA fallback** — `/library` and `/music` serve `index.php` for HTML Accept headers instead of 404ing on JSON API routes. (`db054c4`, `7b868d5`)
- **Pagination in URL** — `?page=N` and `?q=` persisted via `history.replaceState`; `loadView()` restores state on refresh. (`bb1db75`)
- **SyntaxError on music pages** — fixed `onerror` handler in `renderSearchItem` that used backslash-escaped quotes (`\"`) inside HTML attributes, which broke attribute parsing and caused `Invalid or unexpected token` errors. Now uses `&quot;` HTML entities. (`e8f3736`)
- **Clearer API errors** — `jsonFetch` now validates `Content-Type` before parsing JSON, throwing a descriptive error if HTML is returned instead of JSON. (`e8f3736`)

### Usenet pipeline
- **NZB download endpoint** — TorBox Web Download expects `link` field, not `url`. (`7729338`)
- **Usenet download** — removed non-existent upload endpoint, uses `createusenetdownload`. (`20606a9`)
- **Temp download DNS** — changed to `usenet-dl.tatsukai.com` with Nginx reverse proxy config. (`eba77e4`)

### Library
- **Complete library with client-side pagination** — backend returns ALL TorBox items (no server-side pagination); frontend paginates client-side (20/page) with correct totals. (`58253e5`)
- **Full item content** — library items show progress bar, download/upload speed, ETA, download state, creation date, hash, and complete file list. (`58253e5`)
- **Action links on every item** — view details (IMDb), copy magnet, download files, and per-file download links. (`58253e5`)
- **Client-side search/filter/sort** — library search, sort (created/name/size/status), and filter (all/video/music/other) all work client-side without reloads. (`58253e5`)
- **Delete torrent** — delete button (trash icon) on each library item uses `POST /v1/api/torrents/controltorrent` with `operation=delete` to permanently remove torrents from your TorBox account. (`c3c8ae0`)

### Calendar
- **Streaming-platform relevant results** — calendar now defaults to TVMaze's web schedule (`/schedule/web`) showing streaming platforms (Netflix, Prime Video, HBO Max, Disney+, etc.) instead of broadcast TV. (`b2130a2`)
- **Working episode links** — calendar episode cards link to title details (`/title/:imdbId` or `/tvmaze/:id`). (`3fcb08f`)
- **Platform filter** — platform dropdown is populated from calendar data; filter by any streaming service. (`3fcb08f`)
- **Date picker** — select any date to view that day's streaming schedule. (`3fcb08f`)
- **Template literal fix** — calendar summary count now renders correctly instead of showing raw `${...}` syntax. (`edbd581`)
- **HTML stripping fix** — episode summaries strip HTML tags before escaping, so `<p>` tags don't appear as literal text. (`edbd581`)

### Title Detail Pages
- **Action buttons** — every title detail page now has action buttons: Open on IMDb, Search Torrents (Prowlarr/Torrentio), and Search Usenet (NZBGeek/NZBIndex/Binsearch). (`e49a6f4`)
- **Responsive poster** — title detail posters are now responsive with proper aspect ratios (2:3 for movies/series) and side-by-side layout on desktop. (`f60a146`)

---

## ✨ Features

- Individual indexer selection (Prowlarr / Torrentio) with pill groups. (`428738e`, `5ed29dc`)
- Torrentio results added to Indexers search. (`6b8f71e`)
- Torrentio selection bypasses Prowlarr when Prowlarr is not configured. (`bc15527`, `b1ae673`)
- Prowlarr timeout increased to wait longer for results. (`aa976bb`)
- Detailed indexer search logging on the frontend. (`f823070`, `37b1b22`)

---

## 🧪 Testing

Added Playwright E2e suites (`tests/e2e/`):
- `pagination-consistency.spec.ts` — stable totals across pages, URL state (`?page=N`), source-selector sync.
- `initial-load-ui.spec.ts` — initial load hero bar, skeletons, empty states, responsive grid, pagination.
- `discover-functionality.spec.ts` — metadata action flow (local IMDb / MusicBrainz).
- `search-functionality.spec.ts` — dual action flow (Search / Discover) across `/browse`, `/movies`, `/shows`, `/music`.
- `library-calendar.spec.ts`, `item-detail-routes.spec.ts`, `usenet-pipeline.spec.ts`, `media-manager.spec.ts`.

Tests run against production via `BASE_URL=http://<host>:8066 npx playwright test`.

---

## 📦 Environment variables

| Variable | Purpose |
|---|---|
| `TORBOX_API_KEY` | TorBox account key for cloud library/music |
| `TORZNAB_URL` | Prowlarr Torznab feed URL |
| `TORZNAB_API_KEY` | Prowlarr API key |
| `TORZNAB_MUSIC_CATEGORY` | Prowlarr category for music (default `3000`) |
| `NZBGEEK_API_HOST` | NZBGeek Newznab API host |
| `NZBGEEK_API_KEY` | NZBGeek API key |
| `NZBGEEK_WHITELIST_IP` | Reference IP whitelisted on NZBGeek |
| `NZBGEEK_REQUEST_TIMEOUT_MS` | NZBGeek request timeout (default `30000`) |
| `NZBGEEK_MAX_RETRIES` | NZBGeek retry count (default `3`) |
| `TMDB_API_READ_ACCESS_TOKEN` | TMDB read access token for posters |
| `IMDB_AUTO_IMPORT` | Enable/disable startup IMDb import |
| `IMDB_DATA_PATH` | Path for downloaded IMDb dataset files |
| `TVMAZE_SYNC_INTERVAL` | TVMaze cache interval in hours (default `24`) |

See `README.md` for full environment documentation.

---

## 🚀 Deployment

```bash
git fetch origin && git reset --hard origin/main
docker compose build app
docker compose up -d app
curl -fsS http://localhost:8066/health
```

The app is deployed at `http://0.0.0.0:8066` and responds `HTTP 200` on `/health`.

---

> ⚠️ Security: If you pasted an NZBGeek API key in chat or logs, rotate it on NZBGeek and keep it only in the production `.env`.

