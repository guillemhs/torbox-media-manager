# TorBox Media Manager

A self-hosted, local-first media catalog. Movie and series metadata comes from IMDb's public downloadable datasets, TV schedules come from TVMaze and are cached locally, and cloud library/music operations use TorBox when `TORBOX_API_KEY` is configured. No paid metadata API is used. IMDb makes these datasets available for personal, non-commercial use under its dataset terms; review those terms before using or redistributing the imported data.

## Start with Docker

1. Copy `.env.example` to `.env` and optionally set `TORBOX_API_KEY`.
2. Set `HOST_MEDIA_PATH` to the media directory on the host.
3. Run `docker compose up --build -d` and open <http://localhost:8066>.

PostgreSQL and IMDb downloads persist under `./data`. Compose waits for PostgreSQL's health check before starting the app. On an empty or incomplete database, the app starts and begins/resumes its IMDb import in the background; the catalog fills as streaming batches are ingested. Large public datasets can take a while to download and import. Set `IMDB_AUTO_IMPORT=false` to disable startup import, then use `POST /admin/imdb/import` when ready. Compose restarts the app after failures, checks `/health`, and rotates container logs.

## PostgreSQL

The default `.env.example` uses PostgreSQL. Set a strong `POSTGRES_PASSWORD` and matching `DATABASE_URL` in `.env`, for example `postgresql://user:your-password@db:5432/torbox_mediamanager`. Keep `POSTGRES_DB`, `POSTGRES_USER`, and the URL in sync, then run:

```sh
docker compose up --build -d
```

PostgreSQL files persist in `./data/postgres` by default. Set `POSTGRES_DATA_PATH` to move that folder. Do not delete it if you want to preserve the database. For a PostgreSQL server outside Compose, use its reachable connection URL and remove or disable the Compose `db` service.

The previous Compose file used a named volume called `postgres_data`. If you already stored data in that volume, changing to `./data/postgres` leaves the old volume intact but starts PostgreSQL with a new, empty data directory. Export and restore your database before switching; do not remove the old volume until the restored database is verified.

## Check it in the browser

After Compose reports the app as healthy, open <http://localhost:8066>. Use the sidebar to switch between Browse, Movies, Shows, TorBox, Local Media, Music, and Calendar. Try searching a title, using **Load more**, and checking that music tracks open through TorBox.

Movie and TV posters are matched from IMDb IDs through TMDB when `TMDB_API_READ_ACCESS_TOKEN` is configured in `.env`; TVMaze supplies a fallback for series posters and artwork in the calendar. TMDB credentials stay on the server. Music cover art is searched lazily from MusicBrainz and Cover Art Archive using album/torrent names, so ambiguous torrent names may not match. Artwork requests are cached in memory for 24 hours. The interface includes source credits; TMDB attribution is required by its API terms.

To enable TMDB posters, request an API Read Access Token in your TMDB account's API settings, add `TMDB_API_READ_ACCESS_TOKEN=...` to `.env`, and recreate the app with `docker compose up --build -d`. TMDB's developer API is for non-commercial use and requires attribution; check its current terms before enabling it for other use.

Music search uses the free MusicBrainz web service for release and artist metadata, with Cover Art Archive artwork. In Browse, use **Search** to browse MusicBrainz releases, or **Search indexers** to search Prowlarr directly with the full query you entered. Compose includes Prowlarr as the indexer manager. Open Prowlarr at `http://<server-ip>:9696`, add the indexers you are authorized to use, then copy its API key from **Settings → General** into `TORZNAB_API_KEY` in `.env`. Set `TORZNAB_URL` to a Prowlarr Torznab feed URL (usually `http://prowlarr:9696/<indexer-id>/api` from inside the Compose network); the app derives the Prowlarr aggregate search endpoint from this URL and queries all enabled indexers. `TORZNAB_MUSIC_CATEGORY` defaults to `3000`; movie and TV searches use categories `2000` and `5000`. Torrent results from Prowlarr are combined with Torrentio for movies and shows. For an indexer that requires FlareSolverr, go to **Settings → Indexers → Indexer Proxies → Add → FlareSolverr**. Set Host to `http://flaresolverr:8191` and give the proxy a tag such as `flaresolverr`; then edit that indexer and add the same tag. The FlareSolverr service is internal to the Compose network and has no published host port. Prowlarr uses the proxy only for matching tags when Cloudflare is detected. Restart with `docker compose up -d` after editing `.env` or Compose. Prowlarr's config persists in `./data/prowlarr` by default. Music, movie, and show candidates use the same **Add cached** action, which asks TorBox to add only torrents it already has cached.

### Torrentio (Stremio addon)

