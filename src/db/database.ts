import fs from 'node:fs';
import path from 'node:path';
import Sqlite from 'better-sqlite3';
import { Pool } from 'pg';

export interface TitleRecord {
  imdbId: string;
  titleType: string;
  primaryTitle: string;
  originalTitle: string;
  startYear: number | null;
  runtimeMinutes: number | null;
  genres: string;
}

export interface RatingRecord {
  imdbId: string;
  averageRating: number;
  numVotes: number;
}

export interface TitleSearch {
  q?: string;
  kind?: 'movie' | 'series' | 'all';
  limit?: number;
  offset?: number;
}

let sqlite: InstanceType<typeof Sqlite> | undefined;
let postgres: Pool | undefined;

const schema = [
  `CREATE TABLE IF NOT EXISTS titles (
    imdb_id TEXT PRIMARY KEY,
    title_type TEXT NOT NULL,
    primary_title TEXT NOT NULL,
    original_title TEXT NOT NULL,
    start_year INTEGER,
    runtime_minutes INTEGER,
    genres TEXT NOT NULL DEFAULT '',
    average_rating REAL,
    num_votes INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS titles_primary_title_idx ON titles(primary_title)',
  'CREATE INDEX IF NOT EXISTS titles_type_year_idx ON titles(title_type, start_year)',
  `CREATE TABLE IF NOT EXISTS tvmaze_schedule_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS import_state (
    dataset TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL,
    imported_rows INTEGER NOT NULL
  )`
];

export async function initializeDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL || 'file:./data/app.db';
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    postgres = new Pool({ connectionString: url });
    let lastError: unknown;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await postgres.query('SELECT 1');
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
    }
    if (lastError) throw new Error(`PostgreSQL is unavailable after 30 seconds: ${lastError instanceof Error ? lastError.message : 'connection failed'}`);
    for (const statement of schema) await postgres.query(statement);
    return;
  }

  const location = url.startsWith('file:') ? url.slice(5).split('?')[0] : url;
  const filename = location === ':memory:' ? location : path.resolve(location || './data/app.db');
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  sqlite = new Sqlite(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  for (const statement of schema) sqlite.exec(statement);
}

function ensureInitialized(): void {
  if (!sqlite && !postgres) throw new Error('Database has not been initialized');
}

function postgresSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  ensureInitialized();
  if (postgres) {
    const result = await postgres.query(postgresSql(sql), params);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  }

  const statement = sqlite!.prepare(sql);
  if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)) {
    const rows = statement.all(...params) as T[];
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(...params);
  return { rows: [], rowCount: result.changes };
}

export async function saveTitleBatch(records: TitleRecord[]): Promise<void> {
  if (records.length === 0) return;
  const fields = 7;
  const values = records.map(() => `(${Array(fields).fill('?').join(',')})`).join(',');
  const params = records.flatMap((record) => [
    record.imdbId,
    record.titleType,
    record.primaryTitle,
    record.originalTitle,
    record.startYear,
    record.runtimeMinutes,
    record.genres
  ]);
  await query(
    `INSERT INTO titles (imdb_id, title_type, primary_title, original_title, start_year, runtime_minutes, genres)
     VALUES ${values}
     ON CONFLICT(imdb_id) DO UPDATE SET
       title_type = excluded.title_type,
       primary_title = excluded.primary_title,
       original_title = excluded.original_title,
       start_year = excluded.start_year,
       runtime_minutes = excluded.runtime_minutes,
       genres = excluded.genres`,
    params
  );
}

export async function saveRatingBatch(records: RatingRecord[]): Promise<void> {
  if (records.length === 0) return;
  const ratingCases = records.map(() => 'WHEN ? THEN ?').join(' ');
  const voteCases = records.map(() => 'WHEN ? THEN ?').join(' ');
  const ids = records.map(() => '?').join(',');
  const params = [
    ...records.flatMap((record) => [record.imdbId, record.averageRating]),
    ...records.flatMap((record) => [record.imdbId, record.numVotes]),
    ...records.map((record) => record.imdbId)
  ];
  await query(
    `UPDATE titles
     SET average_rating = CASE imdb_id ${ratingCases} ELSE average_rating END,
         num_votes = CASE imdb_id ${voteCases} ELSE num_votes END
     WHERE imdb_id IN (${ids})`,
    params
  );
}

export async function searchTitles(options: TitleSearch = {}) {
  const q = options.q?.trim() ?? '';
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q) {
    conditions.push('LOWER(primary_title) LIKE LOWER(?)');
    params.push(`%${q}%`);
  }
  if (options.kind === 'movie') conditions.push("title_type = 'movie'");
  if (options.kind === 'series') conditions.push("title_type IN ('tvSeries', 'tvMiniSeries')");
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query<{ count: number }>(`SELECT COUNT(*) AS count FROM titles ${where}`, params);
  const result = await query(
    `SELECT imdb_id AS "imdbId", title_type AS "titleType", primary_title AS "primaryTitle",
            original_title AS "originalTitle", start_year AS "startYear",
            runtime_minutes AS "runtimeMinutes", genres, average_rating AS "averageRating",
            num_votes AS "numVotes"
     FROM titles ${where}
     ORDER BY COALESCE(num_votes, 0) DESC, primary_title ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { items: result.rows, total: Number(countResult.rows[0]?.count ?? 0), limit, offset };
}

export async function getTitle(imdbId: string) {
  const result = await query(
    `SELECT imdb_id AS "imdbId", title_type AS "titleType", primary_title AS "primaryTitle",
            original_title AS "originalTitle", start_year AS "startYear",
            runtime_minutes AS "runtimeMinutes", genres, average_rating AS "averageRating",
            num_votes AS "numVotes"
     FROM titles WHERE imdb_id = ?`,
    [imdbId]
  );
  return result.rows[0] ?? null;
}

export async function countTitles(): Promise<number> {
  const result = await query<{ count: number }>('SELECT COUNT(*) AS count FROM titles');
  return Number(result.rows[0]?.count ?? 0);
}

export async function isDatasetImported(dataset: string): Promise<boolean> {
  const result = await query('SELECT dataset FROM import_state WHERE dataset = ?', [dataset]);
  return result.rows.length > 0;
}

export async function markDatasetImported(dataset: string, importedRows: number): Promise<void> {
  await query(
    `INSERT INTO import_state (dataset, completed_at, imported_rows) VALUES (?, ?, ?)
     ON CONFLICT(dataset) DO UPDATE SET completed_at = excluded.completed_at, imported_rows = excluded.imported_rows`,
    [dataset, new Date().toISOString(), importedRows]
  );
}

export async function getImportStatus() {
  const result = await query('SELECT dataset, completed_at AS completedAt, imported_rows AS importedRows FROM import_state');
  return result.rows;
}

export async function getCachedSchedule(cacheKey: string) {
  const result = await query<{ payload: string; fetchedAt: string }>(
    'SELECT payload, fetched_at AS fetchedAt FROM tvmaze_schedule_cache WHERE cache_key = ?',
    [cacheKey]
  );
  const row = result.rows[0];
  return row ? { payload: JSON.parse(row.payload) as unknown[], fetchedAt: row.fetchedAt } : null;
}

export async function saveCachedSchedule(cacheKey: string, payload: unknown[]): Promise<void> {
  await query(
    `INSERT INTO tvmaze_schedule_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    [cacheKey, JSON.stringify(payload), new Date().toISOString()]
  );
}

export async function closeDatabase(): Promise<void> {
  if (postgres) await postgres.end();
  sqlite?.close();
  postgres = undefined;
  sqlite = undefined;
}
