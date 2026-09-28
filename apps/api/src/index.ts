import { loadConfig } from './config';
import { buildApp, createContext } from './app';
import { startWorkers } from './workers';
import { systemStatus } from './services/system';

const config = loadConfig();
const ctx = createContext(config);
const app = await buildApp(ctx);

if (config.scheduler.enabled) startWorkers(ctx, (m) => app.log.info(m));
else ctx.kickImports = () => undefined; // o worker separado cuida da fila

await app.listen({ port: config.port, host: config.host });

const status = systemStatus(ctx);
app.log.info(
  `Calendários acadêmicos na porta ${config.port} · autenticação ${config.auth.mode}` +
    ` · push ${status.services.push.state} · e-mail ${status.services.email.state} · OCR ${status.services.ai.state}` +
    (config.demoMode ? ' · MODO DEMONSTRAÇÃO' : ''),
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    ctx.db.close();
    process.exit(0);
  });
}
