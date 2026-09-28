import type { AppContext } from './services/context';
import { createImportWorker } from './services/imports';
import { dispatchDue } from './services/notifications';

/* ==========================================================================
   Processos de fundo
   --------------------------------------------------------------------------
     · fila de importação — lê PDFs, poucos por vez;
     · agendador — a cada SCHEDULER_INTERVAL_SECONDS, dispara os envios
       vencidos. Pode rodar em várias instâncias: o disparo reivindica cada
       envio de forma atômica no banco.

   Rodam dentro da API por padrão (RUN_WORKERS=true). Para separar, rode a API
   com RUN_WORKERS=false e `npm run worker -w @calendarios/api` à parte.
   ========================================================================== */

export function startWorkers(ctx: AppContext, log: (msg: string) => void = console.log) {
  const importWorker = createImportWorker(ctx);
  ctx.kickImports = importWorker.kick;
  importWorker.recover();

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const n = await dispatchDue(ctx);
      if (n) log(`agendador: ${n} envio(s) processado(s)`);
    } catch (err) {
      log(`agendador: erro ${(err as Error).message}`);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, ctx.config.scheduler.intervalSeconds * 1000);
  void tick();
  return () => clearInterval(timer);
}
