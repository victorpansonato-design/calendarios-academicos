import { useEffect, useState } from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import type { PublishCheck, ReminderDiff } from '@calendarios/core';
import { planEventReminders, reminderBlockReason } from '@calendarios/core';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Callout, Skeleton } from '../../components/ui/Surfaces';
import { api, type CalendarDetail } from '../../lib/api';
import { plural, when } from '../../lib/format';
import { useToast } from '../../components/ui/Toast';

/* Publicar: o que os alunos vão receber, em frases simples, e um botão.
   Se algo impede, cada item leva direto ao evento que precisa de ajuste. */

export function PublishDialog({
  open,
  onClose,
  detail,
  onPublished,
  onOpenEvent,
}: {
  open: boolean;
  onClose: () => void;
  detail: CalendarDetail;
  onPublished: (d: CalendarDetail) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const toast = useToast();
  const [preview, setPreview] = useState<{ publishCheck: PublishCheck; diff: ReminderDiff } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = detail.calendar.id;

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    api.calendars.publishPreview(id).then(setPreview).catch((e) => toast.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  const publish = async () => {
    setBusy(true);
    try {
      onPublished(await api.calendars.publish(id));
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const blockers = preview?.publishCheck.blockers ?? [];
  const diff = preview?.diff;
  const unset = detail.events.filter((e) => e.importance === 'unset').length;
  const past = detail.events.filter((e) => reminderBlockReason(e) === null && planEventReminders(e, { calendarId: id, calendarTitle: detail.calendar.title, now: new Date() }).length === 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publicar calendário"
      subtitle={detail.calendar.title}
      icon={<Upload className="h-4 w-4" />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={publish} disabled={!preview || blockers.length > 0 || busy} data-autofocus>
            {busy ? 'Publicando…' : 'Publicar agora'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-5 text-[13px] leading-relaxed text-ink-2">
        {!preview && <Skeleton className="h-24 w-full" />}

        {preview && blockers.length > 0 && (
          <>
            <Callout tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title={`Falta ajustar ${plural(blockers.length, 'item', 'itens')} antes de publicar`}>
              São pontos que poderiam levar informação errada aos alunos.
            </Callout>
            <ul className="divide-y divide-hairline">
              {blockers.map((b, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    {b.eventTitle && <p className="font-medium text-ink">{b.eventTitle}</p>}
                    <p className="text-[12px] text-ink-3">{b.issue.message}</p>
                  </div>
                  {b.eventId && (
                    <Button size="xs" onClick={() => onOpenEvent(b.eventId!)}>
                      Ajustar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {preview && blockers.length === 0 && diff && (
          <>
            <p>Depois de publicar, este é o calendário que os alunos veem no portal e no app.</p>
            <ul className="space-y-1.5 rounded-lg bg-surface-2 p-3.5">
              <li>
                {diff.create.length + diff.update.length === 0 ? (
                  <strong className="text-ink">Nenhum aviso será enviado.</strong>
                ) : (
                  <>
                    <strong className="text-ink">{plural(diff.create.length + diff.update.length, 'aviso será enviado', 'avisos serão enviados')}</strong> aos alunos nas datas certas
                    {diff.create[0] ? ` — o primeiro em ${when(diff.create[0].sendAt)}.` : '.'}
                  </>
                )}
              </li>
              {diff.cancel.length > 0 && <li>{plural(diff.cancel.length, 'aviso agendado antes deixa', 'avisos agendados antes deixam')} de ser enviado(s), porque o evento mudou.</li>}
              {unset > 0 && <li>{plural(unset, 'evento está', 'eventos estão')} sem aviso escolhido — esses não geram aviso.</li>}
              {past.length > 0 && <li>{plural(past.length, 'evento já passou', 'eventos já passaram')} da data de aviso ({past.map((e) => e.title).join(', ')}) e não {past.length === 1 ? 'gera' : 'geram'} aviso atrasado.</li>}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
