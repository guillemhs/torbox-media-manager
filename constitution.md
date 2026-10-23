# Torbox Media Manager - Constitution

## 🎯 Mission & Vision
This application is a **completely free, open-source media manager** that operates without paid API dependencies. All data is sourced from open datasets and free APIs, running entirely offline where possible.

## 📊 Data Philosophy
- **Zero paid APIs**: No TMDB, no commercial APIs at scale
- **Open data only**: IMDb public datasets, TVMaze public API
- **Local-first**: Metadata stored in local database (PostgreSQL/SQLite)
- **Torbox-native**: Full integration with Torbox infrastructure for media storage (video and music)

## 🌐 Data Sources

### Movies & Series Metadata
- **IMDb Public Datasets**: Periodic import of TSV fichiers for titles, genres, years, ratings
- **Storage**: PostgreSQL or SQLite database
- **Benefits**: Totally free, offline-capable, no rate limits

### Calendar & Emission Data
- **TVMaze Public API**: Free API for episode scheduling and series premieres
- **Purpose**: TV program calendars, airing schedules

### Music
- **100% Torbox native**: Leverages Torbox's caching and file infrastructure
- **No external dependencies**: All music management within Torbox ecosystem

## 🗂️ Application Architecture

### Route Structure

#### `/library`
- Synchronized with user's Torbox cloud and active torrents
- View and manage all processed/downloaded content

#### `/movies` 
- Centralized section for movie collection
- Indexed via local IMDb database

#### `/shows` 
- Dedicated series tracking and management
- Linked with local database and calendar

#### `/music` 
- Exclusive music search, exploration, and management
- Powered by Torbox cache and file capabilities

#### `/browse` 
- **Browse de Películas y Series**: Quick discovery crossing user queries against IMDb local database and Torbox cache verification
- **Browse de Música**: Specific interface for searching albums, discographies, or music files in Torbox ecosystem

#### `/calendar` 
- Structured timeline via open API (TVMaze)
- Shows upcoming series and movie premieres user follows
- Facilitates direct sending to Torbox

## 🔐 Authentication & Security

### Single Access Point
- **Single API Key entry**: User provides Torbox API Key in initial configuration
- **No external user databases**: No registration systems, no OAuth, no third-party payment gateways
- **Torbox-only authentication**: All access funneled through Torbox key

### Security Principles
- **Minimal data collection**: Only what's needed for Torbox integration
- **Local processing**: Metadata processing happens offline when possible
- **No persistent user accounts**: Application state tied to Torbox session

## 🚫 Prohibited Practices

- ❌ No paid API subscriptions at commercial scale
- ❌ No user account databases outside Torbox
- ❌ No OAuth 2.0 or third-party authentication
- ❌ No payment processing integration
- ❌ No data selling or commercial licensing of collected data

## ✅ Accepted Practices

- ✅ Open dataset imports (IMDb TSV dumps)
- ✅ Free public APIs (TVMaze, etc.) within reasonable usage
- ✅ Torbox native integration
- ✅ Local database storage (SQLite/PostgreSQL)
- ✅ Offline-first where possible
- ✅ Single API key authentication

## 📜 Principles for AI-Assisted Development

When using Spec Kit or any AI coding assistant with this project:

1. **All generated code must comply with zero-paywall principle**
2. **Data sources must remain open/free**
3. **Torbox integration must be maintained**
4. **IMDb dataset import logic must be preserved**
5. **TVMaze API integration must not require paid tiers**
6. **No new external paid dependencies added without team approval**

## 🔄 Constitution Workflow

1. **Before every Spec Kit command**, the constitution is read
2. **Validation**: All generated artifacts are checked against these principles
3. **Guardrail**: AI agents must obey these constraints
4. **Updates**: Constitution can be updated with team consensus, but principles remain core

## 💻 VS Code & Workspace Standards

- **Workspace Integration**: All Spec Kit prompts and tasks must target Visual Studio Code workspace settings (`.vscode/`).
- **Extensions & Tooling**: 
  - Code formatting and linting rules enforced via workspace configuration.
  - Recommended extensions: REST Client / Thunder Client, SQLite Viewer, Docker.
- **Environment Parity**: Local setup must run without requiring external cloud services or paid containers.

## 🏗️ Technical Stack & Implementation Constraints

### Core Stack
- **Database**: SQLite (default for zero-config/local-first) or PostgreSQL.
- **IMDb Parser**: Mandatory stream-based parsing for large TSV files to prevent memory exhaustion.
- **HTTP Client**: Robust handling of TVMaze rate limits and Torbox API responses.

### Code Generation Rules for AI
1. **Stream-based Ingestion**: Never generate code that loads full IMDb TSV files into memory at once.
2. **Torbox API Contracts**: Strictly adhere to Torbox REST API schema without inventing non-existent endpoints.
3. **UI Performance**: Front-end grid components for `/browse` and `/library` must implement virtualization or lazy loading for heavy poster lists.

## 🐳 Docker & Deployment Standards

### Containerization Strategy
- **Single-Command Startup**: Running `docker compose up --build` must spin up the entire application stack fully functioning without manual intermediate configuration.
- **Self-Contained Stack**: 
  - Backend/Frontend service container.
  - Local database volume persistence (SQLite file or PostgreSQL container volume).
  - Automated background worker or startup routine for IMDb TSV dataset ingestion if database is empty.

### Configuration (`.env`)
- A `.env.example` template must be provided in the repository root.
- Required environment variables:
  - `TORBOX_API_KEY`: User's single authentication key.
  - `DATABASE_URL`: Connection string for the local database.
  - Any auxiliary tuning variables for TVMaze sync intervals.

## 📁 Repository & Folder Structure Standard

AI agents must place new features within the following structure:
- `src/routes/` -> Page routes (`/library`, `/movies`, `/shows`, `/music`, `/browse`, `/calendar`)
- `src/services/torbox/` -> Torbox API client and sync logic
- `src/services/imdb/` -> Local TSV downloader, parser, and DB sync routines
- `src/services/tvmaze/` -> Free TV schedule parser
- `src/db/` -> Database schemas, migrations, and SQLite/Postgres connection handlers
- `docker-compose.yml` -> Root orchestration file for building and running the full stack
- `.env.example` -> Template for required environment variables
- `Dockerfile` -> Multi-stage build for the application runtime