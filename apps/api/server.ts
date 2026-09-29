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
    return app;
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= boot().catch((err) => {
    ready = undefined; // tenta de novo na próxima requisição
    throw err;
  });
  const app = await ready;
  app.server.emit('request', req, res);
}
