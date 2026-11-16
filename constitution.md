# Torbox Media Manager - Constitution

## 🎯 Mission & Vision
This application is a **free, open-source, local-first media manager**. All metadata is sourced from open datasets and free public APIs, running entirely offline where possible.

Integration with Torbox cloud infrastructure is supported for cloud library management and music streaming, maintaining a strict zero-paid-API requirement for general metadata.

---

## 📊 Data Philosophy & Operating Modes
- **Zero Paid Metadata APIs**: No TMDB or commercial API subscriptions required.
- **Open Data Sources**: IMDb public datasets for movie/series metadata; TVMaze public API for episode scheduling.
- **Local-First & Data Sovereignty**: All user state, settings, and metadata remain strictly on local storage (SQLite by default, PostgreSQL optional).
- **Fully Self-Hosted**: Operates seamlessly in homelab, VPS, or local environments without telemetry or external user databases.

### Modes of Operation
1. **Local / Offline Mode (Default - Movies & Series)**: 
   - Full access to IMDb catalog browsing, TVMaze scheduling, and local/NAS media library scanning.
2. **Torbox Integrated Mode**:
   - Extends library capabilities to sync directly with Torbox cloud cache.
   - **Mandatory for Media**: Media streaming, discovery, and management require a valid `TORBOX_API_KEY`.
   - Torbox API is the only permitted media/download service provider. NZBIndex and Binsearch are permitted as Usenet search indexes; they do not provide download hosting or media metadata.

---

## 🌐 Data Sources & Integrations

### 1. Movies & Series Metadata (Local-First)
- **IMDb Public Datasets**: Periodic import of local TSV dumps for titles, genres, ratings, and year details. Downloaded once, avoiding recurring web queries.
- **Storage**: Processed into SQLite (zero-config) or PostgreSQL.
- **Text Query Resolution**: Text queries are resolved to IMDb IDs via local database lookup before calling Torrentio Stremio addon. Quality/season/episode tokens (e.g., "1080p", "2160p", "s03e02") are stripped before lookup.

### 2. Calendar & Release Schedules (Free API)
- **TVMaze Public API**: Serves episode schedules, airing dates, and series status. Defaults to web schedule (streaming platforms: Netflix, Prime Video, HBO Max, Disney+, etc.).
- **Caching**: Data is cached locally to prevent rate-limiting and support offline access.
- **Country Filter**: Supports country-filtered TV schedules via country code parameter.
- **Calendar Search**: Client-side search by title or show name across calendar results.
- **Platform Filter**: Dropdown populated dynamically from calendar data.

### 3. Cloud & Music Management (Torbox Service)
- **Torbox API**: Used for streaming, cloud-cached downloads, and searching the Torbox cloud media catalog.
- **Constraint**: Media management **cannot** function without a valid `TORBOX_API_KEY` due to dependency on Torbox's streaming infrastructure.

### 4. Usenet Indexers (Free)
- **NZBGeek**: Newznab API via `NZBGEEK_API_HOST`/`NZBGEEK_API_KEY`. Requires IP whitelisting on NZBGeek.
- **NZBIndex**: JSON API, no key required.
- **Binsearch**: HTML scraping of `/details/<id>` result links.
- **Individual & All Sources**: Each source works individually or combined as "All".

---

## 🗂️ Application Architecture & Route Structure

