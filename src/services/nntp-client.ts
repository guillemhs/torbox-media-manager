/**
 * Minimal NNTP client for downloading Usenet articles locally.
 *
 * Uses Node.js net module (no external dependencies). Supports:
 *   - TCP connection to an NNTP server
 *   - Optional AUTHINFO USER/PASS authentication
 *   - GROUP selection
 *   - ARTICLE/BODY retrieval by message ID
 *   - LIST / NEWGROUPS for discovery
 *
 * Intended for assembling .nzb segments into local media files.
 */

import { Socket } from 'node:net';
import { once } from 'node:events';

export interface NntpConfig {
  host: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  timeoutMs?: number;
}

export interface NntpArticle {
  messageId: string;
  newsgroups: string[];
  subject?: string;
  body: Buffer;
}

export class NntpError extends Error {
  constructor(public code: number, message: string) {
    super(message);
    this.name = 'NntpError';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function log(message: string, meta?: Record<string, unknown>): void {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[NNTP] ${nowIso()} ${message}${payload}`);
}

export class NntpClient {
  private socket: Socket | null = null;
  private buffer = '';
  private connected = false;
  private authenticated = false;
  private readonly host: string;
  private readonly port: number;
  private readonly secure: boolean;
  private readonly username?: string;
  private readonly password?: string;
  private readonly timeoutMs: number;

  constructor(config: NntpConfig) {
    this.host = config.host;
    this.port = config.port ?? (config.secure ? 563 : 119);
    this.secure = config.secure ?? false;
    this.username = config.username;
    this.password = config.password;
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  /** Connect to the NNTP server and read the greeting. */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      this.socket = socket;

      socket.setTimeout(this.timeoutMs);
      socket.setEncoding('utf8');

      const onError = (error: Error) => {
        this.connected = false;
        reject(new NntpError(0, `NNTP connection error: ${error.message}`));
      };

      const onTimeout = () => {
        socket.destroy();
        reject(new NntpError(0, `NNTP connection timed out after ${this.timeoutMs}ms`));
      };

      socket.once('error', onError);
      socket.once('timeout', onTimeout);

      socket.connect(this.port, this.host, () => {
        socket.removeListener('error', onError);
        socket.removeListener('timeout', onTimeout);
        this.connected = true;
        log('Connected to NNTP server', { host: this.host, port: this.port, secure: this.secure });
        resolve();
      });
    });

    // Read greeting after connect
    await this.readLine();
  }

  /** Send a command and read the response line. */
  private async sendCommand(command: string): Promise<string> {
    if (!this.socket || !this.connected) {
      throw new NntpError(0, 'NNTP client not connected');
    }

    this.socket.write(`${command}\r\n`);
    const response = await this.readLine();
    return response;
  }

  /** Read a single line from the socket, handling multiline responses. */
  private async readLine(): Promise<string> {
    if (!this.socket) throw new NntpError(0, 'NNTP socket not available');

    while (!this.buffer.includes('\n')) {
      const chunk = await once(this.socket, 'data');
      this.buffer += chunk.toString();
    }

    const newlineIndex = this.buffer.indexOf('\n');
    const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
    this.buffer = this.buffer.slice(newlineIndex + 1);
    return line;
  }

  /** Read a multiline response (ends with a line containing only "."). */
  private async readMultiline(): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      if (line === '.') break;
      // Unescape leading dots
      lines.push(line.startsWith('..') ? line.slice(1) : line);
    }
    return lines;
  }

  /** Parse the response code from a line like "200 welcome" or "200-...". */
  private responseCode(line: string): number {
    const match = /^(\d{3})/.exec(line);
    return match ? Number(match[1]) : 0;
  }

  /** Authenticate with AUTHINFO USER/PASS if credentials are provided. */
  async authenticate(): Promise<void> {
    if (this.username && this.password) {
      const userResp = await this.sendCommand(`AUTHINFO USER ${this.username}`);
      const userCode = this.responseCode(userResp);
      if (userCode !== 381) {
        throw new NntpError(userCode, `AUTHINFO USER failed: ${userResp}`);
      }

      const passResp = await this.sendCommand(`AUTHINFO PASS ${this.password}`);
      const passCode = this.responseCode(passResp);
      if (passCode !== 281) {
        throw new NntpError(passCode, `AUTHINFO PASS failed: ${passResp}`);
      }
      this.authenticated = true;
      log('NNTP authentication successful');
    } else {
      log('No NNTP credentials provided; connecting anonymously');
    }
  }

  /** Select a newsgroup. Returns group info: { count, first, last, name }. */
  async group(name: string): Promise<{ count: number; first: number; last: number; name: string }> {
    const resp = await this.sendCommand(`GROUP ${name}`);
    const code = this.responseCode(resp);
    if (code !== 211) {
      throw new NntpError(code, `GROUP ${name} failed: ${resp}`);
    }
    const match = /^211\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/i.exec(resp);
    if (!match) throw new NntpError(code, `Unexpected GROUP response: ${resp}`);
    return {
      count: Number(match[1]),
      first: Number(match[2]),
      last: Number(match[3]),
      name: match[4],
    };
  }

  /** Retrieve an article by message ID. Returns the raw article buffer. */
  async article(messageId: string): Promise<NntpArticle> {
    const cleanId = messageId.replace(/^[<>\s]+|[<>\s]+$/g, '');
    const resp = await this.sendCommand(`ARTICLE <${cleanId}>`);
    const code = this.responseCode(resp);
    if (code !== 220) {
      throw new NntpError(code, `ARTICLE ${cleanId} failed: ${resp}`);
    }

    const lines = await this.readMultiline();
    const raw = lines.join('\r\n') + '\r\n';

    // Parse headers
    const headerEnd = raw.indexOf('\r\n\r\n');
    const headerSection = headerEnd !== -1 ? raw.slice(0, headerEnd) : '';
    const body = headerEnd !== -1 ? Buffer.from(raw.slice(headerEnd + 4)) : Buffer.from(raw);

    const newsgroupsMatch = /^Newsgroups:\s*(.+)$/im.exec(headerSection);
    const newsgroups = newsgroupsMatch ? newsgroupsMatch[1].split(',').map(g => g.trim()) : [];
    const subjectMatch = /^Subject:\s*(.+)$/im.exec(headerSection);
    const subject = subjectMatch ? subjectMatch[1].trim() : undefined;

    log('Downloaded article', { messageId: cleanId, newsgroups, size: body.length });

    return {
      messageId: cleanId,
      newsgroups,
      subject,
      body,
    };
  }

  /** Retrieve article body only by message ID. */
  async body(messageId: string): Promise<Buffer> {
    const cleanId = messageId.replace(/^[<>\s]+|[<>\s]+$/g, '');
    const resp = await this.sendCommand(`BODY <${cleanId}>`);
    const code = this.responseCode(resp);
    if (code !== 222) {
      throw new NntpError(code, `BODY ${cleanId} failed: ${resp}`);
    }
    const lines = await this.readMultiline();
    return Buffer.from(lines.join('\r\n') + '\r\n');
  }

  /** List available newsgroups. */
  async list(): Promise<string[]> {
    const resp = await this.sendCommand('LIST');
    const code = this.responseCode(resp);
    if (code !== 215) {
      throw new NntpError(code, `LIST failed: ${resp}`);
    }
    return this.readMultiline();
  }

  /** Disconnect from the NNTP server. */
  disconnect(): void {
    if (this.socket) {
      try { this.socket.destroy(); } catch { /* ignore */ }
      this.socket = null;
    }
    this.connected = false;
    this.authenticated = false;
    log('Disconnected from NNTP server');
  }
}