Torrentio resolves streams by IMDb ID, not by free text. When you search with only Torrentio selected, the app internally looks up the query in the local IMDb database to get IMDb ID(s), then calls Torrentio with those IMDb IDs — but only Torrentio results are shown.

- If the IMDb database returns more than one IMDb ID, results from every ID are fetched, deduplicated by hash/magnet, and paginated together.
- Torrentio works without Prowlarr/Torznab configuration; only the Prowlarr branch requires `TORZNAB_URL`/`TORZNAB_API_KEY`.
- Pagination totals stay stable across pages: each provider is fetched once (`limit=100, offset=0`), results are deduplicated by hash across all providers/IMDb IDs, then sliced per page. A 5-minute in-memory cache prevents totals from drifting while you navigate pages.

### Library (TorBox cloud)

The TorBox library view shows **all** torrent downloads from your account with complete details:

- **Complete library** — all items are loaded (no server-side truncation); client-side pagination shows 20 items per page with correct totals.
- **Full item content** — each item shows progress bar, download/upload speed, ETA, download state, size, creation date, hash, and the complete file list.
- **Action links** — every item has clickable links: view details (IMDb), copy magnet link, download files (individual file download links when available), and delete torrent (permanently removes from TorBox account).
- **Client-side search/filter/sort** — search by name, sort by added/name/size/status, and filter by all/video/music/other. All operations work locally on the loaded library without new TorBox queries.

### Calendar (TVMaze streaming schedule)

The Calendar view shows upcoming TV episodes from streaming platforms via TVMaze's web schedule API:

- **Streaming platforms** — defaults to TVMaze's web schedule showing Netflix, Prime Video, HBO Max, Disney+, and other streaming services. Use the platform filter to narrow to a specific service.
- **Working links** — click any episode to view its details page (IMDb title or TVMaze show page).
- **Date picker** — select any date to view that day's streaming schedule.
- **Platform filter** — the platform dropdown is automatically populated from the calendar data.

### Usenet (NZBGeek, NZBIndex, Binsearch)

Usenet search works both individually and as **All**:

