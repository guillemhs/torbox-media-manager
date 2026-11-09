/**
 * Temporary download token service for USENET pipeline.
 *
 * Generates secure, short-lived tokens that expose locally assembled media
 * files via a tokenized HTTP route (e.g. /api/temp-downloads/:token).
 * TorBox's web download engine pulls the file from this URL.
 *
 * Tracks state in PostgreSQL for auditability and cleanup enforcement.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../db/database';

function nowIso(): string {
  return new Date().toISOString();
}

function log(message: string, meta?: Record<string, unknown>): void {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[TEMP-DOWNLOADS] ${nowIso()} ${message}${payload}`);
}

export interface TempDownloadRecord {
  token: string;
  file_path: string;
  file_name: string;
  file_size: number;
  created_at: string;
  expires_at: string;
  downloaded_at: string | null;
  status: string;
  torbox_webdl_id: string | null;
  torbox_response: string | null;
  error: string | null;
}

export interface TempDownloadOptions {
  filePath: string;
  fileName: string;
  ttlMs?: number;
}

export class TempDownloadService {
  private readonly baseUrl: string;
  private readonly downloadDir: string;
  private readonly defaultTtlMs: number;

  constructor(options: {
    baseUrl: string;
    downloadDir?: string;
    defaultTtlMs?: number;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.downloadDir = options.downloadDir || process.env.TEMP_DOWNLOAD_DIR || '/tmp/torbox-usenet-tmp';
    this.defaultTtlMs = options.defaultTtlMs ?? 30 * 60 * 1000; // 30 minutes

    fs.mkdirSync(this.downloadDir, { recursive: true });
    log('Temp download service initialized', { downloadDir: this.downloadDir, baseUrl: this.baseUrl });
  }

  /** Generate a cryptographically secure random token. */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /** Register a file for temporary download access. Returns the public URL. */
  async register(options: TempDownloadOptions): Promise<{ token: string; url: string; record: TempDownloadRecord }> {
    const token = this.generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options.ttlMs ?? this.defaultTtlMs));
    const stat = fs.statSync(options.filePath);

    const record: TempDownloadRecord = {
      token,
      file_path: options.filePath,
      file_name: options.fileName,
      file_size: stat.size,
      created_at: nowIso(),
      expires_at: expiresAt.toISOString(),
      downloaded_at: null,
      status: 'pending',
      torbox_webdl_id: null,
      torbox_response: null,
      error: null,
    };

    await query(
      `INSERT INTO usenet_temp_downloads
        (token, file_path, file_name, file_size, created_at, expires_at, downloaded_at, status, torbox_webdl_id, torbox_response, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.token,
        record.file_path,
        record.file_name,
        record.file_size,
        record.created_at,
        record.expires_at,
        record.downloaded_at,
        record.status,
        record.torbox_webdl_id,
        record.torbox_response,
        record.error,
      ],
    );

    const url = `${this.baseUrl}/api/temp-downloads/${token}`;
    console.log('[TEMP-DOWNLOADS] Token registered', { token, fileName: options.fileName, fileSize: stat.size, url, expiresAt: expiresAt.toISOString(), timestamp: new Date().toISOString() });
    log('Registered temp download', { token, fileName: options.fileName, fileSize: stat.size, url, expiresAt: expiresAt.toISOString() });

    return { token, url, record };
  }

  /** Get a temp download record by token. */
  async get(token: string): Promise<TempDownloadRecord | null> {
    const result = await query<TempDownloadRecord>(
      `SELECT * FROM usenet_temp_downloads WHERE token = ?`,
      [token],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /** Mark a download as completed (TorBox has pulled the file). */
  async markDownloaded(token: string, torboxWebdlId?: string, torboxResponse?: string): Promise<void> {
    await query(
      `UPDATE usenet_temp_downloads
       SET downloaded_at = ?, status = 'downloaded', torbox_webdl_id = ?, torbox_response = ?
       WHERE token = ?`,
      [nowIso(), torboxWebdlId ?? null, torboxResponse ?? null, token],
    );
    console.log('[TEMP-DOWNLOADS] Download marked complete', { token, torboxWebdlId, timestamp: new Date().toISOString() });
    log('Marked temp download as downloaded', { token, torboxWebdlId });
  }

  /** Mark a download as failed. */
  async markFailed(token: string, error: string): Promise<void> {
    await query(
      `UPDATE usenet_temp_downloads
       SET status = 'failed', error = ?
       WHERE token = ?`,
      [error, token],
    );
    log('Marked temp download as failed', { token, error: typeof error === 'object' ? JSON.stringify(error).slice(0, 1000) : error });
  }

  /** Delete the local file and mark the record as cleaned up. */
  async cleanup(token: string): Promise<void> {
    const record = await this.get(token);
    if (!record) return;

    // Delete the local file
    if (record.file_path && fs.existsSync(record.file_path)) {
      try {
        fs.unlinkSync(record.file_path);
        console.log('[TEMP-DOWNLOADS] Local file deleted', { token, filePath: record.file_path, timestamp: new Date().toISOString() });
    log('Deleted local temp file', { token, filePath: record.file_path });
      } catch (error) {
        log('Failed to delete local temp file', { token, filePath: record.file_path, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Also clean up the temp directory if empty
    const dir = path.dirname(record.file_path);
    if (dir && fs.existsSync(dir)) {
      try {
        fs.rmdirSync(dir);
      } catch { /* ignore - directory may not be empty */ }
    }

    await query(
      `UPDATE usenet_temp_downloads SET status = 'cleaned_up' WHERE token = ?`,
      [token],
    );
    log('Cleaned up temp download record', { token });
  }

  /** Get the file path for a token (used by the route handler to stream the file). */
  async getFilePath(token: string): Promise<string | null> {
    const record = await this.get(token);
    if (!record) return null;
    if (record.status !== 'pending' && record.status !== 'downloaded') return null;
    // Check expiry
    if (new Date(record.expires_at) < new Date()) return null;
    if (!fs.existsSync(record.file_path)) return null;
    return record.file_path;
  }

  /** Get file name for a token. */
  async getFileName(token: string): Promise<string | null> {
    const record = await this.get(token);
    return record ? record.file_name : null;
  }

  /** List all temp downloads (for admin/debugging). */
  async list(): Promise<TempDownloadRecord[]> {
    const result = await query<TempDownloadRecord>(
      `SELECT * FROM usenet_temp_downloads ORDER BY created_at DESC`,
      [],
    );
    return result.rows;
  }

  /** Clean up expired downloads. */
  async cleanupExpired(): Promise<number> {
    const result = await query<TempDownloadRecord>(
      `SELECT token, file_path FROM usenet_temp_downloads
       WHERE expires_at < ? AND status IN ('pending', 'downloaded')`,
      [nowIso()],
    );

    let cleaned = 0;
    for (const record of result.rows) {
      try {
        if (fs.existsSync(record.file_path)) fs.unlinkSync(record.file_path);
        await query(`UPDATE usenet_temp_downloads SET status = 'cleaned_up' WHERE token = ?`, [record.token]);
        cleaned++;
      } catch { /* ignore */ }
    }

    if (cleaned > 0) log(`Cleaned up ${cleaned} expired temp downloads`);
    return cleaned;
  }

  /** Get the public download URL for a token. */
  getDownloadUrl(token: string): string {
    return `${this.baseUrl}/api/temp-downloads/${token}`;
  }
}

/** Build a configured TempDownloadService from environment variables. */
export function buildTempDownloadService(): TempDownloadService {
  const baseUrl = process.env.APP_BASE_URL?.trim() || 'https://tmm.tatsukai.com';
  return new TempDownloadService({
    baseUrl,
    downloadDir: process.env.TEMP_DOWNLOAD_DIR?.trim() || undefined,
    defaultTtlMs: Number(process.env.TEMP_DOWNLOAD_TTL_MS ?? 30 * 60 * 1000),
  });
}
