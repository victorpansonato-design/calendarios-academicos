import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CalendarSummary, Cohort, ISODate, PublicCalendar, PublicCalendarEvent, Shift, StudentView } from '@calendarios/core';
import { buildStudentView, eventsToIcs, icsFileName, instantToWall, planFavoriteReminders, todayIn, wallTimeToInstant } from '@calendarios/core';
import { api, type StudentReminder } from './api';

/* ==========================================================================
   Prévia da visão do aluno (Portal e App)
   --------------------------------------------------------------------------
   As duas prévias usam a MESMA lógica do núcleo (buildStudentView) que a API
   entrega ao portal e ao app — o que a equipe vê aqui é o que o aluno verá.

   Estrelas e "ocultar":
     · na demonstração, com a versão publicada e a data de hoje, gravam de
       verdade (aparecem na Agenda como "Lembrete de favorito");
     · fora disso (rascunho, data simulada, sistema real sem a chave do
       portal), ficam só nesta tela — a prévia mostra o que seria agendado.
   ========================================================================== */

export type PreviewSource = 'draft' | 'published';

export interface Persona {
  cohort: Cohort | null;
  shift: Shift | null;
}

/** Aluno fictício das prévias. */
export const PREVIEW_STUDENT = 'previa-equipe';

export interface StarFeedback {
  starred: boolean;
  /** Texto curto para a confirmação na tela. */
  note: string;
  /** O push que o aluno vai receber, quando há lembrete agendado. */
  push: { title: string; body: string; when: string } | null;
}

function whenLabel(sendAt: string): string {
  const w = instantToWall(sendAt);
  return `${w.date.slice(8, 10)}/${w.date.slice(5, 7)} às ${w.time.replace(':', 'h')}`;
}

