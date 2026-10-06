import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, EyeOff, FileText, GraduationCap, RotateCcw, Upload } from 'lucide-react';
import type { CalendarEvent, ISODate } from '@calendarios/core';
import { Button } from '../../components/ui/button';
import { Callout, Card, EmptyState, PageHeader, Skeleton, Tabs } from '../../components/ui/Surfaces';
import { Confirm } from '../../components/ui/Overlay';
import { Pill } from '../../components/ui/Badges';
import { EventEditor } from '../../components/calendar/EventEditor';
import { DayDrawer } from '../../components/calendar/DayDrawer';
import { useToast } from '../../components/ui/Toast';
import { api, pdfUrl, type CalendarDetail } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';
import { indexByDay } from '../../lib/calendarGrid';
import { CALENDAR_STATUS, COHORT_LABEL } from '../../lib/labels';
import { SemesterTab } from './SemesterTab';
import { MonthTab } from './MonthTab';
import { EventsTab } from './EventsTab';
import { GeneralTab } from './GeneralTab';
import { PublishDialog } from './PublishDialog';

/* ==========================================================================
   Um calendário
   --------------------------------------------------------------------------
   Quatro abas — Calendário, Mês a mês, Eventos, Informações — e uma ação
   principal só:
     Em preparação → "Publicar" (mostra o que acontece com os avisos antes)
     Publicado com alterações → "Publicar alterações"
     Fora do ar → "Colocar no ar de novo"
   ========================================================================== */

export type TabId = 'calendario' | 'mes' | 'eventos' | 'informacoes';

export interface DetailContext {
  detail: CalendarDetail;
  apply: (d: CalendarDetail, message?: string) => void;
  editEvent: (e: CalendarEvent | null, newDate?: ISODate | null) => void;
  openDay: (d: ISODate) => void;
  reload: () => void;
}

const TABS: { value: TabId; label: string }[] = [
  { value: 'calendario', label: 'Calendário' },
  { value: 'mes', label: 'Mês a mês' },
  { value: 'eventos', label: 'Eventos' },
  { value: 'informacoes', label: 'Informações' },
];

