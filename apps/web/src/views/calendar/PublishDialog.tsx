import { useEffect, useState } from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import type { PublishCheck, ReminderDiff, StudentImpact } from '@calendarios/core';
import { planEventReminders, reminderBlockReason } from '@calendarios/core';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/button';
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
  const [preview, setPreview] = useState<{ publishCheck: PublishCheck; diff: ReminderDiff; studentImpact?: StudentImpact } | null>(null);
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
  const impact = preview?.studentImpact;
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
      <div className="space-y-4 px-5 py-5 text-[13px] leading-relaxed text-foreground/80">
        {!preview && <Skeleton className="h-24 w-full" />}

        {preview && blockers.length > 0 && (
          <>
            <Callout tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title={`Falta ajustar ${plural(blockers.length, 'item', 'itens')} antes de publicar`}>
              São pontos que poderiam levar informação errada aos alunos.
            </Callout>
            <ul className="divide-y divide-border">
              {blockers.map((b, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    {b.eventTitle && <p className="font-medium text-foreground">{b.eventTitle}</p>}
                    <p className="text-[12px] text-muted-foreground">{b.issue.message}</p>
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
            <ul className="space-y-1.5 rounded-lg border border-border bg-surface p-3.5">
              <li>
                {diff.create.length + diff.update.length === 0 ? (
                  <strong className="text-foreground">Nenhum aviso será enviado.</strong>
                ) : (
                  <>
                    <strong className="text-foreground">{plural(diff.create.length + diff.update.length, 'aviso será enviado', 'avisos serão enviados')}</strong> aos alunos nas datas certas
                    {diff.create[0] ? ` — o primeiro em ${when(diff.create[0].sendAt)}.` : '.'}
                  </>
                )}
              </li>
              {diff.cancel.length > 0 && <li>{plural(diff.cancel.length, 'aviso agendado antes deixa', 'avisos agendados antes deixam')} de ser enviado(s), porque o evento mudou.</li>}
              {past.length > 0 && <li>{plural(past.length, 'evento já passou', 'eventos já passaram')} da data de aviso ({past.map((e) => e.title).join(', ')}) e não {past.length === 1 ? 'gera' : 'geram'} aviso atrasado.</li>}
            </ul>
            {impact && (
              <>
                <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Para os alunos</p>
                <ul className="space-y-1.5 rounded-lg border border-border bg-surface p-3.5">
                  <li>
                    <strong className="text-foreground">{plural(impact.importantes, 'data entra', 'datas entram')}</strong> sozinha(s) no calendário "Importantes" do aluno (importância Alta e Média).
                  </li>
                  {impact.unset > 0 && <li>{plural(impact.unset, 'evento está', 'eventos estão')} sem importância — para o aluno contam como Baixa e ficam só no calendário completo.</li>}
                  {impact.withoutLegend > 0 && <li>{plural(impact.withoutLegend, 'evento não tem', 'eventos não têm')} cor da legenda — no portal e no app aparecem em cinza.</li>}
                  {impact.favorites.create + impact.favorites.update + impact.favorites.cancel > 0 && (
                    <li>
                      Lembretes de quem marcou com ★ ({plural(impact.favorites.students, 'aluno', 'alunos')}): {impact.favorites.create} novo(s), {impact.favorites.update} remarcado(s), {impact.favorites.cancel} cancelado(s).
                    </li>
                  )}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
