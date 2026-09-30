import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from './src/config';
import { buildApp, createContext } from './src/app';
import { startWorkers } from './src/workers';

/* ==========================================================================
   Entrada da Vercel
   --------------------------------------------------------------------------
   O builder Fastify da Vercel procura server.ts na raiz do app antes de
   src/app.ts, e espera uma função (req, res) em vez de app.listen(). Fora da
   Vercel a entrada continua sendo src/index.ts.

   Limitação: na Vercel o banco e os PDFs ficam em /tmp, que some quando a
   instância recicla. Para guardar os calendários de verdade, hospede a API
   num servidor com disco (veja o README).
   ========================================================================== */

let ready: Promise<FastifyInstance> | undefined;

function boot(): Promise<FastifyInstance> {
  // Sem gateway de push/e-mail da TI: os envios aparecem marcados como demonstração.
  process.env.DEMO_MODE ??= 'true';
  const ctx = createContext(loadConfig());
  return buildApp(ctx).then(async (app) => {
    if (ctx.config.scheduler.enabled) startWorkers(ctx, (m) => app.log.info(m));
    await app.ready();
    await seedDemo(app, ctx);
    return app;
  });
}

/** Demonstração: banco vazio recebe o calendário presencial de exemplo, lido pelo fluxo normal de importação. */
async function seedDemo(app: FastifyInstance, ctx: ReturnType<typeof createContext>) {
  const pdfPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed', 'calendario_presencial_2026_2.pdf');
  if (!fs.existsSync(pdfPath)) return;
  if (ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM calendars')!.n > 0) return;

  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { provider: 'microsoft' } });
  const auth = { authorization: `Bearer ${login.json().token}` };
  const boundary = '----demo' + Date.now().toString(16);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${JSON.stringify([{ field: 'f0', path: 'Presencial/calendario_presencial_2026_2.pdf' }])}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="f0"; filename="calendario_presencial_2026_2.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    fs.readFileSync(pdfPath),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const staged = await app.inject({ method: 'POST', url: '/api/imports', payload: body, headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` } });
  await app.inject({ method: 'POST', url: `/api/imports/${staged.json().id}/start`, payload: {}, headers: auth });

  // espera a leitura terminar (poucos segundos) antes de responder à primeira requisição
  for (let i = 0; i < 120; i += 1) {
    const pending = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM import_items WHERE status IN ('queued','reading')")!.n;
    if (pending === 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= boot().catch((err) => {
    ready = undefined; // tenta de novo na próxima requisição
    throw err;
  });
  const app = await ready;
  app.server.emit('request', req, res);
}
