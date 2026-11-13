# TorBox Media Manager — Self-Hosted Installation Guide

TorBox Media Manager is a self-hosted, local-first media catalog. It combines IMDb metadata, TVMaze schedules, Prowlarr indexers, TorBox cloud library, and Usenet search into a single web interface. This guide walks you through a complete self-hosted deployment using Docker Compose.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Get the Code](#get-the-code)
3. [Environment Configuration](#environment-configuration)
4. [Run with Docker Compose](#run-with-docker-compose)
5. [First Run & IMDb Import](#first-run--imdb-import)
6. [Configure Prowlarr](#configure-prowlarr)
7. [Configure TorBox](#configure-torbox)
8. [Configure Usenet (Optional)](#configure-usenet-optional)
9. [Verify the Installation](#verify-the-installation)
10. [Updating](#updating)
11. [Backup & Restore](#backup--restore)
12. [Troubleshooting](#troubleshooting)
13. [Security Notice](#security-notice)

---

## Prerequisites

Before you begin, ensure the following are installed on your host machine:

| Requirement | Minimum Version | Notes |
|-------------|-----------------|-------|
| Docker | 24.0+ | [Install Docker](https://docs.docker.com/engine/install/) |
| Docker Compose | v2 (compose plugin) | Included with Docker Desktop |
| Git | 2.20+ | For cloning the repository |
| ~4 GB RAM | — | Recommended for PostgreSQL + app + Prowlarr |
| ~20 GB disk | — | IMDb datasets and PostgreSQL data grow over time |

---

## Get the Code

Clone the repository to your server:

```bash
git clone https://github.com/guillemhs/torbox-media-manager.git
cd torbox-media-manager
```

The repository contains:
- `docker-compose.yml` — Service definitions (app, PostgreSQL, Prowlarr, FlareSolverr)
- `.env.example` — Environment variable template
- `src/` — Application source code
- `tests/e2e/` — Playwright end-to-end test suites

---

## Environment Configuration

### 1. Copy the environment template

```bash
cp .env.example .env
```

### 2. Edit `.env`

Open `.env` in your editor and configure the following:

#### Required settings

| Variable | Description | Example |
|----------|-------------|---------|
| `TORBOX_API_KEY` | Your TorBox account API key (required for cloud library/music) | `sk-...` |
| `POSTGRES_PASSWORD` | Strong password for the PostgreSQL database | `change-me-to-something-strong` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://user:change-me@db:5432/torbox_mediamanager` |

#### Optional but recommended

| Variable | Description | Example |
|----------|-------------|---------|
| `TMDB_API_READ_ACCESS_TOKEN` | TMDB API Read Access Token for movie/TV posters | `eyJ...` |
| `TORZNAB_URL` | Prowlarr Torznab feed URL | `http://prowlarr:9696/1/api` |
| `TORZNAB_API_KEY` | Prowlarr API key (from Prowlarr Settings → General) | `abc123...` |
| `NZBGEEK_API_KEY` | NZBGeek Newznab API key (for Usenet search) | `your-nzbgeek-key` |
| `NZBGEEK_WHITELIST_IP` | Your public IP whitelisted on NZBGeek | `203.0.113.5` |
| `APP_BASE_URL` | Public base URL of your instance | `https://media.example.com` |
| `TEMP_DOWNLOAD_BASE_URL` | Public URL for temp download links | `https://usenet-dl.example.com` |

#### Paths

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST_MEDIA_PATH` | Host directory for media files (mounted read-only) | `./media` |
| `PROWLARR_CONFIG_PATH` | Host directory for Prowlarr config | `./data/prowlarr` |
| `POSTGRES_DATA_PATH` | Host directory for PostgreSQL data | `./data/postgres` |
| `IMDB_DATA_PATH` | Container path for IMDb dataset files | `/app/data/imdb` |

### 3. Create required directories

```bash
mkdir -p ./media ./data/prowlarr ./data/postgres
```

---

## Run with Docker Compose

### Start all services

```bash
docker compose up --build -d
```

This builds and starts:
- **app** — TorBox Media Manager (port 8066)
- **db** — PostgreSQL 18 (internal port 5432)
- **prowlarr** — Prowlarr indexer manager (port 9696)
- **flaresolverr** — FlareSolverr proxy for Cloudflare-protected indexers (internal port 8191)

### Check service health

```bash
docker compose ps
```

You should see all services as `healthy` or `running`. Then verify the app:

```bash
curl -fsS http://localhost:8066/health
```

Expected response: `{"status":"ok","mode":"torbox-integrated"}` or `{"status":"ok","mode":"local-offline"}`.

---

## First Run & IMDb Import

On first start, the app downloads IMDb dataset files and imports them into PostgreSQL. This can take 30–60 minutes depending on your connection and disk speed.

### Monitor import progress

```bash
curl -s http://localhost:8066/admin/imdb/status
```

The response includes `importedRows` and `totalRows`. You can also check the app logs:

```bash
docker compose logs -f app
```

### Disable automatic import (optional)

If you want to import manually later, set `IMDB_AUTO_IMPORT=false` in `.env`, then trigger import when ready:

```bash
curl -X POST http://localhost:8066/admin/imdb/import
```

---

## Configure Prowlarr

Prowlarr is included as an indexer manager. It is accessible at `http://<your-server-ip>:9696`.

### Steps

1. Open `http://<your-server-ip>:9696` in your browser.
2. Complete the initial setup wizard (create admin user, set timezone).
3. Go to **Settings → Indexers** and add the indexers you are authorized to use.
4. For indexers behind Cloudflare, go to **Settings → Indexers → Indexer Proxies → Add → FlareSolverr**:
   - Host: `http://flaresolverr:8191`
   - Tag: `flaresolverr`
5. Edit each indexer and add the `flaresolverr` tag.
6. Go to **Settings → General** and copy your API key.
7. Add the API key to `.env`:

```env
TORZNAB_API_KEY=your-prowlarr-api-key
```

8. Restart the app:

```bash
docker compose up -d app
```

Prowlarr's config persists in `./data/prowlarr`.

---

## Configure TorBox

TorBox cloud features (library, music, torrent addition) require a TorBox account and API key.

### Steps

1. Log in to your TorBox account at `https://torbox.app`.
2. Generate an API key from your account settings.
3. Add it to `.env`:

```env
TORBOX_API_KEY=your-torbox-api-key
```

4. Restart the app:

```bash
docker compose up -d app
```

Without a TorBox API key, the app runs in `local-offline` mode: IMDb catalog, TV schedule, and local media browsing work, but cloud library and music streaming are unavailable.

---

## Configure Usenet (Optional)

Usenet search supports NZBGeek, NZBIndex, and Binsearch individually or as **All**.

### NZBGeek

NZBGeek requires an API key and IP whitelisting.

1. Get an API key from NZBGeek.
2. Whitelist your server's public egress IP on NZBGeek. The app logs the observed egress IP on every request — check `docker compose logs app` for the `Observed egress IP` message.
3. Add to `.env`:

```env
NZBGEEK_API_HOST=https://api.nzbgeek.info/
NZBGEEK_API_KEY=your-nzbgeek-api-key
NZBGEEK_WHITELIST_IP=your-public-egress-ip
```

### NZBIndex & Binsearch

No API key required. They work out of the box.

### NNTP (Full Usenet Pipeline — Optional)

For the full Usenet download pipeline (download + upload + cleanup via TorBox), configure an NNTP server:

```env
NNTP_HOST=your-nntp-provider.com
NNTP_PORT=563
NNTP_SECURE=true
NNTP_USERNAME=your-username
NNTP_PASSWORD=your-password
USENET_DOWNLOAD_DIR=/tmp/torbox-usenet-tmp
```

This requires a separate Usenet access subscription (different from NZBGeek indexer access).

---

## Verify the Installation

Open `http://<your-server-ip>:8066` in your browser and verify:

| Feature | What to check |
|---------|---------------|
| Home page | Hero search bar visible, no auto-search |
| Browse | Search returns IMDb titles |
| Movies / Shows | Prowlarr + Torrentio results (if configured) |
| Music | MusicBrainz releases |
| Calendar | Streaming schedule with platform filter |
| Library | TorBox cloud items (if API key configured) |
| Health | `http://<your-server-ip>:8066/health` returns `{"status":"ok"}` |

Run the E2E test suite:

```bash
BASE_URL=http://localhost:8066 npx playwright test
```

---

## Updating

To update to a new version:

```bash
cd torbox-media-manager
git pull origin main
docker compose up --build -d
```

The app container rebuilds automatically. PostgreSQL and Prowlarr data persist in their volumes.

---

## Backup & Restore

### Backup

```bash
# PostgreSQL
docker compose exec db pg_dumpall -U user > backup-$(date +%F).sql

# Prowlarr config
tar czf prowlarr-backup-$(date +%F).tar.gz ./data/prowlarr

# Media directory (if applicable)
tar czf media-backup-$(date +%F).tar.gz ./media

# Environment
cp .env .env.backup-$(date +%F)
```

### Restore

```bash
# PostgreSQL
cat backup-YYYY-MM-DD.sql | docker compose exec -T db psql -U user

# Prowlarr config
tar xzf prowlarr-backup-YYYY-MM-DD.tar.gz -C ./

# Restore .env
cp .env.backup-YYYY-MM-DD .env
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| App won't start | Check `docker compose logs app` for errors |
| PostgreSQL connection fails | Verify `DATABASE_URL` matches `POSTGRES_*` vars |
| IMDb import stuck | Check `docker compose logs app`; large datasets take time |
| Prowlarr not reachable | Ensure Prowlarr container is healthy: `docker compose logs prowlarr` |
| NZBGeek error 103 | Your IP isn't whitelisted. Check `docker compose logs app` for the observed egress IP and add it to NZBGeek whitelist |
| No Torrentio results | Torrentio requires IMDb IDs; the app resolves text queries automatically. Ensure IMDb import has completed. |
| Library empty | Verify `TORBOX_API_KEY` is set and valid |

### Logs

```bash
# All services
docker compose logs

# App only
docker compose logs -f app

# PostgreSQL only
docker compose logs -f db
```

---

## Security Notice

The server is intended for a **trusted self-hosted network** and does **not** implement user authentication. Do not expose it directly to the public internet. If you must expose it, place it behind a reverse proxy with authentication (e.g., Authelia, OAuth2 Proxy, or Cloudflare Access).

---

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-or-later). See the [LICENSE](LICENSE) file for details.

The AGPL-3.0 requires that if you run a modified version of this software on a server and allow users to interact with it remotely through a computer network, you must make the Corresponding Source available to those users at no charge.
