import { useEffect, useMemo, useState } from 'react';
import { Mail, Repeat, Send, Smartphone, UserRound } from 'lucide-react';
import type { JobKind, JobStatus, NotificationJob, SystemStatus } from '@calendarios/core';
import { instantToWall } from '@calendarios/core';
import { Button } from '../../components/ui/Button';
import { Callout, Card, EmptyState, Row, Skeleton } from '../../components/ui/Surfaces';
import { SearchInput, Segmented } from '../../components/ui/Fields';
import { Pill } from '../../components/ui/Badges';
import { api } from '../../lib/api';
import { useInterval, useResource } from '../../lib/hooks';
import { JOB_KIND, JOB_STATUS } from '../../lib/labels';
import { longDate } from '../../lib/format';
import { JobDrawer } from './JobDrawer';
import { AdditionalDialog } from './AdditionalDialog';

/* ==========================================================================
   Agenda
   --------------------------------------------------------------------------
   Todos os envios, agrupados por dia. A origem de cada um fica evidente:
     ↻ Aviso automático — regra do evento, criada pela publicação;
     ➤ Envio adicional  — alguém escolheu mandar;
     ◉ Acontecimento    — mensagem individual para um aluno.
   ========================================================================== */

type View = 'upcoming' | 'sent' | 'all';

/* Três visões só: o que vai sair (inclui o que falhou ou aguarda configuração,
   porque precisa de atenção), o que já saiu, e tudo. */
const VIEW_STATUS: Record<View, JobStatus[] | undefined> = {
  upcoming: ['scheduled', 'sending', 'blocked', 'failed'],
  sent: ['sent', 'demo_sent'],
  all: undefined,
};

function hashParam(name: string): string | null {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get(name);
}

export function KindTag({ kind }: { kind: JobKind }) {
  const icon = kind === 'event_reminder' ? <Repeat className="h-3 w-3" /> : kind === 'additional' ? <Send className="h-3 w-3" /> : <UserRound className="h-3 w-3" />;
  return (
    <Pill dot={false} icon={icon} solid={kind === 'additional'} className={kind === 'additional' ? 'bg-surface-3' : ''}>
      {JOB_KIND[kind]}
    </Pill>
  );
}

export function ChannelIcon({ channel }: { channel: 'push' | 'email' }) {
  return channel === 'push' ? <Smartphone className="h-3.5 w-3.5 text-ink-4" aria-label="Push" /> : <Mail className="h-3.5 w-3.5 text-ink-4" aria-label="E-mail" />;
}

