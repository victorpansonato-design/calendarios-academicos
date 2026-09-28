import type { SystemStatus } from '@calendarios/core';
import { TIME_ZONE } from '@calendarios/core';
import type { AppContext } from './context';

/** O que a interface mostra sobre cada integração — sem esconder o que falta configurar. */
export function systemStatus(ctx: AppContext): SystemStatus {
  const { config, providers } = ctx;
  const aiConfigured = config.ai.provider === 'anthropic' && Boolean(config.ai.anthropicApiKey);
  return {
    demoMode: config.demoMode,
    authMode: config.auth.mode,
    services: {
      ai: aiConfigured
        ? { state: 'configured', detail: `OCR e leitura visual de páginas digitalizadas ativos (${config.ai.model}).` }
        : { state: 'missing', detail: 'OCR aguardando configuração (AI_PROVIDER, ANTHROPIC_API_KEY). PDFs com texto selecionável são lidos normalmente.' },
      push: { state: providers.push.state, detail: providers.push.detail },
      email: { state: providers.email.state, detail: providers.email.detail },
      integrations: config.integrations.apiKey
        ? { state: 'configured', detail: 'Recebimento de acontecimentos dos sistemas institucionais ativo.' }
        : { state: 'missing', detail: 'Recebimento de acontecimentos aguardando a chave INTEGRATION_API_KEY.' },
    },
    limits: { maxFileMb: config.uploads.maxFileMb, maxBatchMb: config.uploads.maxBatchMb, maxZipEntries: config.uploads.maxZipEntries },
    timeZone: TIME_ZONE,
    version: '1.0.0',
  };
}
