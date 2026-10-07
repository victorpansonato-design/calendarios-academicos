import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { Config } from './config';
import { Database } from './db/database';
import { LocalFileStorage, type FileStorage } from './storage';
import { anthropicOcr } from './pdf/ocr';
import { createProviders } from './services/providers';
import type { AppContext } from './services/context';
import { HttpError } from './services/errors';
import { seedLifecycleRules } from './repositories/lifecycle';
import { registerAuth } from './http/auth';
import { registerCalendarRoutes } from './http/calendars';
import { registerImportRoutes } from './http/imports';
import { registerNotificationRoutes } from './http/notifications';
import { registerLifecycleRoutes } from './http/lifecycle';
import { registerStudentRoutes } from './http/students';
import { systemStatus } from './services/system';

/* ==========================================================================
   Montagem da aplicação
   --------------------------------------------------------------------------
   `createContext` liga banco, armazenamento, OCR e provedores de envio.
   `buildApp` monta o servidor HTTP em cima de um contexto. Os testes usam os
   dois com banco em memória e relógio controlado.
   ========================================================================== */

export function createContext(config: Config, overrides: Partial<AppContext> = {}): AppContext {
  const db = overrides.db ?? new Database(config.databasePath);
  seedLifecycleRules(db);
  const storage: FileStorage = overrides.storage ?? new LocalFileStorage(config.storageDir);
  const ocr = config.ai.provider === 'anthropic' && config.ai.anthropicApiKey ? anthropicOcr(config.ai.anthropicApiKey, config.ai.model) : null;
  return {
    config,
    db,
    storage,
    ocr,
    providers: createProviders(config),
    now: () => new Date(),
    kickImports: () => undefined,
    ...overrides,
  };
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.map': 'application/json',
};

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 5 * 1048576,
    trustProxy: true,
  });

  await app.register(multipart, { limits: { fileSize: ctx.config.uploads.maxBatchMb * 1048576, files: 2000, fields: 20 } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, detail: err.detail });
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 413 || (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE')
      return reply.code(413).send({ error: `Arquivo grande demais. O limite é ${ctx.config.uploads.maxBatchMb} MB por envio.` });
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Algo deu errado no servidor. Tente de novo; se persistir, avise a TI.' });
  });

  // Interface em outro domínio (ex.: Vercel): só as origens listadas em CORS_ORIGINS.
  // A autenticação é por cabeçalho Authorization, então não há cookie envolvido.
  if (ctx.config.corsOrigins.length) {
    const allowed = new Set(ctx.config.corsOrigins);
    app.addHook('onRequest', async (req, reply) => {
      const origin = req.headers.origin;
      if (!origin || !allowed.has(origin)) return;
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      if (req.method === 'OPTIONS') {
        reply
          .header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
          .header('access-control-allow-headers', 'authorization,content-type,x-integration-key')
          .header('access-control-max-age', '600')
          .code(204)
          .send();
      }
    });
  }

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
  });

  app.get('/api/health', async () => ({ ok: true, time: ctx.now().toISOString() }));
  app.get('/api/system/status', async () => systemStatus(ctx));

  registerAuth(app, ctx);
  registerCalendarRoutes(app, ctx);
  registerImportRoutes(app, ctx);
  registerNotificationRoutes(app, ctx);
  registerLifecycleRoutes(app, ctx);
  registerStudentRoutes(app, ctx);

  // Em produção, a mesma porta serve a interface compilada (apps/web/dist).
  const dist = ctx.config.webDist;
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    const index = fs.readFileSync(path.join(dist, 'index.html'));
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Rota não encontrada.' });
      const clean = decodeURIComponent(req.url.split('?')[0]);
      const file = path.normalize(path.join(dist, clean));
      if (file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const type = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
        return reply
          .header('content-type', type)
          .header('cache-control', clean.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
          .send(fs.readFileSync(file));
      }
      return reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-cache').send(index);
    });
  }

  return app;
}
