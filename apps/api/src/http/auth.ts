import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Permission, User } from '@calendarios/core';
import { can } from '@calendarios/core';
import type { AppContext } from '../services/context';
import { forbidden, HttpError } from '../services/errors';
import { createSession, deleteSession, upsertUser, userForSession } from '../repositories/users';
import { recordAudit } from '../repositories/audit';

/* ==========================================================================
   Autenticação e permissões
   --------------------------------------------------------------------------
   AUTH_MODE=dev (padrão): login só visual. O botão "Entrar com a conta
   Microsoft" apenas abre o sistema; a API trata toda requisição como o usuário
   de desenvolvimento (papel admin). NÃO há Outlook, senha nem controle de
   acesso — é só para operar enquanto a TI não liga o SSO.

   AUTH_MODE=entra: reservado para o Microsoft Entra ID (OIDC). O login devolve
   501 até a TI implementar `loginWithEntra` (ver docs/INTEGRACAO_TI.md). O
   resto do sistema já trabalha com sessão + papel, então só esta porta muda.
   ========================================================================== */

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

const PUBLIC_PREFIXES = ['/api/health', '/api/auth/login', '/api/system/status', '/api/integrations/', '/api/public/'];

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7).trim();
  // o visualizador de PDF abre em nova aba (sem cabeçalho): aceita ?token=
  const q = (req.query as Record<string, string> | undefined)?.token;
  return q && req.url.startsWith('/api/files/') ? q : null;
}

export function registerAuth(app: FastifyInstance, ctx: AppContext) {
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    if (PUBLIC_PREFIXES.some((p) => req.url.startsWith(p))) return;
    const token = bearer(req);
    let user = token ? userForSession(ctx.db, token) : undefined;
    // Login visual (AUTH_MODE=dev): sem sessão, quem usa é o usuário de
    // desenvolvimento. NÃO há controle de acesso neste modo — só para uso interno
    // até a TI ligar o Entra ID (AUTH_MODE=entra), quando a sessão passa a valer.
    if (!user && ctx.config.auth.mode === 'dev') user = upsertUser(ctx.db, ctx.config.auth.devUserEmail, ctx.config.auth.devUserName, 'admin');
    if (!user) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
    req.user = user;
  });

  app.post('/api/auth/login', async (req) => {
    const body = (req.body ?? {}) as { provider?: string };
    if (body.provider !== 'microsoft') throw new HttpError(400, 'Provedor de login inválido.');
    if (ctx.config.auth.mode !== 'dev')
      throw new HttpError(501, 'O login com a conta Microsoft (Entra ID) aguarda configuração da TI.');
    const user = upsertUser(ctx.db, ctx.config.auth.devUserEmail, ctx.config.auth.devUserName, 'admin');
    const token = createSession(ctx.db, user.id, ctx.config.auth.sessionHours);
    recordAudit(ctx.db, { actor: user.name, action: 'auth.login', entity: 'system', entityId: user.id, summary: 'Entrou no sistema (modo de desenvolvimento).' });
    return { token, user };
  });

  app.post('/api/auth/logout', async (req) => {
    const token = bearer(req);
    if (token) deleteSession(ctx.db, token);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({ user: req.user }));
}

/** Exige uma permissão do papel da pessoa logada. */
export function need(req: FastifyRequest, permission: Permission): User {
  const user = req.user;
  if (!user) throw new HttpError(401, 'Entre para continuar.');
  if (!can(user.role, permission)) throw forbidden();
  return user;
}

/** Sistemas institucionais se identificam por chave, não por sessão. */
export function needIntegrationKey(ctx: AppContext, req: FastifyRequest, reply: FastifyReply, kind: 'integration' | 'public'): boolean {
  const expected = kind === 'integration' ? ctx.config.integrations.apiKey : ctx.config.integrations.publicApiKey;
  if (kind === 'integration' && !expected) {
    reply.code(503).send({ error: 'Integração aguardando configuração (INTEGRATION_API_KEY).' });
    return false;
  }
  if (!expected) return true; // leitura pública sem chave configurada = aberta
  if (req.headers['x-integration-key'] !== expected) {
    reply.code(401).send({ error: 'Chave de integração inválida.' });
    return false;
  }
  return true;
}
