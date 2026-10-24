# TorBox Media Manager

A self-hosted, local-first media catalog. Movie and series metadata comes from IMDb's public downloadable datasets, TV schedules come from TVMaze and are cached locally, and cloud library/music operations use TorBox when `TORBOX_API_KEY` is configured. No paid metadata API is used. IMDb makes these datasets available for personal, non-commercial use under its dataset terms; review those terms before using or redistributing the imported data.

## Start with Docker

1. Copy `.env.example` to `.env` and optionally set `TORBOX_API_KEY`.
2. Set `HOST_MEDIA_PATH` to the media directory on the host.
3. Run `docker compose up --build -d` and open <http://localhost:6666>.

PostgreSQL and IMDb downloads persist under `./data`. Compose waits for PostgreSQL's health check before starting the app. On an empty or incomplete database, the app starts and begins/resumes its IMDb import in the background; the catalog fills as streaming batches are ingested. Large public datasets can take a while to download and import. Set `IMDB_AUTO_IMPORT=false` to disable startup import, then use `POST /admin/imdb/import` when ready. Compose restarts the app after failures, checks `/health`, and rotates container logs.

## PostgreSQL

The default `.env.example` uses PostgreSQL. Set a strong `POSTGRES_PASSWORD` and matching `DATABASE_URL` in `.env`, for example `postgresql://user:your-password@db:5432/torbox_mediamanager`. Keep `POSTGRES_DB`, `POSTGRES_USER`, and the URL in sync, then run:

```sh
docker compose up --build -d
```

PostgreSQL files persist in `./data/postgres` by default. Set `POSTGRES_DATA_PATH` to move that folder. Do not delete it if you want to preserve the database. For a PostgreSQL server outside Compose, use its reachable connection URL and remove or disable the Compose `db` service.

The previous Compose file used a named volume called `postgres_data`. If you already stored data in that volume, changing to `./data/postgres` leaves the old volume intact but starts PostgreSQL with a new, empty data directory. Export and restore your database before switching; do not remove the old volume until the restored database is verified.

## Check it in the browser

After Compose reports the app as healthy, open <http://localhost:6666>. Use the sidebar to switch between Browse, Movies, Shows, TorBox, Local Media, Music, and Calendar. Try searching a title, using **Load more**, and checking that music tracks open through TorBox.

Movie and TV posters are matched from IMDb IDs through TMDB when `TMDB_API_READ_ACCESS_TOKEN` is configured in `.env`; TVMaze supplies a fallback for series posters and artwork in the calendar. TMDB credentials stay on the server. Music cover art is searched lazily from MusicBrainz and Cover Art Archive using album/torrent names, so ambiguous torrent names may not match. Artwork requests are cached in memory for 24 hours. The interface includes source credits; TMDB attribution is required by its API terms.

To enable TMDB posters, request an API Read Access Token in your TMDB account's API settings, add `TMDB_API_READ_ACCESS_TOKEN=...` to `.env`, and recreate the app with `docker compose up --build -d`. TMDB's developer API is for non-commercial use and requires attribution; check its current terms before enabling it for other use.

Music search uses the free MusicBrainz web service for release and artist metadata, with Cover Art Archive artwork. In Browse, use **Search** to browse MusicBrainz releases, or **Search indexers** to search Prowlarr directly with the full query you entered. Compose includes Prowlarr as the indexer manager. Open Prowlarr at `http://<server-ip>:9696`, add the indexers you are authorized to use, then copy its API key from **Settings → General** into `TORZNAB_API_KEY` in `.env`. Set `TORZNAB_URL` to a Prowlarr Torznab feed URL (usually `http://prowlarr:9696/<indexer-id>/api` from inside the Compose network); the app derives the Prowlarr aggregate search endpoint from this URL and queries all enabled indexers. `TORZNAB_MUSIC_CATEGORY` defaults to `3000`; movie and TV searches use categories `2000` and `5000`. Torrent results from Prowlarr are combined with Torrentio for movies and shows. For an indexer that requires FlareSolverr, go to **Settings → Indexers → Indexer Proxies → Add → FlareSolverr**. Set Host to `http://flaresolverr:8191` and give the proxy a tag such as `flaresolverr`; then edit that indexer and add the same tag. The FlareSolverr service is internal to the Compose network and has no published host port. Prowlarr uses the proxy only for matching tags when Cloudflare is detected. Restart with `docker compose up -d` after editing `.env` or Compose. Prowlarr's config persists in `./data/prowlarr` by default. Music, movie, and show candidates use the same **Add cached** action, which asks TorBox to add only torrents it already has cached.

To check adding a torrent, choose **Add to TorBox**, paste a magnet URI or info hash you are authorized to use, and submit it. **Only add if TorBox already has it cached** prevents uncached items from being added. The page should show TorBox's response; the TorBox library view should then list the item. This sends the magnet/hash to TorBox through the app and does not download the media to the app host.

For a quick service check, run `docker compose ps` and confirm `app` is `healthy`, then `curl -fsS http://localhost:6666/health` and `curl -fsS http://localhost:6666/admin/imdb/status`. The UI can browse the rows already imported while the IMDb import is still running.

## Routes

- `/` — Puppertino browser for IMDb movies/shows, local media, TorBox torrents/music, and the TVMaze schedule.
- `GET /movies` and `GET /shows` — IMDb catalog; accepts `q`, `limit` (max 200), and `offset`.
- `GET /browse` — combined IMDb discovery; accepts `kind=movie|series|all`; with a TorBox key, `hash=<40-character-info-hash>` checks its cache status.
- `GET /calendar?date=YYYY-MM-DD&country=US` — TVMaze broadcast schedule. Use `type=web` for the web schedule. Cached results are returned if TVMaze is unavailable.
- `GET /library?limit=50&offset=0` — local scan and, when configured, TorBox cloud list.
- `GET /music?q=...` or `/library/music` — audio-only view of files in the authenticated TorBox account.
- `GET /music/search?q=...` — release and artist search via MusicBrainz.
- `GET /music/torrents/search?q=...` — music torrent candidates from the configured Torznab source.
- `GET /music/:torrentId/:fileId/stream` — asks TorBox for a file URL and redirects to it.
- `POST /torbox/torrents` — submit a magnet URI or 40-character info hash to TorBox. The browser never downloads the media to this server. Set `addOnlyIfCached: true` to only add items TorBox already has cached.
- `GET /health`, `/library/status`, and `/admin/imdb/status` — service and import status.
- `POST /library/scan`, `POST /library/sync`, and `POST /admin/imdb/import` — trigger scans/syncs/imports.

IMDb ingestion reads TSV rows incrementally and writes small batches to SQLite/PostgreSQL. The dataset files are saved under `IMDB_DATA_PATH`, so subsequent imports use the local copy. TVMaze responses are cached according to `TVMAZE_SYNC_INTERVAL` (default 24 hours), with stale cache fallback when its API cannot be reached. The browser fetches catalog and local-library pages incrementally. Puppertino 2.0 is bundled locally. Local catalog and schedule routes work without a TorBox key; music/cloud operations return 503 until it is configured.

The server is intended for a trusted self-hosted network and does not implement user authentication. Do not expose it directly to the public internet.