- **`/`**: Puppertino browser for IMDb movies/shows, local media, TorBox torrents/music, and the TVMaze schedule.
- **`/movies`**: IMDb catalog with trending section. Accepts `q`, `limit` (max 200), and `offset`. Prowlarr filtered by category Movies 2000.
- **`/shows`**: IMDb catalog with trending section. Accepts `q`, `limit` (max 200), and `offset`. Prowlarr filtered by category TV 5000.
- **`/browse`**: Combined IMDb discovery. Accepts `kind=movie|series|all`; with a TorBox key, `hash=<40-character-info-hash>` checks its cache status.
- **`/music`**: Music search, exploration, download and streaming via MusicBrainz and Torbox. **Requires Torbox API Key.**
- **`/calendar`**: TVMaze broadcast schedule. Defaults to web schedule (streaming platforms). Use `type=broadcast` for local broadcast TV. Cached results returned if TVMaze is unavailable. Supports country filter, date picker, source search, and platform filter.
- **`/title/:imdbId`**: Movie and TV show detail page with poster, metadata, overview, and action buttons (Open on IMDb, Search Torrents, Search Usenet).
- **`/tvmaze/:id`**: TVMaze show detail page with poster, metadata, summary, network, status, and action buttons (Open Local Title, Open on IMDb, Search Usenet).
- **`/music/release/:id`**: Music release detail page with square cover art (1:1 ratio), metadata, tracklist, details, and link to MusicBrainz.
- **`/library`**: Local scan and, when configured, TorBox cloud list. Complete library with client-side pagination (20/page), full item content (progress bar, download/upload speed, ETA, download state, size, creation date, hash, complete file list), action links (view details, copy magnet, download files), client-side search/filter/sort, and delete torrent capability.
- **`/api/movies/trending`**: Trending movies from local IMDb dataset (last 2 years, sorted by year desc).
- **`/api/shows/trending`**: Trending TV shows from local IMDb dataset (last 2 years, sorted by year desc).
- **`/api/music/trending`**: Trending music releases from MusicBrainz (sorted by release date desc).
- **`/api/health`**: Service health check.
- **`/admin/imdb/status`**: IMDb import status.
- **`POST /admin/imdb/import`**: Trigger IMDb import.

---

## 🔐 Authentication, Security & Privacy

- **Credential Scope**: `TORBOX_API_KEY` is the only media service credential. NZBIndex and Binsearch search are keyless.
- **No User Databases**: No user registration, no OAuth 2.0, no session persistence outside local storage. Like Debrid Media Manager, session state is client-managed.
- **Privacy First**: Zero telemetry, zero analytics, zero external dependencies for non-cloud features.
- **License**: GNU Affero General Public License v3.0 (AGPL-3.0-or-later). If you run a modified version on a server and allow users to interact with it remotely through a computer network, you must make the Corresponding Source available to those users at no charge.

---

## 🚫 Prohibited Practices

- ❌ No commercial or paid metadata APIs (e.g., TMDB API tier fees).
- ❌ No user account databases or third-party OAuth authentication systems.
- ❌ No integration of payment processing gateways or data monetization routines.
- ❌ Generating code that loads full IMDb TSV files into system memory (must use stream-based parsers).
- ❌ Claiming media management or music features work offline without explicit Torbox integration where required.
- ❌ Hardcoding external domains (e.g., tatsukai.com) in documentation or configuration.

## ✅ Accepted Practices

- ✅ Processing local IMDb TSV dataset dumps via stream handling.
- ✅ Rate-limited caching for free public APIs (TVMaze).
- ✅ TorBox REST API integration and explicitly configured NZBIndex/Binsearch/NZBGeek Usenet search.
- ✅ Support for SQLite (default) and PostgreSQL database backends.
- ✅ Docker single-command setups for self-hosted environments.
- ✅ Stripping quality/resolution tokens (1080p, 2160p, 4k, etc.) from text queries before IMDb lookup.
- ✅ Client-side pagination, search, filter, and sort for library and catalog views.
- ✅ Bootstrap modal dialogs instead of JavaScript `confirm()` for user confirmations.

---

## 📜 Principles for AI-Assisted Development

When using this repository with AI coding assistants:

1. **Zero Paywall Compliance**: Generated code must never assume or enforce paid API dependencies for core movie/series features.
2. **Stream-based IMDb Ingestion**: Parser functions must process TSV files in streams to prevent memory exhaustion on large datasets.
3. **Graceful Fallbacks**: Features targeting Movies/Series must function properly if `TORBOX_API_KEY` is empty.
4. **Strict API Contracts**: Interact with Torbox REST endpoints according to official schemas without inventing unsupported methods.
5. **UI Performance**: UI grids for `/browse` and `/library` must utilize efficient rendering for large dataset rendering.
6. **No Hardcoded External Domains**: Documentation and configuration must not reference external domains (e.g., tatsukai.com). Use placeholders like `http://your-prowlarr-instance/api`.
7. **AGPL-3.0 Compliance**: All modifications must comply with the GNU Affero General Public License v3.0.

