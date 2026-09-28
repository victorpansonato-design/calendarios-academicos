import type { Channel, NotificationJob, ServiceState } from '@calendarios/core';
import type { Config } from '../config';

/* ==========================================================================
   Provedores de envio (push e e-mail)
   --------------------------------------------------------------------------
   Este sistema NÃO fala com Firebase, APNs ou SMTP diretamente. Ele entrega o
   envio já montado a um gateway da TI por HTTP (contrato em docs/API.md →
   "Gateway de envio"). O gateway resolve o público (quem são os alunos do
   recorte, quais dispositivos e e-mails) e faz a entrega.

   Três estados, sempre visíveis na interface:
     configured — URL do gateway definida: envio real;
     demo       — DEMO_MODE=true e sem gateway: nada sai, e o envio fica
                  registrado como "Simulado (demonstração)";
     missing    — sem gateway e sem demo: o envio fica "Aguardando configuração".
   ========================================================================== */

export interface DeliveryResult {
  outcome: 'sent' | 'demo_sent' | 'blocked' | 'failed';
  providerMessageId?: string;
  detail: string;
  /** Falha temporária: vale tentar de novo. */
  retryable?: boolean;
}

export interface ChannelProvider {
  channel: Channel;
  state: ServiceState;
  detail: string;
  deliver(job: NotificationJob): Promise<DeliveryResult>;
}

/** O corpo que o gateway da TI recebe. É o contrato. */
export function gatewayPayload(job: NotificationJob) {
  return {
    deliveryKey: job.deliveryKey,
    idempotencyKey: job.idempotencyKey,
    channel: job.channel,
    kind: job.kind,
    audience: job.audience,
    message: { title: job.title, body: job.body },
    context: {
      jobId: job.id,
      calendarId: job.calendarId,
      eventUid: job.eventUid,
      lifecycleRuleId: job.lifecycleRuleId,
    },
    scheduledFor: job.sendAt,
  };
}

function webhookProvider(channel: Channel, url: string, token: string): ChannelProvider {
  return {
    channel,
    state: 'configured',
    detail: `Gateway da TI: ${new URL(url).host}`,
    async deliver(job) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': job.deliveryKey,
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(gatewayPayload(job)),
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        return { outcome: 'failed', detail: `Gateway inacessível: ${(err as Error).message}`, retryable: true };
      }
      const text = await res.text().catch(() => '');
      if (res.ok) {
        let id: string | undefined;
        try {
          id = (JSON.parse(text) as { messageId?: string }).messageId;
        } catch {
          /* resposta sem JSON */
        }
        return { outcome: 'sent', providerMessageId: id, detail: `Aceito pelo gateway (HTTP ${res.status}).` };
      }
      return {
        outcome: 'failed',
        detail: `Gateway recusou (HTTP ${res.status}): ${text.slice(0, 300)}`,
        retryable: res.status >= 500 || res.status === 429,
      };
    },
  };
}

function demoProvider(channel: Channel): ChannelProvider {
  return {
    channel,
    state: 'demo',
    detail: 'Modo demonstração: nenhum envio real é feito.',
    async deliver() {
      return { outcome: 'demo_sent', detail: 'Modo demonstração — nada foi enviado a nenhum aluno.' };
    },
  };
}

function missingProvider(channel: Channel): ChannelProvider {
  const name = channel === 'push' ? 'push' : 'e-mail';
  return {
    channel,
    state: 'missing',
    detail: `Serviço de ${name} aguardando configuração da TI (${channel === 'push' ? 'PUSH_WEBHOOK_URL' : 'EMAIL_WEBHOOK_URL'}).`,
    async deliver() {
      return { outcome: 'blocked', detail: `Serviço de ${name} aguardando configuração. Nada foi enviado.` };
    },
  };
}

export function createProviders(config: Config): Record<Channel, ChannelProvider> {
  const make = (channel: Channel, url: string, token: string) =>
    url ? webhookProvider(channel, url, token) : config.demoMode ? demoProvider(channel) : missingProvider(channel);
  return {
    push: make('push', config.push.webhookUrl, config.push.webhookToken),
    email: make('email', config.email.webhookUrl, config.email.webhookToken),
  };
}