- **NZBGeek** — Newznab API via `NZBGEEK_API_HOST`/`NZBGEEK_API_KEY`. If NZBGeek rejects the request (for example error `103: IP Address … Not Approved` because your egress IP isn't whitelisted), the error is surfaced as a warning in the search status line instead of silently returning 0 results. The observed egress IP is logged next to `NZBGEEK_WHITELIST_IP` so you know which IP to whitelist on NZBGeek.
- **NZBIndex** — JSON API, no key required.
- **Binsearch** — HTML scraping of `/details/<id>` result links (with checkbox `name` fallback).

Set `NZBGEEK_API_HOST`, `NZBGEEK_API_KEY`, `NZBGEEK_WHITELIST_IP`, `NZBGEEK_REQUEST_TIMEOUT_MS`, and `NZBGEEK_MAX_RETRIES` in `.env` for NZBGeek.

### Source selector ALL / children sync

In the search box, each view has **Indexers** (ALL / Prowlarr / Torrentio) and **Usenet** (ALL / NZBGeek / NZBIndex / Binsearch) pills:

- Selecting **Indexers - ALL** checks Prowlarr and Torrentio; deselecting it unchecks both.
- Selecting **Usenet - ALL** checks NZBGeek, NZBIndex, and Binsearch; deselecting it unchecks all three.
- Checking every child re-checks the ALL pill; unchecking any child unchecks the ALL pill.
- `Usenet - ALL` is checked by default on Browse, Movies, Shows, and Music.

## Routes

- `/` — Puppertino browser for IMDb movies/shows, local media, TorBox torrents/music, and the TVMaze schedule.
- `GET /movies` and `GET /shows` — IMDb catalog; accepts `q`, `limit` (max 200), and `offset`.
- `GET /browse` — combined IMDb discovery; accepts `kind=movie|series|all`; with a TorBox key, `hash=<40-character-info-hash>` checks its cache status.
- `GET /calendar?date=YYYY-MM-DD&country=US` — TVMaze schedule. Defaults to web schedule (streaming platforms: Netflix, Prime Video, HBO Max, etc.). Use `type=broadcast` for local broadcast TV. Cached results are returned if TVMaze is unavailable.
- `GET /library?limit=50&offset=0` — local scan and, when configured, TorBox cloud list.
- `GET /music?q=...` or `/library/music` — audio-only view of files in the authenticated TorBox account.
- `GET /music/search?q=...` — release and artist search via MusicBrainz.
- `GET /music/recent` — MusicBrainz releases dated within the last 60 days, sorted newest first; used by Music discovery and independent of the TorBox API.
- `GET /music/torrents/search?q=...` — music torrent candidates from the configured Torznab source.
- `GET /music/:torrentId/:fileId/stream` — asks TorBox for a file URL and redirects to it.
- `POST /torbox/torrents` — submit a magnet URI or 40-character info hash to TorBox. The browser never downloads the media to this server. Set `addOnlyIfCached: true` to only add items TorBox already has cached.
- `GET /usenet/search?q=...&source=all|NZBIndex|Binsearch` — search configured NZB indexes.
- `POST /torbox/usenet` — submit `{ source, id, name?, addOnlyIfCached? }`; the server passes the NZB to TorBox as the download job with default post-processing, so extracted audio/video files—not the NZB—appear in the TorBox library. The library includes Usenet download entries and links to their actual media files through TorBox's Usenet download endpoint.
- `GET /health`, `/library/status`, and `/admin/imdb/status` — service and import status.
- `POST /library/scan`, `POST /library/sync`, and `POST /admin/imdb/import` — trigger scans/syncs/imports.

IMDb ingestion reads TSV rows incrementally and writes small batches to SQLite/PostgreSQL. The dataset files are saved under `IMDB_DATA_PATH`, so subsequent imports use the local copy. TVMaze responses are cached according to `TVMAZE_SYNC_INTERVAL` (default 24 hours), with stale cache fallback when its API cannot be reached. The browser fetches catalog and local-library pages incrementally. Puppertino 2.0 is bundled locally. Local catalog and schedule routes work without a TorBox key; music/cloud operations return 503 until it is configured.

The server is intended for a trusted self-hosted network and does not implement user authentication. Do not expose it directly to the public internet.

## Environment variables

| Variable | Purpose |
|---|---|
| `TORBOX_API_KEY` | TorBox account key for cloud library/music operations |
| `TORZNAB_URL` | Prowlarr Torznab feed URL (e.g. `http://your-prowlarr-instance/api`) |
| `TORZNAB_API_KEY` | Prowlarr API key |
| `TORZNAB_MUSIC_CATEGORY` | Prowlarr category for music searches (default `3000`) |
| `NZBGEEK_API_HOST` | NZBGeek Newznab API host |
| `NZBGEEK_API_KEY` | NZBGeek API key |
| `NZBGEEK_WHITELIST_IP` | Reference IP whitelisted on NZBGeek (for dynamic-IP tracking) |
| `NZBGEEK_REQUEST_TIMEOUT_MS` | NZBGeek request timeout (default `30000`) |
| `NZBGEEK_MAX_RETRIES` | NZBGeek retry count on transient failures (default `3`) |
| `TMDB_API_READ_ACCESS_TOKEN` | TMDB read access token for posters |
| `IMDB_AUTO_IMPORT` | Enable/disable startup IMDb import |
| `IMDB_DATA_PATH` | Path for downloaded IMDb dataset files |
| `TVMAZE_SYNC_INTERVAL` | TVMaze cache interval in hours (default `24`) |
| `HOST_MEDIA_PATH` | Host media directory |
| `POSTGRES_PASSWORD`, `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_DATA_PATH` | PostgreSQL configuration |

## Repository Documentation

The following Markdown documents are available in the repository:

| File | Description |
|------|-------------|
| [README.md](README.md) | This file — project overview, features, routes, environment variables, and license information. |
| [INSTALL.md](INSTALL.md) | Complete self-hosted installation guide — prerequisites, Docker Compose setup, environment configuration, Prowlarr/TorBox/Usenet configuration, backup, and troubleshooting. |
| [RELEASE_NOTES.md](RELEASE_NOTES.md) | Release notes for version `202611` — changelog, bug fixes, new features, environment variables, and deployment instructions. |
| [QA_TEST_PROMPT.md](QA_TEST_PROMPT.md) | QA automation test specification — end-to-end test criteria for search, discover, initial load, library, calendar, and item detail routes using Playwright. |
| [constitution.md](constitution.md) | Project constitution — mission, vision, data philosophy, operating modes, and supported data sources (IMDb, TVMaze, TorBox). |
| [devArchitect.md.agent.md](devArchitect.md.agent.md) | Autonomous agent directive — system prompt and core rules for the devArchitect autonomous repository maintainer agent. |
| [LICENSE](LICENSE) | GNU Affero General Public License v3.0 (AGPL-3.0-or-later) — full license text. |

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-or-later).
See the [LICENSE](LICENSE) file for the full license text.

The AGPL-3.0 requires that if you run a modified version of this software on a server
and allow users to interact with it remotely through a computer network, you must make
the Corresponding Source available to those users at no charge. This includes any
modifications you make to the TorBox Media Manager codebase.
