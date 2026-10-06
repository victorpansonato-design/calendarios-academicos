import { useState } from 'react';
import { Ban, RotateCcw, X } from 'lucide-react';
import { Drawer, Confirm } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/button';
import { DataList, SectionLabel, Skeleton } from '../../components/ui/Surfaces';
import { Pill } from '../../components/ui/Badges';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { JOB_STATUS } from '../../lib/labels';
import { whenLong } from '../../lib/format';
import { paths } from '../../lib/router';
import { KindTag } from './AgendaTab';

/* Detalhe de um envio: conteúdo, público, chaves de idempotência e o registro
   de cada tentativa. Daqui se cancela o que ainda não saiu ou se tenta de novo. */

const OUTCOME: Record<string, string> = {
  sent: 'Enviado',
  demo_sent: 'Simulado',
  failed: 'Falhou',
  blocked: 'Aguardando configuração',
  skipped: 'Registro',
};

export function JobDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const res = useResource(() => (id ? api.notifications.job(id) : Promise.resolve(null)), [id]);
  const [confirm, setConfirm] = useState(false);
  const data = res.data;

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.ok(msg);
      await res.reload();
      onChanged();
    } catch (e) {
      toast.error(e);
    } finally {
      setConfirm(false);
    }
  };

  const job = data?.job;
  const canCancel = job && ['scheduled', 'blocked', 'failed'].includes(job.status);
  const canRetry = job && ['failed', 'blocked'].includes(job.status);

  return (
    <>
      <Drawer open={Boolean(id)} onClose={onClose} label="Detalhe do envio" width="md">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="mb-1 text-[12px] font-medium text-muted-foreground">Detalhe do envio</p>
            <h2 className="font-display text-[18px] leading-tight font-medium text-foreground">{job?.title ?? '…'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mt-0.5 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {!job ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <KindTag kind={job.kind} />
                <Pill tone={JOB_STATUS[job.status].tone} solid>
                  {JOB_STATUS[job.status].label}
                </Pill>
                <Pill dot={false}>{job.channel === 'push' ? 'Push' : 'E-mail'}</Pill>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-[13px] font-semibold text-foreground">{job.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-foreground/80">{job.body}</p>
              </div>
              <DataList
                columns={1}
                items={[
                  { label: 'Quando', value: whenLong(job.sendAt) + ' (horário de Brasília)' },
                  { label: 'Para quem', value: job.audience.label },
                  ...(job.context.calendarTitle ? [{ label: 'Calendário', value: job.calendarId ? <a className="text-primary hover:underline" href={paths.calendar(job.calendarId)}>{job.context.calendarTitle}</a> : job.context.calendarTitle }] : []),
                  ...(job.context.eventTitle ? [{ label: 'Evento', value: job.context.eventTitle }] : []),
                  ...(job.context.offsetLabel ? [{ label: 'Regra automática', value: job.context.offsetLabel }] : []),
                  ...(job.context.ruleName ? [{ label: 'Acontecimento', value: job.context.ruleName }] : []),
                  { label: 'Criado por', value: `${job.createdBy} · ${whenLong(job.createdAt)}` },
                  ...(job.canceledReason ? [{ label: 'Motivo do cancelamento', value: job.canceledReason }] : []),
                  ...(job.lastError ? [{ label: 'Último erro', value: job.lastError, tone: 'crit' as const }] : []),
                ]}
              />
              <div>
                <SectionLabel>Registro de execução</SectionLabel>
                {data.attempts.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted-foreground">Ainda não houve tentativa.</p>
                ) : (
                  <ol className="mt-2 space-y-2">
                    {data.attempts.map((a) => (
                      <li key={a.id} className="text-[12px]">
                        <span className="font-semibold text-foreground">{OUTCOME[a.outcome] ?? a.outcome}</span>
                        <span className="text-muted-foreground"> · {whenLong(a.at)}</span>
                        <p className="text-muted-foreground">{a.detail}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <details className="text-[11.5px] text-muted-foreground">
                <summary className="cursor-pointer font-medium">Dados técnicos</summary>
                <p className="mt-1 font-mono break-all">idempotência: {job.idempotencyKey}</p>
                <p className="font-mono break-all">entrega: {job.deliveryKey}</p>
                {job.providerMessageId && <p className="font-mono break-all">provedor: {job.providerMessageId}</p>}
              </details>
            </>
          )}
        </div>
        {job && (canCancel || canRetry) && (
          <footer className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/50 px-5 py-3.5">
            {canCancel && (
              <Button variant="ghost" icon={<Ban className="h-4 w-4" />} onClick={() => setConfirm(true)}>
                Cancelar envio
              </Button>
            )}
            {canRetry && (
              <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => act(() => api.notifications.retry(job.id), 'O envio voltou para a fila.')}>
                Tentar de novo
              </Button>
            )}
          </footer>
        )}
      </Drawer>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => job && act(() => api.notifications.cancel(job.id), 'Envio cancelado.')}
        title="Cancelar este envio?"
        tone="danger"
        message={
          job?.kind === 'event_reminder'
            ? 'Este aviso automático não sai. Se o calendário for publicado de novo com a mesma regra, ele pode ser reagendado.'
            : job?.kind === 'favorite_reminder'
              ? 'O lembrete deste aluno não sai. Se o aluno desmarcar e marcar o evento de novo, ele volta a ser agendado.'
              : 'Esta mensagem não será enviada.'
        }
        confirmLabel="Cancelar envio"
        cancelLabel="Voltar"
      />
    </>
  );
}
