# TorBox Media Manager

A self-hosted, local-first media catalog. Movie and series metadata comes from IMDb's public downloadable datasets, TV schedules come from TVMaze and are cached locally, and cloud library/music operations use TorBox when `TORBOX_API_KEY` is configured. No paid metadata API is used. IMDb makes these datasets available for personal, non-commercial use under its dataset terms; review those terms before using or redistributing the imported data.

## Start with Docker

1. Copy `.env.example` to `.env` and optionally set `TORBOX_API_KEY`.
2. Set `HOST_MEDIA_PATH` to the media directory on the host.
3. Run `docker compose up --build` and open <http://localhost:6666>.

The default SQLite database and IMDb downloads persist in `./data`. On an empty database, the app starts and begins its one-time IMDb import in the background; the catalog fills as streaming batches are ingested. Large public datasets can take a while to download and import. Set `IMDB_AUTO_IMPORT=false` to disable startup import, then use `POST /admin/imdb/import` when ready.

## Optional PostgreSQL

Set `DATABASE_URL=postgres://user:password@db:5432/torbox_mediamanager` in `.env`, configure the `POSTGRES_*` values to match, and run:

```sh
docker compose --profile postgres up --build
```

For a PostgreSQL server outside Compose, use its reachable connection URL and omit the profile.

## Routes

- `/` — paginated browser for IMDb movies/shows and local media, TorBox music, and the TVMaze schedule.
- `GET /movies` and `GET /shows` — IMDb catalog; accepts `q`, `limit` (max 200), and `offset`.
- `GET /browse` — combined IMDb discovery; accepts `kind=movie|series|all`; with a TorBox key, `hash=<40-character-info-hash>` checks its cache status.
- `GET /calendar?date=YYYY-MM-DD&country=US` — TVMaze broadcast schedule. Use `type=web` for the web schedule. Cached results are returned if TVMaze is unavailable.
- `GET /library?limit=50&offset=0` — local scan and, when configured, TorBox cloud list.
- `GET /music?q=...` or `/library/music` — audio-only view of files in the authenticated TorBox account.
- `GET /music/:torrentId/:fileId/stream` — asks TorBox for a file URL and redirects to it.
- `GET /health`, `/library/status`, and `/admin/imdb/status` — service and import status.
- `POST /library/scan`, `POST /library/sync`, and `POST /admin/imdb/import` — trigger scans/syncs/imports.

IMDb ingestion reads TSV rows incrementally and writes small batches to SQLite/PostgreSQL. The dataset files are saved under `IMDB_DATA_PATH`, so subsequent imports use the local copy. TVMaze responses are cached according to `TVMAZE_SYNC_INTERVAL` (default 24 hours), with stale cache fallback when its API cannot be reached. The browser fetches catalog and local-library pages incrementally. Local catalog and schedule routes work without a TorBox key; music/cloud operations return 503 until it is configured.

The server is intended for a trusted self-hosted network and does not implement user authentication. Do not expose it directly to the public internet.
