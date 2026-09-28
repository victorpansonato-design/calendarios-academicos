import { useState } from 'react';
import { Mail, ShieldCheck, Smartphone } from 'lucide-react';
import type { LifecycleRule, SystemStatus } from '@calendarios/core';
import { isStepMapped } from '@calendarios/core';
import { Callout, Card, EmptyState, Row, Skeleton } from '../../components/ui/Surfaces';
import { Pill } from '../../components/ui/Badges';
import { api } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { whenLong } from '../../lib/format';
import { RuleDrawer } from './RuleDrawer';

/* ==========================================================================
   Acontecimentos do aluno
   --------------------------------------------------------------------------
   Regras de comunicação disparadas por mudança de status nos sistemas
   institucionais. Cada envio vai só para o aluno do acontecimento.

   Nenhuma integração é presumida: as regras nascem "Aguardando mapeamento da
   TI" e só podem ser ligadas depois que o sistema de origem e o código de
   status forem preenchidos.
   ========================================================================== */

export function ruleState(rule: LifecycleRule): { label: string; tone: 'warn' | 'ok' | 'neutral' } {
  const mapped = rule.steps.filter(isStepMapped).length;
  const on = rule.steps.filter((s) => s.enabled).length;
  if (!mapped) return { label: 'Aguardando mapeamento da TI', tone: 'warn' };
  if (on) return { label: on === rule.steps.length ? 'Ativa' : `${on} de ${rule.steps.length} etapas ativas`, tone: 'ok' };
  return { label: 'Mapeada, desligada', tone: 'neutral' };
}

const OUTCOME: Record<string, string> = {
  scheduled: 'Envio agendado',
  unmapped: 'Sem regra para este status',
  disabled: 'Etapa desligada',
  opted_out: 'Aluno desativou o canal',
  duplicate: 'Repetido (ignorado)',
};

export function LifecycleTab({ status }: { status: SystemStatus | null }) {
  const rules = useResource(() => api.lifecycle.rules(), []);
  const events = useResource(() => api.lifecycle.events(), []);
  const [open, setOpen] = useState<LifecycleRule | null>(null);
  const integration = status?.services.integrations;

  return (
    <div className="space-y-4">
      <Callout tone="info" icon={<ShieldCheck className="h-4 w-4" />} title="Cada mensagem vai somente para o aluno do acontecimento">
        A mensagem usa só os dados daquele acontecimento. O sistema recebe o identificador do aluno, respeita as preferências de canal e registra cada envio. Os status oficiais e o
        mapeamento técnico são definidos pela TI.
      </Callout>
      {integration && integration.state !== 'configured' && (
        <Callout tone="warn" title="Recebimento aguardando configuração">
          {integration.detail} Até lá, as regras podem ser preparadas, mas nenhum acontecimento chega.
        </Callout>
      )}

      <Card padded={false}>
        {rules.loading && !rules.data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {rules.data?.items.map((r) => {
              const st = ruleState(r);
              const channels = [...new Set(r.steps.flatMap((s) => s.channels))];
              return (
                <li key={r.id}>
                  <Row onClick={() => setOpen(r)} className="px-5 py-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-ink">{r.name}</p>
                        <p className="mt-0.5 text-[12px] text-ink-3">{r.description}</p>
                        {r.steps.length > 1 && (
                          <p className="mt-1.5 flex flex-wrap gap-1.5">
                            {r.steps.map((s) => (
                              <Pill key={s.id} dot={false}>
                                {s.label}
                              </Pill>
                            ))}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="flex items-center gap-1 text-ink-4">
                          {channels.includes('push') && <Smartphone className="h-3.5 w-3.5" aria-label="Push" />}
                          {channels.includes('email') && <Mail className="h-3.5 w-3.5" aria-label="E-mail" />}
                        </span>
                        <Pill tone={st.tone} solid={st.tone === 'warn'}>
                          {st.label}
                        </Pill>
                      </div>
                    </div>
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card padded={false}>
        <div className="border-b border-hairline px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Últimos acontecimentos recebidos</h2>
          <p className="mt-0.5 text-[12px] text-ink-3">O que os sistemas institucionais enviaram e o que foi feito com cada um.</p>
        </div>
        {events.data?.items.length ? (
          <ul className="divide-y divide-hairline">
            {events.data.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-[12px]">
                <span className="font-mono text-ink-3">{whenLong(e.receivedAt)}</span>
                <span className="text-ink-2">
                  {e.sourceSystem} · <span className="font-mono">{e.statusCode}</span>
                </span>
                <span className="text-ink-4">aluno {e.studentId}</span>
                <span className="ml-auto">
                  <Pill tone={e.outcome === 'scheduled' ? 'ok' : e.outcome === 'unmapped' ? 'warn' : 'muted'}>{OUTCOME[e.outcome]}</Pill>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="Nenhum acontecimento recebido" message="Quando a TI ligar a integração, eles aparecem aqui." />
        )}
      </Card>

      <RuleDrawer
        rule={open}
        onClose={() => setOpen(null)}
        onSaved={() => {
          void rules.reload();
        }}
      />
    </div>
  );
}
