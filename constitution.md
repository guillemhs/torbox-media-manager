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

### 2. Calendar & Release Schedules (Free API)
- **TVMaze Public API**: Serves episode schedules, airing dates, and series status.
- **Caching**: Data is cached locally to prevent rate-limiting and support offline access.

### 3. Cloud & Music Management (Torbox Service)
- **Torbox API**: Used for streaming, cloud-cached downloads, and searching the Torbox cloud media catalog.
- **Constraint**: Media management **cannot** function without a valid Torbox API Key due to dependency on Torbox's streaming infrastructure.

---

## 🗂️ Application Architecture & Route Structure

- **`/library`**: View and manage processed content, syncs with Torbox Cloud.
- **`/movies`**: Centralized Torbox movie collection indexed locally via the IMDb database (Works 100% offline).
- **`/shows`**: Series tracking and episode management linked with the Torbox shows collection using local database and TVMaze calendar.
- **`/music`**: Music search, exploration, download and streaming. **Requires Torbox API Key.**
- **`/browse`**: Fast discovery engine.
  - *Movies/Shows*: Uses local IMDb database (Optional Torbox cache status check).
  - *Music*: Direct cloud search using a music database.
- **`/calendar`**: Release timeline built from local database and cached TVMaze schedule.

---

## 🔐 Authentication, Security & Privacy

- **Credential Scope**: `TORBOX_API_KEY` is the only media service credential. NZBIndex and Binsearch search are keyless.
- **No User Databases**: No user registration, no OAuth 2.0, no session persistence outside local storage. Like Debrid Media Manager, session state is client-managed.
- **Privacy First**: Zero telemetry, zero analytics, zero external dependencies for non-cloud features.

---

## 🚫 Prohibited Practices

- ❌ No commercial or paid metadata APIs (e.g., TMDB API tier fees).
- ❌ No user account databases or third-party OAuth authentication systems.
- ❌ No integration of payment processing gateways or data monetization routines.
- ❌ Generating code that loads full IMDb TSV files into system memory (must use stream-based parsers).
- ❌ Claiming media management or music features work offline without explicit Torbox integration where required.

## ✅ Accepted Practices

- ✅ Processing local IMDb TSV dataset dumps via stream handling.
- ✅ Rate-limited caching for free public APIs (TVMaze).
- ✅ TorBox REST API integration and explicitly configured NZBIndex/Binsearch Usenet search.
- ✅ Support for SQLite (default) and PostgreSQL database backends.
- ✅ Docker single-command setups for self-hosted environments.

---

## 📜 Principles for AI-Assisted Development

When using Spec Kit or AI coding assistants with this project:

1. **Zero Paywall Compliance**: Generated code must never assume or enforce paid API dependencies for core movie/series features.
2. **Stream-based IMDb Ingestion**: Parser functions must process TSV files in streams to prevent memory exhaustion on large datasets.
3. **Graceful Fallbacks**: Features targeting Movies/Series must function properly if `TORBOX_API_KEY` is empty.
4. **Strict API Contracts**: Interact with Torbox REST endpoints according to official schemas without inventing unsupported methods.
5. **UI Performance**: UI grids for `/browse` and `/library` must utilize list virtualization/lazy loading for large dataset rendering.

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
# Optional: Torbox API Key (Required for cloud sync & music streaming)
TORBOX_API_KEY=

# Local Storage & Database Configuration
DATABASE_URL=file:./data/app.db?mode=memory
LOCAL_MEDIA_PATH=/data/media
IMDB_DATA_PATH=./data/imdb

# Sync intervals
TVMAZE_SYNC_INTERVAL=24h

```

### Docker Compose Reference Structure

```yaml
services:
  app:
    build: .
    ports:
      - "6666:6666"
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

* `src/routes/` -> Page routes (`/library`, `/movies`, `/shows`, `/music`, `/browse`, `/calendar`)
* `src/services/torbox/` -> Torbox REST API client and cloud sync handlers
* `src/services/imdb/` -> Stream-based TSV downloader, parser, and DB ingestion routines
* `src/services/tvmaze/` -> TV schedule parser and local caching logic
* `src/db/` -> Database schemas, migrations, and SQLite/Postgres handlers
* `docker-compose.yml` -> Self-hosted stack orchestration
* `.env.example` -> Environment variable template with local defaults
* `Dockerfile` -> Multi-stage container build
* `.vscode/` -> Workspace settings, extensions, and task definitions
