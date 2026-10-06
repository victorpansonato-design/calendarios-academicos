import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ==========================================================================
   Configuração por ambiente
   --------------------------------------------------------------------------
   Toda integração externa é opcional e declarada aqui. Sem credencial, a
   função correspondente aparece na interface como "aguardando configuração"
   — nunca é simulada em silêncio. O único jeito de ver envios "de mentira" é
   ligar DEMO_MODE=true, e aí eles aparecem marcados como demonstração.

   Veja .env.example na raiz para a lista comentada.
   ========================================================================== */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v === undefined || v === '' ? fallback : Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Variável ${name} inválida: "${v}"`);
  return n;
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(v.toLowerCase());
}

function str(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export function loadConfig() {
  const dataDir = path.resolve(repoRoot, str('DATA_DIR', 'data'));
  return {
    port: num('PORT', 3001),
    host: str('HOST', '0.0.0.0'),
    dataDir,
    databasePath: path.resolve(dataDir, str('DATABASE_FILE', 'calendarios.sqlite')),
    storageDir: path.resolve(dataDir, 'files'),
    webDist: path.resolve(repoRoot, 'apps/web/dist'),

    demoMode: bool('DEMO_MODE', false),

    /** Origens da interface quando ela está em outro domínio (ex.: Vercel), separadas por vírgula. */
    corsOrigins: str('CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),

    auth: {
      /** `dev`: o botão "Entrar com Microsoft" entra direto (sem Outlook). `entra`: a TI liga o OIDC. */
      mode: (str('AUTH_MODE', 'dev') === 'entra' ? 'entra' : 'dev') as 'dev' | 'entra',
      devUserName: str('DEV_USER_NAME', 'Equipe Acadêmica'),
      devUserEmail: str('DEV_USER_EMAIL', 'equipe.academica@anchieta.br'),
      sessionHours: num('SESSION_HOURS', 12),
    },

    uploads: {
      maxFileMb: num('MAX_FILE_MB', 25),
      maxBatchMb: num('MAX_BATCH_MB', 300),
      maxZipEntries: num('MAX_ZIP_ENTRIES', 500),
      maxUnzippedMb: num('MAX_UNZIPPED_MB', 600),
      importConcurrency: num('IMPORT_CONCURRENCY', 2),
    },

    ai: {
      provider: str('AI_PROVIDER'),
      anthropicApiKey: str('ANTHROPIC_API_KEY'),
      model: str('AI_MODEL', 'claude-opus-5'),
    },

    push: {
      /** Endpoint HTTP do gateway de push da TI (contrato em docs/API.md). */
      webhookUrl: str('PUSH_WEBHOOK_URL'),
      webhookToken: str('PUSH_WEBHOOK_TOKEN'),
    },

    email: {
      /** Endpoint HTTP do serviço de e-mail da TI (mesmo contrato do push). */
      webhookUrl: str('EMAIL_WEBHOOK_URL'),
      webhookToken: str('EMAIL_WEBHOOK_TOKEN'),
    },

    integrations: {
      /** Chave que os sistemas institucionais enviam em X-Integration-Key. */
      apiKey: str('INTEGRATION_API_KEY'),
      /** Chave opcional para a leitura pública dos calendários publicados. */
      publicApiKey: str('PUBLIC_API_KEY'),
      /** Chave do backend do portal/app para favoritos e "ocultar" do aluno. Sem ela, essas rotas respondem 503. */
      studentApiKey: str('STUDENT_API_KEY'),
    },

    scheduler: {
      enabled: bool('RUN_WORKERS', true),
      intervalSeconds: num('SCHEDULER_INTERVAL_SECONDS', 20),
      maxAttempts: num('SCHEDULER_MAX_ATTEMPTS', 3),
      /** Envios por lote. O disparo repete lotes enquanto houver vencidos (lembretes de favorito são por aluno). */
      batchSize: num('SCHEDULER_BATCH_SIZE', 200),
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;