export function AgendaTab({ status }: { status: SystemStatus | null }) {
  const [view, setView] = useState<View>('upcoming');
  const [q, setQ] = useState('');
  const [openJob, setOpenJob] = useState<string | null>(() => hashParam('envio'));
  const [newFor, setNewFor] = useState<string | null | undefined>(() => hashParam('nova') ?? undefined);

  const calendars = useResource(() => api.calendars.list(), []);
  const query = useMemo(() => {
    const p: Record<string, string> = {};
    const st = VIEW_STATUS[view];
    if (st) p.status = st.join(',');
    if (q) p.q = q;
    return p;
  }, [view, q]);
  const jobs = useResource(() => api.notifications.jobs(query), [JSON.stringify(query)]);
  useInterval(() => void jobs.reload(), 15000, true);

  useEffect(() => {
    const on = () => {
      if (hashParam('envio')) setOpenJob(hashParam('envio'));
      if (hashParam('nova')) setNewFor(hashParam('nova'));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const counts = jobs.data?.counts ?? {};
  const sum = (sts: JobStatus[] | undefined) => (sts ? sts.reduce((n, s) => n + (counts[s] ?? 0), 0) : Object.values(counts).reduce((a, b) => a + b, 0));
  const items = jobs.data?.items ?? [];
  const sorted = view === 'upcoming' ? items : [...items].reverse();

  const groups = new Map<string, NotificationJob[]>();
  for (const j of sorted) {
    const d = instantToWall(j.sendAt).date;
    groups.set(d, [...(groups.get(d) ?? []), j]);
  }

  const published = (calendars.data?.items ?? []).filter((c) => c.publishedVersion && c.status !== 'archived');
  const push = status?.services.push;
  const email = status?.services.email;

  return (
    <div className="space-y-4">
      {status?.demoMode && (
        <Callout tone="warn" title="Modo demonstração ligado">
          Nenhuma mensagem sai deste sistema. Os envios aparecem como "Simulado (demonstração)" para você testar o fluxo.
        </Callout>
      )}
      {!status?.demoMode && (push?.state === 'missing' || email?.state === 'missing') && (
        <Callout tone="warn" title="Serviço de envio aguardando configuração">
          {[push?.state === 'missing' ? push.detail : null, email?.state === 'missing' ? email.detail : null].filter(Boolean).join(' ')} Os envios ficam como "Aguardando configuração" até a TI
          ligar o serviço; depois, use "Tentar de novo".
        </Callout>
      )}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="scroll-slim -mx-1 overflow-x-auto px-1">
          <Segmented<View>
            layoutId="agenda-view"
            value={view}
            onChange={setView}
            options={[
              { value: 'upcoming', label: 'Vão sair', count: sum(VIEW_STATUS.upcoming) },
              { value: 'sent', label: 'Já saíram', count: sum(VIEW_STATUS.sent) },
              { value: 'all', label: 'Todos', count: sum(undefined) },
            ]}
          />
        </div>
        <Button variant="primary" size="md" icon={<Send className="h-4 w-4" />} className="xl:order-last xl:ml-auto" onClick={() => setNewFor(null)} disabled={!published.length} title={published.length ? undefined : 'Publique um calendário primeiro'}>
          Enviar uma mensagem
        </Button>
      </div>

      <SearchInput value={q} onValueChange={setQ} placeholder="Procurar mensagem…" className="md:w-80" />

      <Card padded={false}>
        {jobs.loading && !jobs.data ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Send className="h-5 w-5" />}
            title={view === 'upcoming' ? 'Nenhuma mensagem programada' : 'Nada por aqui'}
            message={view === 'upcoming' ? 'Os avisos aparecem aqui quando você publica um calendário com eventos que avisam os alunos.' : 'Mude o filtro para ver outros envios.'}
          />
        ) : (
          <div>
            {[...groups.entries()].map(([date, list]) => (
              <section key={date}>
                <h3 className="sticky top-[64px] z-[1] border-b border-hairline bg-surface/95 px-5 py-2 text-[12px] font-semibold text-ink-3 backdrop-blur first-letter:uppercase lg:top-[74px]">{longDate(date)}</h3>
                <ul className="divide-y divide-hairline">
                  {list.map((j) => (
                    <li key={j.id}>
                      <Row onClick={() => setOpenJob(j.id)} tone={j.status === 'failed' ? 'crit' : 'plain'} className="px-5 py-3">
                        <div className="grid gap-x-4 gap-y-1 md:grid-cols-[56px_minmax(0,1fr)_auto] md:items-center">
                          <span className="font-mono text-[12px] font-medium text-ink-2">{instantToWall(j.sendAt).time.replace(':', 'h')}</span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate text-[13px] font-medium text-ink">
                              <ChannelIcon channel={j.channel} />
                              <span className="truncate">{j.title}</span>
                            </p>
                            <p className="truncate text-[12px] text-ink-3">
                              {j.context.eventTitle ?? j.context.ruleName ?? j.body} · {j.audience.label}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            <KindTag kind={j.kind} />
                            <Pill tone={JOB_STATUS[j.status].tone} solid={j.status === 'failed' || j.status === 'blocked'}>
                              {JOB_STATUS[j.status].label}
                            </Pill>
                          </div>
                        </div>
                      </Row>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <JobDrawer id={openJob} onClose={() => setOpenJob(null)} onChanged={() => jobs.reload()} />
      <AdditionalDialog
        open={newFor !== undefined}
        initialCalendarId={newFor ?? null}
        calendars={published}
        onClose={() => setNewFor(undefined)}
        onCreated={() => {
          setNewFor(undefined);
          void jobs.reload();
        }}
      />
    </div>
  );
}
