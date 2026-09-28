import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config';
import { buildApp, createContext } from '../src/app';
import { Database } from '../src/db/database';
import type { FileStorage } from '../src/storage';
import type { AppContext } from '../src/services/context';
import { createImportWorker } from '../src/services/imports';

export class MemoryStorage implements FileStorage {
  files = new Map<string, Buffer>();
  async put(key: string, data: Uint8Array) {
    this.files.set(key, Buffer.from(data));
  }
  async get(key: string) {
    const f = this.files.get(key);
    if (!f) throw new Error('não encontrado');
    return f;
  }
  async exists(key: string) {
    return this.files.has(key);
  }
}

export interface TestApp {
  app: FastifyInstance;
  ctx: AppContext;
  token: string;
  clock: { now: Date };
  /** Processa a fila de importação até esvaziar. */
  drainImports: () => Promise<void>;
  api: <T = unknown>(method: string, url: string, body?: unknown) => Promise<{ status: number; body: T }>;
}

export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const saved: Record<string, string | undefined> = {};
  const merged = { DEMO_MODE: 'true', INTEGRATION_API_KEY: 'chave-teste', ...env };
  for (const [k, v] of Object.entries(merged)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  const config = loadConfig();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  config.webDist = '/nao-existe';

  const clock = { now: new Date('2026-08-01T12:00:00Z') };
  const ctx = createContext(config, { db: new Database(':memory:'), storage: new MemoryStorage(), now: () => clock.now });
  ctx.ocr = null;
  const app = await buildApp(ctx);

  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { provider: 'microsoft' } });
  const token = login.json().token as string;

  const api = async <T,>(method: string, url: string, body?: unknown) => {
    const res = await app.inject({ method: method as 'GET', url, payload: body as object, headers: { authorization: `Bearer ${token}` } });
    return { status: res.statusCode, body: res.json() as T };
  };

  const drainImports = async () => {
    const worker = createImportWorker(ctx);
    let done = false;
    ctx.kickImports = () => undefined;
    worker.kick();
    // espera a fila esvaziar
    for (let i = 0; i < 400 && !done; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      const pending = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM import_items WHERE status IN ('queued','reading')")!.n;
      done = pending === 0;
    }
  };

  return { app, ctx, token, clock, drainImports, api };
}

export function multipart(files: { field: string; path: string; data: Buffer }[]): { body: Buffer; contentType: string } {
  const boundary = '----teste' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  const manifest = JSON.stringify(files.map((f) => ({ field: f.field, path: f.path })));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${manifest}\r\n`));
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${encodeURIComponent(f.path.split('/').pop()!)}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(f.data);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}