---

## 🔄 Constitution Workflow

1. **Context Verification**: This constitution is read prior to executing Spec Kit commands or generating code.
2. **Rule Enforcement**: Generated code and architecture plans are validated against these constraints.
3. **Homelab Validation**: Any new feature must declare its offline and self-hosting capability.

---

## 🐳 Docker & Deployment Standards (Homelab Edition)

### Containerization Strategy
- **Single-Command Launch**: `docker compose up --build` must start the fully functional stack without manual inter-steps.
- **Self-Contained Stack**: Includes frontend/backend container(s), persistent database volumes, and automatic initial dataset ingestion triggers.

### Environment Configuration (`.env.example`)
```env
# Optional Torbox API Key. Required for cloud library and music routes.
TORBOX_API_KEY=

# Optional TMDB API Read Access Token. Enables movie and TV poster artwork.
TMDB_API_READ_ACCESS_TOKEN=

# Optional Stremio-compatible torrent stream search source.
TORRENT_SEARCH_BASE_URL=https://torrentio.strem.fun

# Prowlarr Torznab feed URL; the app derives its aggregate search API from this base.
TORZNAB_URL=http://prowlarr:9696/1/api
# Copy the API key from Prowlarr: Settings > General.
TORZNAB_API_KEY=
TORZNAB_MUSIC_CATEGORY=3000

# Prowlarr container settings. Keep its config directory backed up.
PROWLARR_CONFIG_PATH=./data/prowlarr
PUID=1000
PGID=1000
TZ=Europe/Madrid

# Persistent PostgreSQL database. Keep these credentials aligned with the
# POSTGRES_* settings below. URL-encode special characters in the password.
DATABASE_URL=postgresql://user:change-me@db:5432/torbox_mediamanager

# Container and host media locations.
LOCAL_MEDIA_PATH=/data/media
HOST_MEDIA_PATH=./media

# IMDb datasets are downloaded and imported once when the database is empty.
IMDB_DATA_PATH=/app/data/imdb
IMDB_AUTO_IMPORT=true

# TVMaze schedule cache refresh interval.
TVMAZE_SYNC_INTERVAL=24h

POSTGRES_DB=torbox_mediamanager
POSTGRES_USER=user
POSTGRES_PASSWORD=change-me
POSTGRES_DATA_PATH=./data/postgres

# ── NZBGeek Newznab API (USENET search) ──
# Required for USENET search and .nzb discovery
NZBGEEK_API_HOST=https://api.nzbgeek.info/
NZBGEEK_API_KEY=your-nzbgeek-api-key-here
# Whitelist IP reference for dynamic IP connections (e.g. DIGI Mobil)
# Update this when your home IP changes; logged on every NZBGeek request.
NZBGEEK_WHITELIST_IP=your-public-egress-ip
NZBGEEK_REQUEST_TIMEOUT_MS=30000
NZBGEEK_MAX_RETRIES=3

# ── NNTP server for local Usenet assembly ──
# Required for the full USENET pipeline (download + assemble locally)
# Get these from your Usenet access provider (separate from NZBGeek indexer).
NNTP_HOST=your-nntp-provider.com
NNTP_PORT=563
NNTP_SECURE=true
NNTP_USERNAME=your-nntp-username
NNTP_PASSWORD=your-nntp-password
# Local temp directory for assembled files before TorBox upload
USENET_DOWNLOAD_DIR=/tmp/torbox-usenet-tmp
USENET_MAX_SEGMENT_RETRIES=3

# ── Temp download service (USENET pipeline - TorBox Web Download flow) ──
# Public base URL of your TorBox Media Manager instance
APP_BASE_URL=
# Dedicated DNS for USENET temp download links (TorBox cloud pulls from this URL)
# Must be publicly accessible WITHOUT SSO so TorBox can fetch the files.
TEMP_DOWNLOAD_BASE_URL=
# Local temp directory for temp download files (writable inside Docker container)
TEMP_DOWNLOAD_DIR=/tmp/torbox-usenet-tmp
# Token expiry time in milliseconds (default: 30 minutes)
TEMP_DOWNLOAD_TTL_MS=1800000
```

