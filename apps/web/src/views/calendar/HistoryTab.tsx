import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { CalendarVersionSummary } from '@calendarios/core';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, Skeleton } from '../../components/ui/Surfaces';
import { Pill } from '../../components/ui/Badges';
import { Confirm } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { whenLong } from '../../lib/format';
import type { DetailContext } from './CalendarDetailView';

/* Cada gravação é uma versão completa e restaurável. Restaurar não apaga
   nada: cria uma versão nova igual à escolhida. A auditoria registra tudo,
   inclusive conferências de pendência e envios. */

const KIND: Record<CalendarVersionSummary['kind'], string> = {
  import: 'Importação',
  edit: 'Edição',
  submit: 'Enviado para revisão',
  publish: 'Publicação',
  restore: 'Restauração',
  archive: 'Arquivamento',
};

export function HistoryTab({ ctx }: { ctx: DetailContext }) {
  const toast = useToast();
  const { calendar } = ctx.detail;
  const versions = useResource(() => api.calendars.versions(calendar.id), [calendar.id, calendar.version]);
  const [restore, setRestore] = useState<CalendarVersionSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const doRestore = async () => {
    if (!restore) return;
    setBusy(true);
    try {
      ctx.apply(await api.calendars.restore(calendar.id, restore.id), `Versão ${restore.number} restaurada como nova versão.`);
      setRestore(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Card padded={false}>
        <div className="p-5 pb-3">
          <CardHeader title="Histórico" subtitle="Cada alteração fica guardada. Se algo foi mudado sem querer, é só restaurar." />
        </div>
        {versions.loading && !versions.data ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {versions.data?.items.map((v) => (
              <li key={v.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 w-9 shrink-0 font-mono text-[12px] font-medium text-muted-foreground">v{v.number}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{v.summary}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {KIND[v.kind]} · {v.createdBy} · {whenLong(v.createdAt)} · {v.eventCount} eventos
                  </p>
                </div>
                {v.published && v.number === calendar.publishedVersion && <Pill tone="info">No ar</Pill>}
                {v.number !== calendar.version && calendar.status !== 'archived' && (
                  <Button size="xs" variant="ghost" icon={<RotateCcw className="h-3 w-3" />} onClick={() => setRestore(v)}>
                    Restaurar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Confirm
        open={Boolean(restore)}
        onClose={() => setRestore(null)}
        onConfirm={doRestore}
        busy={busy}
        title={`Restaurar a versão ${restore?.number}?`}
        message={
          <>
            O rascunho volta a ficar igual à versão {restore?.number} ({restore?.summary}). Nada se perde: a versão atual continua no histórico.
            {calendar.publishedVersion ? ' O que está publicado só muda depois de uma nova publicação.' : ''}
          </>
        }
        confirmLabel="Restaurar"
      />
    </div>
  );
}
