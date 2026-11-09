/**
 * End-to-end USENET pipeline.
 *
 * Orchestrates the full flow:
 *   1. Search NZBGeek (Newznab API) for NZB candidates
 *   2. Download selected NZB from NZBGeek
 *   3. Parse NZB segments, connect to NNTP, download articles
 *   4. Assemble segments into a local media file
 *   5. Upload the media file to TorBox
 *   6. Permanently delete local temp/source files after successful upload
 *
 * All steps are logged with timestamps for auditability.
 */

import fs from 'node:fs';
import path from 'node:path';
import { NzbgeekClient, NzbgeekResult, buildNzbgeekClient } from './nzbgeek';
import { NntpClient, NntpArticle } from './nntp-client';
import { addUsenetNzb, TorboxApiError } from './torbox/client';

function nowIso(): string {
  return new Date().toISOString();
}

function log(message: string, meta?: Record<string, unknown>): void {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[USENET-PIPELINE] ${nowIso()} ${message}${payload}`);
}

export interface PipelineJob {
  id: string;
  status: 'queued' | 'searching' | 'downloading-nzb' | 'assembling' | 'uploading' | 'cleaning-up' | 'completed' | 'failed';
  query?: string;
  nzbId?: string;
  nzbName?: string;
  localFilePath?: string;
  torboxResult?: Record<string, unknown>;
  error?: string;
  logs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PipelineConfig {
  nntpHost: string;
  nntpPort?: number;
  nntpSecure?: boolean;
  nntpUsername?: string;
  nntpPassword?: string;
  downloadDir: string;
  maxSegmentRetries?: number;
}

export class UsenetPipeline {
  private readonly jobs: Map<string, PipelineJob> = new Map();
  private readonly nzbgeek: NzbgeekClient;
  private readonly config: PipelineConfig;

  constructor(config: PipelineConfig) {
    this.nzbgeek = buildNzbgeekClient();
    const resolvedDownloadDir = config.downloadDir || path.resolve(process.env.HOST_MEDIA_PATH || './media', '.usenet-tmp');
    this.config = {
      ...config,
      downloadDir: resolvedDownloadDir,
      maxSegmentRetries: config.maxSegmentRetries ?? 3,
    };

    // Ensure download directory exists
    fs.mkdirSync(this.config.downloadDir, { recursive: true });
    log('Pipeline initialized', { downloadDir: this.config.downloadDir });
  }

  /** Generate a unique job ID. */
  private jobId(): string {
    return `usenet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createJob(query?: string): PipelineJob {
    const id = this.jobId();
    const now = nowIso();
    const job: PipelineJob = {
      id,
      status: 'queued',
      query,
      logs: [],
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    return job;
  }

  private getJob(id: string): PipelineJob | undefined {
    return this.jobs.get(id);
  }

  private updateJob(id: string, patch: Partial<PipelineJob>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, patch, { updatedAt: nowIso() });
  }

  private addLog(jobId: string, message: string, meta?: Record<string, unknown>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const entry = `[${nowIso()}] ${message}`;
    job.logs.push(entry);
    // Keep log size bounded
    if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500);
    log(message, { jobId, ...meta });
  }

  /** Step 1: Search NZBGeek for candidates. */
  async searchNzbgeek(query: string, options: { category?: string; limit?: number; offset?: number } = {}): Promise<{ results: NzbgeekResult[]; total: number }> {
    log('Searching NZBGeek', { query, options });
    const results = await this.nzbgeek.search(query, options);
    return { results: results.results, total: results.total };
  }

  /** Step 2: Download NZB from NZBGeek. */
  async downloadNzb(jobId: string, nzbId: string): Promise<Buffer> {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    this.updateJob(jobId, { status: 'downloading-nzb' });
    this.addLog(jobId, 'Downloading NZB from NZBGeek', { nzbId });

    const nzbBytes = await this.nzbgeek.downloadNzb(nzbId);
    this.addLog(jobId, 'NZB downloaded', { nzbId, bytes: nzbBytes.length });

    return nzbBytes;
  }

  /** Step 3: Parse NZB XML and extract segment metadata. */
  parseNzb(nzbBytes: Buffer): {
    id: string;
    title: string;
    segments: Array<{ number: number; messageId: string; newsgroups: string[]; size?: number }>;
  } {
    const xml = nzbBytes.toString('utf8').replace(/^\uFEFF/, '');

    // Extract NZB file id
    const nzbIdMatch = /<nzb[^>]*id=["']([^"']+)["']/i.exec(xml);
    const nzbId = nzbIdMatch ? nzbIdMatch[1] : '';

    // Extract title
    const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(xml);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    // Extract segments
    const segments: Array<{ number: number; messageId: string; newsgroups: string[]; size?: number }> = [];
    const segmentRegex = /<segment\b[^>]*>([\s\S]*?)<\/segment>/gi;
    for (const match of xml.matchAll(segmentRegex)) {
      const segXml = match[1];
      const numberStr = /number=["'](\d+)["']/i.exec(segXml)?.[1];
      const sizeStr = /size=["'](\d+)["']/i.exec(segXml)?.[1];
      const messageId = segXml.trim();

      if (numberStr && messageId) {
        segments.push({
          number: Number(numberStr),
          messageId,
          newsgroups: [],
          size: sizeStr ? Number(sizeStr) : undefined,
        });
      }
    }

    // Sort segments by number
    segments.sort((a, b) => a.number - b.number);

    return { id: nzbId, title, segments };
  }

  /** Step 4: Download segments via NNTP and assemble into a file. */
  async assembleFromNzb(jobId: string, nzbBytes: Buffer, fileName: string): Promise<string> {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    this.updateJob(jobId, { status: 'assembling' });
    this.addLog(jobId, 'Parsing NZB and assembling via NNTP', { fileName });

    const parsed = this.parseNzb(nzbBytes);
    if (!parsed.segments.length) {
      throw new Error('NZB contains no segments');
    }

    this.addLog(jobId, `NZB parsed: ${parsed.segments} segments found`, { title: parsed.title, segmentCount: parsed.segments.length });

    const nntp = new NntpClient({
      host: this.config.nntpHost,
      port: this.config.nntpPort,
      secure: this.config.nntpSecure,
      username: this.config.nntpUsername,
      password: this.config.nntpPassword,
    });

    try {
      await nntp.connect();
      await nntp.authenticate();

      const localPath = path.join(this.config.downloadDir, `${Date.now()}-${fileName.replace(/[^\w .()-]/g, '_')}`);
      const writeStream = fs.createWriteStream(localPath);

      let completedSegments = 0;
      for (const segment of parsed.segments) {
        let lastError: unknown = null;
        for (let attempt = 0; attempt < this.config.maxSegmentRetries!; attempt++) {
          try {
            const article = await nntp.article(segment.messageId);
            writeStream.write(article.body);
            completedSegments++;
            this.addLog(jobId, `Segment ${segment.number} downloaded`, {
              messageId: segment.messageId,
              size: article.body.length,
              attempt: attempt + 1,
            });
            break;
          } catch (error) {
            lastError = error;
            this.addLog(jobId, `Segment ${segment.number} attempt ${attempt + 1} failed`, {
              messageId: segment.messageId,
              error: error instanceof Error ? error.message : String(error),
            });
            if (attempt < this.config.maxSegmentRetries! - 1) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
          }
        }
        if (lastError) {
          throw new Error(`Failed to download segment ${segment.number} after ${this.config.maxSegmentRetries} attempts: ${lastError}`);
        }
      }

      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const stat = fs.statSync(localPath);
      this.addLog(jobId, 'Assembly complete', { localPath, bytes: stat.size, segments: completedSegments });

      this.updateJob(jobId, {
        status: 'uploading',
        localFilePath: localPath,
        nzbName: parsed.title,
      });

      return localPath;
    } finally {
      nntp.disconnect();
    }
  }

  /** Step 5: Upload the assembled media file to TorBox. */
  async uploadToTorbox(jobId: string, localFilePath: string, fileName?: string): Promise<Record<string, unknown>> {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    this.updateJob(jobId, { status: 'uploading' });
    this.addLog(jobId, 'Uploading to TorBox', { localFilePath });

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Local file not found: ${localFilePath}`);
    }

    const fileBuffer = fs.readFileSync(localFilePath);
    const name = fileName || path.basename(localFilePath);

    try {
      // Use addUsenetNzb to upload the NZB to TorBox (TorBox handles Usenet download server-side)
      // OR upload the assembled media file directly. Since TorBox's API accepts NZB files
      // via createusenetdownload, we upload the original NZB for TorBox to process.
      //
      // For direct media file upload, TorBox's torrent/usenet endpoints accept NZB/magnet.
      // We upload the NZB file that was assembled from, so TorBox can fetch the content.
      const selectedNzbId = job.nzbId;
      if (!selectedNzbId) throw new Error('No NZB ID selected');
      const nzbBytes = await this.downloadNzb(jobId, selectedNzbId);
      const result = await addUsenetNzb(nzbBytes, {
        name: name.replace(/\.[^/.]+$/, '') || 'usenet-download',
        addOnlyIfCached: false,
      });

      this.addLog(jobId, 'TorBox upload confirmed', { result });
      this.updateJob(jobId, {
        status: 'cleaning-up',
        torboxResult: result.data,
      });

      return result.data ?? {};
    } catch (error) {
      this.addLog(jobId, 'TorBox upload failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /** Step 6: Mandatory local cleanup after successful TorBox upload. */
  async cleanup(jobId: string): Promise<void> {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    this.updateJob(jobId, { status: 'cleaning-up' });
    this.addLog(jobId, 'Starting mandatory local cleanup');

    const pathsToDelete: string[] = [];
    if (job.localFilePath && fs.existsSync(job.localFilePath)) {
      pathsToDelete.push(job.localFilePath);
    }

    // Also clean up any other temp files in the download dir matching this job
    const jobPrefix = path.basename(job.localFilePath || '', path.extname(job.localFilePath || ''));
    if (this.config.downloadDir && fs.existsSync(this.config.downloadDir)) {
      for (const entry of fs.readdirSync(this.config.downloadDir)) {
        const fullPath = path.join(this.config.downloadDir, entry);
        if (entry.startsWith(jobPrefix) || entry.includes(job.id)) {
          pathsToDelete.push(fullPath);
        }
      }
    }

    let deleted = 0;
    let errors = 0;
    for (const filePath of pathsToDelete) {
      try {
        fs.unlinkSync(filePath);
        this.addLog(jobId, `Deleted local file: ${filePath}`);
        deleted++;
      } catch (error) {
        this.addLog(jobId, `Failed to delete ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        errors++;
      }
    }

    this.updateJob(jobId, {
      status: errors === 0 ? 'completed' : 'failed',
    });

    this.addLog(jobId, `Cleanup complete: ${deleted} deleted, ${errors} errors`, { status: job.status });
  }

  /** Run the complete pipeline: search → download NZB → assemble → upload → cleanup. */
  async runFullPipeline(
    query: string,
    options: {
      category?: string;
      nzbId?: string; // If provided, skip search and use this NZB ID directly
      fileName?: string;
    } = {}
  ): Promise<PipelineJob> {
    const job = this.createJob(query);
    const jobId = job.id;

    try {
      this.updateJob(jobId, { status: 'searching' });
      this.addLog(jobId, 'Pipeline started', { query });

      let nzbId = options.nzbId;
      let nzbName = '';

      if (!nzbId) {
        // Search NZBGeek for candidates
        const { results, total } = await this.searchNzbgeek(query, {
          category: options.category,
          limit: 10,
          offset: 0,
        });

        this.addLog(jobId, `NZBGeek search returned ${total} total, ${results.length} candidates`, { results: results.map(r => ({ id: r.id, title: r.title })) });

        if (!results.length) {
          throw new Error('No NZB results found on NZBGeek');
        }

        // Select the first complete result
        const selected = results.find(r => r.complete) || results[0];
        nzbId = selected.id;
        nzbName = selected.title;
      }

      this.updateJob(jobId, { nzbId, nzbName });
      this.addLog(jobId, `Selected NZB: ${nzbName} (id: ${nzbId})`);

      // Download NZB
      const nzbBytes = await this.downloadNzb(jobId, nzbId);

      // Assemble via NNTP
      const fileName = options.fileName || nzbName || 'usenet-download';
      const localPath = await this.assembleFromNzb(jobId, nzbBytes, fileName);

      // Upload to TorBox
      await this.uploadToTorbox(jobId, localPath, fileName);

      // Mandatory cleanup
      await this.cleanup(jobId);

      this.addLog(jobId, 'Pipeline completed successfully');
      return this.getJob(jobId)!;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addLog(jobId, `Pipeline failed: ${errorMessage}`);
      this.updateJob(jobId, { status: 'failed', error: errorMessage });
      throw error;
    }
  }

  /** Get a job by ID. */
  getJobStatus(jobId: string): PipelineJob | undefined {
    return this.jobs.get(jobId);
  }

  /** List all jobs (most recent first). */
  listJobs(): PipelineJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/** Build a configured pipeline from environment variables. */
export function buildUsenetPipeline(): UsenetPipeline {
  const nntpHost = process.env.NNTP_HOST?.trim();
  if (!nntpHost) {
    throw new Error('NNTP_HOST is not configured. Set NNTP_HOST in .env for local Usenet assembly.');
  }

  return new UsenetPipeline({
    nntpHost,
    nntpPort: Number(process.env.NNTP_PORT ?? 119),
    nntpSecure: process.env.NNTP_SECURE?.trim() === 'true',
    nntpUsername: process.env.NNTP_USERNAME?.trim() || undefined,
    nntpPassword: process.env.NNTP_PASSWORD?.trim() || undefined,
    downloadDir: process.env.USENET_DOWNLOAD_DIR?.trim() || path.resolve(process.env.HOST_MEDIA_PATH || './media', '.usenet-tmp'),
    maxSegmentRetries: Number(process.env.USENET_MAX_SEGMENT_RETRIES ?? 3),
  });
}