### Docker Compose Reference Structure

```yaml
services:
  app:
    build: .
    ports:
      - "8066:8066"
    environment:
      - TORBOX_API_KEY=${TORBOX_API_KEY}
      - DATABASE_URL=${DATABASE_URL}
      - LOCAL_MEDIA_PATH=${LOCAL_MEDIA_PATH:-/data/media}
      - TVMAZE_SYNC_INTERVAL=${TVMAZE_SYNC_INTERVAL:-24h}
    volumes:
      - ${LOCAL_MEDIA_PATH}:/app/data/media:ro
      - ./data:/app/data:rw

  db:
    image: postgres:15-alpine
    profiles: ["postgres"]
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=torbox_mediamanager
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password

volumes:
  postgres_data:

```

---

## 📁 Repository Structure Standard

AI agents must organize new features strictly within this layout:

* `src/routes/` -> Route handlers (`/browse`, `/movies`, `/shows`, `/music`, `/library`, `/calendar`, `/title/:imdbId`, `/tvmaze/:id`, `/music/release/:id`, `/api/movies/trending`, `/api/shows/trending`, `/api/music/trending`)
* `src/services/torbox/` -> Torbox REST API client and cloud sync handlers
* `src/services/torrentSearch.ts` -> Torrentio Stremio addon client
* `src/services/imdb/` -> Stream-based TSV downloader, parser, and DB ingestion routines
* `src/services/tvmaze/` -> TV schedule parser and local caching logic
* `src/db/` -> Database schemas, migrations, and SQLite/Postgres handlers
* `src/public/js/` -> Frontend JavaScript (views.js, render.js, views.js, state.js, api.js, main.js)
* `src/public/index.html` -> Single-page application HTML with all view sections
* `src/public/js/views.js` -> View rendering, search, discover, library, calendar, and source selector logic
* `src/public/js/render.js` -> Card rendering (search items, library items, calendar events, title details, music details, TVMaze details)
* `docker-compose.yml` -> Self-hosted stack orchestration
* `.env.example` -> Environment variable template with local defaults
* `Dockerfile` -> Multi-stage container build
* `.vscode/` -> Workspace settings, extensions, and task definitions
* `README.md` -> Project overview, features, routes, environment variables, and license information
* `INSTALL.md` -> Complete self-hosted installation guide
* `RELEASE_NOTES.md` -> Release notes for version 202611
* `QA_TEST_PROMPT.md` -> QA automation test specification
* `constitution.md` -> Project constitution (this file)
* `LICENSE` -> GNU Affero General Public License v3.0 (AGPL-3.0-or-later)

---

## 🧪 Testing Standards

- **Playwright E2E Suites** (`tests/e2e/`):
  - `pagination-consistency.spec.ts` — Pagination totals stability, URL state (`?page=N`), source selector sync.
  - `initial-load-ui.spec.ts` — Initial load hero bar, skeletons, empty states, responsive grid, pagination.
  - `discover-functionality.spec.ts` — Discover action flow (local IMDb / MusicBrainz).
  - `search-functionality.spec.ts` — Dual action flow (Search / Discover) across `/browse`, `/movies`, `/shows`, `/music`.
  - `library-calendar.spec.ts` — Library and calendar functionality.
  - `item-detail-routes.spec.ts` — Item detail page rendering.
  - `usenet-pipeline.spec.ts` — Usenet pipeline functionality.
  - `media-manager.spec.ts` — Media manager operations.
  - `simple.spec.ts` — Basic smoke tests.
  - `simple_search.spec.ts` — Basic search smoke tests.
- **Run with**: `BASE_URL=http://<host>:8066 npx playwright test`

---

## 📜 License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-or-later). See the [LICENSE](LICENSE) file for the full license text.

The AGPL-3.0 requires that if you run a modified version of this software on a server and allow users to interact with it remotely through a computer network, you must make the Corresponding Source available to those users at no charge. This includes any modifications you make to the TorBox Media Manager codebase.