export function CalendarDetailView({ id, tab, focusEventId }: { id: string; tab: string | null; focusEventId: string | null }) {
  const toast = useToast();
  const res = useResource(() => api.calendars.get(id), [id]);
  const [editor, setEditor] = useState<{ event: CalendarEvent | null; newDate: ISODate | null } | null>(null);
  const [day, setDay] = useState<ISODate | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  const detail = res.data;
  const index = useMemo(() => indexByDay(detail?.events ?? []), [detail]);
  const current: TabId = TABS.some((t) => t.value === tab) ? (tab as TabId) : 'calendario';

  // ?evento=… abre direto no editor
  useEffect(() => {
    if (!detail || !focusEventId) return;
    const ev = detail.events.find((e) => e.id === focusEventId);
    if (ev) setEditor({ event: ev, newDate: null });
  }, [detail, focusEventId]);

  if (res.loading && !detail)
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (res.error || !detail)
    return (
      <Card>
        <EmptyState
          title="Não foi possível abrir este calendário"
          message={res.error?.message}
          action={
            <Button onClick={() => navigate(paths.calendars())} icon={<ArrowLeft className="h-4 w-4" />}>
              Voltar para Calendários
            </Button>
          }
        />
      </Card>
    );

  const { calendar } = detail;
  const st = CALENDAR_STATUS[calendar.status];
  const live = calendar.publishedVersion !== null && calendar.status !== 'archived';
  const pendingChanges = live && calendar.status !== 'published';

  const apply = (d: CalendarDetail, message?: string) => {
    res.setData(d);
    if (message) toast.ok(message);
  };

  const ctx: DetailContext = {
    detail,
    apply,
    editEvent: (e, newDate = null) => setEditor({ event: e, newDate }),
    openDay: setDay,
    reload: () => void res.reload(),
  };

  const run = async (fn: () => Promise<CalendarDetail>, message: string) => {
    setBusy(true);
    try {
      apply(await fn(), message);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  };

  const tags = [
    calendar.year ? `${calendar.year} · ${calendar.semester ?? '?'}º semestre` : 'Período a definir',
    calendar.scope.modality || 'Modalidade a definir',
    ...calendar.scope.cohorts.map((c) => COHORT_LABEL[c]),
    ...(calendar.scope.exceptions.length ? [`Exceto ${calendar.scope.exceptions.join(', ')}`] : []),
  ];

  let primary = null;
  if (calendar.status === 'draft' || calendar.status === 'in_review')
    primary = (
      <Button variant="primary" size="md" icon={<Upload className="h-4 w-4" />} onClick={() => setPublishing(true)}>
        {pendingChanges ? 'Publicar alterações' : 'Publicar'}
      </Button>
    );
  if (calendar.status === 'archived')
    primary = (
      <Button variant="primary" size="md" icon={<RotateCcw className="h-4 w-4" />} onClick={() => run(() => api.calendars.unarchive(id), 'Calendário reativado. Publique para voltar ao ar.')} disabled={busy}>
        Colocar no ar de novo
      </Button>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <a href={paths.calendars()} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Calendários
          </a>
        }
        title={calendar.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Pill tone={st.tone} solid>
              {pendingChanges ? 'Publicado · com alterações não publicadas' : st.label}
            </Pill>
            {tags.map((t) => (
              <Pill key={t} dot={false}>
                {t}
              </Pill>
            ))}
          </span>
        }
        actions={
          <>
            {calendar.sourceFileId && (
              <a href={pdfUrl(calendar.sourceFileId)} target="_blank" rel="noopener noreferrer">
                <Button icon={<FileText className="h-4 w-4" />} tabIndex={-1}>
                  Ver PDF original
                </Button>
              </a>
            )}
            <Button icon={<GraduationCap className="h-4 w-4" />} onClick={() => navigate(paths.studentPortal(calendar.id))}>
              Ver como aluno
            </Button>
            {live && (
              <Button variant="ghost" icon={<EyeOff className="h-4 w-4" />} onClick={() => setConfirmArchive(true)} disabled={busy}>
                Tirar do ar
              </Button>
            )}
            {primary}
          </>
        }
      >
        {pendingChanges && (
          <Callout tone="info" title="Suas alterações ainda não estão no ar">
            Os alunos continuam vendo a versão anterior. Quando terminar, clique em "Publicar alterações".
          </Callout>
        )}
        {calendar.status === 'archived' && (
          <Callout tone="warn" title="Este calendário está fora do ar">
            Os alunos não o veem e nenhum aviso dele será enviado.
          </Callout>
        )}
        <Tabs<TabId> layoutId={`calendar-tabs-${id}`} tabs={TABS} value={current} onChange={(t) => navigate(paths.calendar(id, t))} />
      </PageHeader>

      {current === 'calendario' && <SemesterTab ctx={ctx} index={index} />}
      {current === 'mes' && <MonthTab ctx={ctx} index={index} />}
      {current === 'eventos' && <EventsTab ctx={ctx} />}
      {current === 'informacoes' && <GeneralTab ctx={ctx} />}

      <EventEditor
        open={Boolean(editor)}
        onClose={() => {
          setEditor(null);
          if (focusEventId) navigate(paths.calendar(id, current));
        }}
        calendar={calendar}
        event={editor?.event ?? null}
        newDate={editor?.newDate}
        onSaved={apply}
      />
      <DayDrawer
        calendar={calendar}
        date={day}
        events={day ? index.get(day) ?? [] : []}
        onClose={() => setDay(null)}
        onEdit={(e) => {
          setDay(null);
          setEditor({ event: e, newDate: null });
        }}
        onCreate={(d) => {
          setDay(null);
          setEditor({ event: null, newDate: d });
        }}
      />
      <PublishDialog
        open={publishing}
        onClose={() => setPublishing(false)}
        detail={detail}
        onPublished={(d) => apply(d, 'Calendário publicado.')}
        onOpenEvent={(eventId) => {
          setPublishing(false);
          const ev = detail.events.find((e) => e.id === eventId);
          if (ev) setEditor({ event: ev, newDate: null });
        }}
      />
      <Confirm
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => run(() => api.calendars.archive(id), 'Calendário tirado do ar.')}
        busy={busy}
        title="Tirar este calendário do ar?"
        tone="danger"
        message="Os alunos deixam de ver este calendário e nenhum aviso dele será enviado. Nada é apagado: dá para colocar no ar de novo depois."
        confirmLabel="Tirar do ar"
      />
    </div>
  );
}