export function useStudentPreview(initialCalendarId?: string | null) {
  const realToday = todayIn(new Date());
  const [calendars, setCalendars] = useState<CalendarSummary[] | null>(null);
  const [calendarId, setCalendarId] = useState<string | null>(initialCalendarId ?? null);
  const [source, setSource] = useState<PreviewSource>('published');
  const [persona, setPersona] = useState<Persona>({ cohort: null, shift: null });
  const [today, setToday] = useState<ISODate>(realToday);
  const [cal, setCal] = useState<PublicCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [reminders, setReminders] = useState<StudentReminder[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // calendários que podem ser vistos (fora do ar não aparecem para o aluno)
  useEffect(() => {
    api.calendars
      .list()
      .then(({ items }) => {
        const live = items.filter((c) => c.status !== 'archived');
        setCalendars(live);
        setCalendarId((cur) => (cur && live.some((c) => c.id === cur) ? cur : (live[0]?.id ?? null)));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const summary = calendars?.find((c) => c.id === calendarId) ?? null;
  const hasPublished = Boolean(summary?.publishedVersion);
  const effectiveSource: PreviewSource = source === 'published' && !hasPublished ? 'draft' : source;
  const persists = api.student.persists && effectiveSource === 'published' && today === realToday;

  const load = useCallback(async () => {
    if (!calendarId || !calendars) return;
    setLoading(true);
    setError(null);
    try {
      const pub = await api.calendars.studentPreview(calendarId, effectiveSource);
      setCal(pub);
      if (persists) {
        const m = await api.student.marks(PREVIEW_STUDENT, calendarId);
        setStarred(new Set(m.starred));
        setHidden(new Set(m.hidden));
        setReminders(m.reminders);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [calendarId, calendars, effectiveSource, persists]);

  useEffect(() => {
    void load();
  }, [load]);

  // trocar de calendário zera filtros e marcações locais
  useEffect(() => {
    setCategory(null);
    setQuery('');
    if (!persists) {
      setStarred(new Set());
      setHidden(new Set());
      setReminders([]);
    }
  }, [calendarId, persists]);

  const view: StudentView | null = useMemo(
    () => (cal ? buildStudentView(cal, { today, cohort: persona.cohort, shift: persona.shift, starred: [...starred], hidden: [...hidden], category, query }) : null),
    [cal, today, persona, starred, hidden, category, query],
  );
  /** A mesma visão sem filtros — para contadores e "próxima data", que não mudam com a busca. */
  const fullView: StudentView | null = useMemo(
    () => (cal ? buildStudentView(cal, { today, cohort: persona.cohort, shift: persona.shift, starred: [...starred], hidden: [...hidden] }) : null),
    [cal, today, persona, starred, hidden],
  );

  const eventOf = (uid: string) => cal?.events.find((e) => e.uid === uid) ?? null;

  /** O "agora" das prévias: o relógio real, ou o começo do dia simulado. */
  const now = () => (today === realToday ? new Date() : new Date(wallTimeToInstant(today, '08:00')));

  function plannedPush(ev: PublicCalendarEvent) {
    if (!cal) return null;
    const [first] = planFavoriteReminders(ev, { calendarId: cal.id, calendarTitle: cal.title, now: now(), studentId: PREVIEW_STUDENT });
    return first ? { title: first.title, body: first.body, when: whenLabel(first.sendAt) } : null;
  }

  async function toggleStar(uid: string): Promise<StarFeedback> {
    const ev = eventOf(uid);
    if (!ev || !cal) throw new Error('Evento não encontrado.');
    const isStarred = starred.has(uid);
    const before = fullView?.items.find((i) => i.uid === uid);
    if (persists) {
      if (isStarred) await api.student.unstar(PREVIEW_STUDENT, cal.id, uid);
      else await api.student.star(PREVIEW_STUDENT, cal.id, uid);
      const m = await api.student.marks(PREVIEW_STUDENT, cal.id);
      setStarred(new Set(m.starred));
      setHidden(new Set(m.hidden));
      setReminders(m.reminders);
    } else {
      setStarred((s) => toggled(s, uid, !isStarred));
      if (!isStarred) setHidden((s) => toggled(s, uid, false));
    }
    if (isStarred) return { starred: false, note: before?.why === 'starred' ? 'Removido dos seus importantes.' : 'Removido dos favoritos.', push: null };
    const lead = before?.inImportantes ? 'Marcado como favorito.' : 'Adicionado aos seus importantes.';
    if (ev.calendarReminder.enabled)
      return { starred: true, note: `${lead} Você já recebe o aviso deste evento (${ev.calendarReminder.labels.join(', ').toLowerCase()}).`, push: null };
    const push = plannedPush(ev);
    if (push) return { starred: true, note: `${lead} Lembrete em ${push.when}.`, push };
    return { starred: true, note: `${lead} ${before?.status === 'ongoing' ? 'Já está acontecendo, então não há lembrete a agendar.' : 'O horário do lembrete já passou.'}`, push: null };
  }

  async function toggleHide(uid: string): Promise<string> {
    if (!cal) return '';
    const isHidden = hidden.has(uid);
    if (persists) {
      if (isHidden) await api.student.unhide(PREVIEW_STUDENT, cal.id, uid);
      else await api.student.hide(PREVIEW_STUDENT, cal.id, uid);
      const m = await api.student.marks(PREVIEW_STUDENT, cal.id);
      setStarred(new Set(m.starred));
      setHidden(new Set(m.hidden));
      setReminders(m.reminders);
    } else {
      setHidden((s) => toggled(s, uid, !isHidden));
      if (!isHidden) setStarred((s) => toggled(s, uid, false));
    }
    return isHidden ? 'De volta aos seus importantes.' : 'Ocultado dos seus importantes. Continua no calendário completo.';
  }

  /** Baixa o .ics de um evento ou de vários ("todos os meus importantes"). */
  function downloadIcs(uids: string[], name: string) {
    if (!cal) return;
    const set = new Set(uids);
    const body = eventsToIcs(cal, cal.events.filter((e) => set.has(e.uid)), { now: new Date(), shift: persona.shift });
    const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFileName(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    calendars,
    summary,
    calendarId,
    setCalendarId,
    source: effectiveSource,
    hasPublished,
    setSource,
    persona,
    setPersona,
    today,
    realToday,
    setToday,
    cal,
    view,
    fullView,
    loading,
    error,
    reload: load,
    persists,
    starred,
    hidden,
    reminders,
    category,
    setCategory,
    query,
    setQuery,
    toggleStar,
    toggleHide,
    downloadIcs,
  };
}

export type StudentPreviewState = ReturnType<typeof useStudentPreview>;

function toggled(s: Set<string>, uid: string, on: boolean): Set<string> {
  const next = new Set(s);
  if (on) next.add(uid);
  else next.delete(uid);
  return next;
}
