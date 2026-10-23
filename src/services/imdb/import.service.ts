import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import {
  isDatasetImported,
  markDatasetImported,
  saveRatingBatch,
  saveTitleBatch,
  type RatingRecord,
  type TitleRecord
} from '../../db/database';

const DATASETS = {
  basics: 'title.basics.tsv.gz',
  ratings: 'title.ratings.tsv.gz'
} as const;
const DATASET_BASE_URL = 'https://datasets.imdbws.com';
const BATCH_SIZE = 100;

function parseOptionalInteger(value: string | undefined): number | null {
  if (!value || value === '\\N') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function downloadDataset(filename: string, destination: string): Promise<void> {
  const url = new URL(filename, `${DATASET_BASE_URL}/`);
  await downloadUrl(url, destination, 0);
}

async function downloadUrl(url: URL, destination: string, redirects: number): Promise<void> {
  if (redirects > 5) throw new Error('Too many redirects while downloading IMDb dataset');
  await new Promise<void>((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'TorboxMediaManager/1.0 (IMDb public datasets)' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.resume();
        downloadUrl(new URL(response.headers.location, url), destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`IMDb dataset download failed with HTTP ${response.statusCode}`));
        return;
      }
      pipeline(response, fs.createWriteStream(destination)).then(resolve, reject);
    });
    request.setTimeout(120_000, () => request.destroy(new Error('IMDb dataset download timed out')));
    request.on('error', reject);
  });
}

async function getDatasetStream(name: string): Promise<{ stream: NodeJS.ReadableStream; compressed: boolean }> {
  const directory = process.env.IMDB_DATA_PATH || './data/imdb';
  fs.mkdirSync(directory, { recursive: true });
  const uncompressed = path.join(directory, name.replace(/\.gz$/, ''));
  if (fs.existsSync(uncompressed)) {
    return { stream: fs.createReadStream(uncompressed), compressed: false };
  }

  const compressed = path.join(directory, name);
  if (!fs.existsSync(compressed)) {
    console.info(`Downloading IMDb public dataset ${name}`);
    const partialPath = `${compressed}.partial`;
    try {
      await downloadDataset(name, partialPath);
      fs.renameSync(partialPath, compressed);
    } catch (error) {
      fs.rmSync(partialPath, { force: true });
      throw error;
    }
  }
  return { stream: fs.createReadStream(compressed), compressed: true };
}

async function* linesFrom(stream: NodeJS.ReadableStream, compressed: boolean): AsyncGenerator<string> {
  const input = compressed ? (stream as NodeJS.ReadableStream).pipe(createGunzip()) : stream;
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) yield line;
}

export async function importTitleBasics(): Promise<number> {
  if (await isDatasetImported(DATASETS.basics)) return 0;
  const dataset = await getDatasetStream(DATASETS.basics);
  const batch: TitleRecord[] = [];
  let imported = 0;
  let header = true;

  for await (const line of linesFrom(dataset.stream, dataset.compressed)) {
    if (header) { header = false; continue; }
    if (!line) continue;
    const fields = line.split('\t');
    if (fields.length < 9) continue;
    const [imdbId, titleType, primaryTitle, originalTitle, , startYear, , runtimeMinutes, genres] = fields;
    if (!imdbId || !primaryTitle || !['movie', 'tvSeries', 'tvMiniSeries'].includes(titleType)) continue;

    batch.push({
      imdbId,
      titleType,
      primaryTitle,
      originalTitle: originalTitle === '\\N' ? primaryTitle : originalTitle,
      startYear: parseOptionalInteger(startYear),
      runtimeMinutes: parseOptionalInteger(runtimeMinutes),
      genres: genres === '\\N' ? '' : genres
    });
    if (batch.length >= BATCH_SIZE) {
      await saveTitleBatch(batch.splice(0, batch.length));
      imported += BATCH_SIZE;
      if (imported % 100_000 === 0) console.info(`Imported ${imported.toLocaleString()} IMDb titles`);
    }
  }

  if (batch.length) {
    imported += batch.length;
    await saveTitleBatch(batch);
  }
  await markDatasetImported(DATASETS.basics, imported);
  console.info(`IMDb title basics import complete: ${imported.toLocaleString()} titles`);
  return imported;
}

export async function importTitleRatings(): Promise<number> {
  if (await isDatasetImported(DATASETS.ratings)) return 0;
  const dataset = await getDatasetStream(DATASETS.ratings);
  const batch: RatingRecord[] = [];
  let imported = 0;
  let header = true;

  for await (const line of linesFrom(dataset.stream, dataset.compressed)) {
    if (header) { header = false; continue; }
    if (!line) continue;
    const [imdbId, ratingValue, votesValue] = line.split('\t');
    const averageRating = Number(ratingValue);
    const numVotes = Number.parseInt(votesValue, 10);
    if (!imdbId || !Number.isFinite(averageRating) || !Number.isFinite(numVotes)) continue;
    batch.push({ imdbId, averageRating, numVotes });
    if (batch.length >= BATCH_SIZE) {
      await saveRatingBatch(batch.splice(0, batch.length));
      imported += BATCH_SIZE;
      if (imported % 100_000 === 0) console.info(`Imported ratings for ${imported.toLocaleString()} IMDb titles`);
    }
  }

  if (batch.length) {
    imported += batch.length;
    await saveRatingBatch(batch);
  }
  await markDatasetImported(DATASETS.ratings, imported);
  console.info(`IMDb ratings import complete: ${imported.toLocaleString()} ratings`);
  return imported;
}

export async function importImdbDatasets(): Promise<{ basicsImported: number; ratingsImported: number }> {
  const basicsImported = await importTitleBasics();
  const ratingsImported = await importTitleRatings();
  return { basicsImported, ratingsImported };
}

export async function getLocalImdbDatasetFiles(): Promise<string[]> {
  const directory = process.env.IMDB_DATA_PATH || './data/imdb';
  try {
    return fs.readdirSync(directory).filter((name) => name.startsWith('title.') && (name.endsWith('.tsv') || name.endsWith('.tsv.gz')));
  } catch {
    return [];
  }
}
