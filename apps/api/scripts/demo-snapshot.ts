import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ==========================================================================
   Retrato para a demonstração só-interface (apps/web, VITE_DEMO=true)
   --------------------------------------------------------------------------
   Sobe a API com banco temporário, importa o calendário presencial de
   exemplo pelo fluxo normal e grava as respostas da API em
   apps/web/src/demo/snapshot.json. Rode de novo quando a leitura mudar:
     npx tsx apps/api/scripts/demo-snapshot.ts
   ========================================================================== */

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'calendarios-demo-'));
process.env.DEMO_MODE = 'true';
process.env.NODE_ENV = 'test';

const { loadConfig } = await import('../src/config');
const { buildApp, createContext } = await import('../src/app');
const { createImportWorker } = await import('../src/services/imports');

const ctx = createContext(loadConfig());
const app = await buildApp(ctx);
const worker = createImportWorker(ctx);
ctx.kickImports = worker.kick;

const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { provider: 'microsoft' } });
const auth = { authorization: `Bearer ${login.json().token}` };
const get = async (url: string) => {
  const res = await app.inject({ method: 'GET', url, headers: auth });
  if (res.statusCode !== 200) throw new Error(`${url}: ${res.statusCode} ${res.body}`);
  return res.json();
};

const pdf = fs.readFileSync(path.join(here, '../test/fixtures/calendario_presencial_2026_2.pdf'));
const boundary = '----demo';
const body = Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${JSON.stringify([{ field: 'f0', path: 'calendario_presencial_2026_2.pdf' }])}\r\n`),
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="f0"; filename="calendario_presencial_2026_2.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
  pdf,
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);
const staged = await app.inject({ method: 'POST', url: '/api/imports', payload: body, headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` } });
const batchId = staged.json().id as string;
await app.inject({ method: 'POST', url: `/api/imports/${batchId}/start`, payload: {}, headers: auth });
for (let i = 0; i < 400; i += 1) {
  const n = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM import_items WHERE status IN ('queued','reading')")!.n;
  if (n === 0) break;
  await new Promise((r) => setTimeout(r, 50));
}

const { items } = await get('/api/calendars');
const calendars = [];
for (const c of items) {
  calendars.push({
    detail: await get(`/api/calendars/${c.id}`),
    versions: (await get(`/api/calendars/${c.id}/versions`)).items,
    audit: (await get(`/api/calendars/${c.id}/audit`)).items,
  });
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  user: (await get('/api/auth/me')).user,
  status: await get('/api/system/status'),
  calendars,
  imports: { [batchId]: await get(`/api/imports/${batchId}`) },
  importsRecent: (await get('/api/imports')).items,
  lifecycleRules: (await get('/api/lifecycle/rules')).items,
};

const out = path.join(here, '../../web/src/demo/snapshot.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(snapshot));
console.log(`retrato gravado: ${calendars.length} calendário(s), ${calendars.reduce((n, c) => n + c.detail.events.length, 0)} eventos → ${path.relative(process.cwd(), out)}`);
await app.close();
ctx.db.close();
