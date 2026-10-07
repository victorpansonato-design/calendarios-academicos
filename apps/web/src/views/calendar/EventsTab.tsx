import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CalendarPlus, Sparkles, X } from 'lucide-react';
import type { CalendarEvent, Importance } from '@calendarios/core';
import { IMPORTANCE_LABEL, REMINDER_MOMENTS, momentLabel, normalizeForCompare, openEventIssues } from '@calendarios/core';
import { Button } from '../../components/ui/button';
import { Card, EmptyState } from '../../components/ui/Surfaces';
import { Chip, Field, SearchInput, TextInput } from '../../components/ui/Fields';
import { Pill } from '../../components/ui/Badges';
import { Swatch } from '../../components/calendar/Legend';
import { EventDateLabel } from '../../components/calendar/EventSummary';
import { Confirm, Modal } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import { api, type ImportanceSuggestionRow } from '../../lib/api';
import { importanceTone, reminderSummary } from '../../lib/labels';
import { plural } from '../../lib/format';
import { collapseVariants } from '../../lib/motion';
import type { DetailContext } from './CalendarDetailView';

/* ==========================================================================
   Eventos
   --------------------------------------------------------------------------
   A lista para editar rápido. Marque vários e escolha, de uma vez, a
   importância (onde o aluno vê o evento) e o aviso (push para todos) — é o
   jeito mais curto de preparar um calendário novo. "Sugerir importância"
   preenche os que ainda não têm, com o motivo de cada sugestão.
   ========================================================================== */

type Filter = 'unset' | 'high' | 'medium' | 'low' | 'nocolor' | 'no' | 'yes' | 'missing';

const FILTERS: { value: Filter; label: string; group: 'importance' | 'reminder'; test: (e: CalendarEvent) => boolean }[] = [
  { value: 'unset', label: 'Sem importância', group: 'importance', test: (e) => e.importance === 'unset' },
  { value: 'high', label: 'Alta', group: 'importance', test: (e) => e.importance === 'high' },
  { value: 'medium', label: 'Média', group: 'importance', test: (e) => e.importance === 'medium' },
  { value: 'low', label: 'Baixa', group: 'importance', test: (e) => e.importance === 'low' },
  { value: 'nocolor', label: 'Sem cor', group: 'importance', test: (e) => !e.category && !e.color },
  { value: 'no', label: 'Não avisar', group: 'reminder', test: (e) => reminderSummary(e).text === 'Não avisar' },
  { value: 'yes', label: 'Avisa', group: 'reminder', test: (e) => reminderSummary(e).tone === 'info' },
  { value: 'missing', label: 'Falta o horário', group: 'reminder', test: (e) => reminderSummary(e).tone === 'crit' },
];

const LEVELS: Exclude<Importance, 'unset'>[] = ['high', 'medium', 'low'];

export function EventsTab({ ctx }: { ctx: DetailContext }) {
  const toast = useToast();
  const { calendar, events } = ctx.detail;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmNo, setConfirmNo] = useState(false);
  const [avisar, setAvisar] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<{ rows: ImportanceSuggestionRow[]; onlyUnset: boolean } | null>(null);
  const editable = calendar.status !== 'archived';

  const filtered = useMemo(
    () =>
      [...events]
        .sort((a, b) => (a.dates.start || '9').localeCompare(b.dates.start || '9') || a.sortOrder - b.sortOrder)
        .filter((e) => (!filter || FILTERS.find((f) => f.value === filter)!.test(e)) && (!q || normalizeForCompare(`${e.title} ${e.description} ${e.dates.label}`).includes(normalizeForCompare(q)))),
    [events, filter, q],
  );

  const toggleSel = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSel(next);
  };
  const allSelected = filtered.length > 0 && filtered.every((e) => sel.has(e.id));

  const applyBulk = async (d: number[], t: string | null) => {
    setBusy(true);
    try {
      const res = await api.calendars.bulkReminders(calendar.id, [...sel], d, t);
      const what = d.length ? `avisar ${d.map((x) => momentLabel(x).toLowerCase()).join(' e ')}, às ${t!.replace(':', 'h')}` : 'não avisar';
      ctx.apply(res, `Pronto: ${plural(res.changed, 'evento ficou', 'eventos ficaram')} com "${what}".`);
      setSel(new Set());
      setAvisar(false);
      setConfirmNo(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const applyImportance = async (importance: Exclude<Importance, 'unset'>) => {
    setBusy(true);
    try {
      const res = await api.calendars.bulkImportance(calendar.id, [...sel], importance);
      ctx.apply(res, `Pronto: ${plural(res.changed, 'evento ficou', 'eventos ficaram')} com importância ${IMPORTANCE_LABEL[importance].toLowerCase()}.`);
      setSel(new Set());
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const openSuggest = async (onlyUnset = true) => {
    try {
      const res = await api.calendars.suggestImportance(calendar.id, { onlyUnset });
      setSuggest({ rows: res.suggestions, onlyUnset });
    } catch (e) {
      toast.error(e);
    }
  };

  const applySuggest = async () => {
    if (!suggest) return;
    setBusy(true);
    try {
      const res = await api.calendars.suggestImportance(calendar.id, { apply: true, onlyUnset: suggest.onlyUnset });
      if (res.calendar && res.events && res.publishCheck) ctx.apply({ calendar: res.calendar, events: res.events, publishCheck: res.publishCheck }, `Importância sugerida aplicada a ${plural(res.changed, 'evento', 'eventos')}.`);
      setSuggest(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const openAvisar = () => {
    setDays([]);
    setTime('');
    setAvisar(true);
  };

  const count = (f: (typeof FILTERS)[number]) => events.filter(f.test).length;
  const hasRange = events.some((e) => sel.has(e.id) && e.dates.kind === 'range');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onValueChange={setQ} placeholder="Procurar evento…" className="lg:w-72" />
        {editable && (
          <div className="flex gap-2 lg:order-last lg:ml-auto">
            <Button icon={<Sparkles className="h-4 w-4" />} onClick={() => openSuggest(true)}>
              Sugerir importância
            </Button>
            <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => ctx.editEvent(null)}>
              Novo evento
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
        {(['importance', 'reminder'] as const).map((group) => (
          <div key={group} className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{group === 'importance' ? 'Importância' : 'Aviso'}</span>
            {FILTERS.filter((f) => f.group === group).map((f) => (
              <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(filter === f.value ? null : f.value)} count={count(f)}>
                {f.label}
              </Chip>
            ))}
          </div>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {sel.size > 0 && editable && (
          <motion.div variants={collapseVariants} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted-strong px-4 py-3">
              <span className="mr-1 text-[13px] font-semibold text-foreground">{plural(sel.size, 'selecionado', 'selecionados')}</span>
              <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Importância</span>
              {LEVELS.map((l) => (
                <Button key={l} size="sm" disabled={busy} onClick={() => applyImportance(l)}>
                  {IMPORTANCE_LABEL[l]}
                </Button>
              ))}
              <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
              <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Aviso</span>
              <Button size="sm" onClick={() => setConfirmNo(true)}>
                Não avisar
              </Button>
              <Button size="sm" onClick={openAvisar}>
                Avisar…
              </Button>
              <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} className="ml-auto" onClick={() => setSel(new Set())}>
                Limpar seleção
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card padded={false}>
        {filtered.length === 0 ? (
          <EmptyState compact title="Nenhum evento encontrado" message="Mude a busca ou o filtro." />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[12px] font-medium text-muted-foreground">
              {editable && (
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  className="h-4 w-4 accent-primary"
                  checked={allSelected}
                  onChange={() => setSel(allSelected ? new Set() : new Set(filtered.map((e) => e.id)))}
                />
              )}
              <span className="w-32 shrink-0">Data</span>
              <span className="flex-1">Evento</span>
              <span className="hidden w-28 md:block">Importância</span>
              <span className="hidden w-56 md:block">Aviso</span>
            </div>
            <ul className="divide-y divide-border">
              {filtered.map((e) => {
                const legend = calendar.legend.find((l) => l.key === e.category);
                const needsFix = openEventIssues(e).some((i) => i.severity === 'blocker');
                const rs = reminderSummary(e);
                return (
                  <li key={e.id} className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60 ${sel.has(e.id) ? 'bg-muted' : ''}`}>
                    {editable && <input type="checkbox" aria-label={`Selecionar ${e.title}`} className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={sel.has(e.id)} onChange={() => toggleSel(e.id)} />}
                    <button type="button" onClick={() => ctx.editEvent(e)} className="flex min-w-0 flex-1 flex-col gap-1 text-left md:flex-row md:items-start md:gap-3">
                      <span className="w-32 shrink-0">
                        <EventDateLabel event={e} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {legend && <Swatch entry={legend} size={10} />}
                          <span className="truncate text-[13px] font-medium text-foreground">{e.title || 'Sem título'}</span>
                          {!e.category && !e.color && (
                            <span className="shrink-0 text-[11px] text-muted-foreground" title="Sem cor da legenda: no portal e no app aparece em cinza">
                              · sem cor
                            </span>
                          )}
                        </span>
                        {needsFix && <span className="mt-0.5 block text-[12px] text-warning-foreground">Precisa de ajuste — clique para ver</span>}
                      </span>
                      <span className="w-28 shrink-0">
                        <Pill tone={importanceTone(e.importance)} solid={e.importance === 'high'}>
                          {e.importance === 'unset' ? 'Não definida' : IMPORTANCE_LABEL[e.importance]}
                        </Pill>
                      </span>
                      <span className="w-56 shrink-0">
                        <Pill tone={rs.tone} solid={rs.attention}>
                          {rs.text}
                        </Pill>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <Confirm
        open={confirmNo}
        onClose={() => setConfirmNo(false)}
        onConfirm={() => applyBulk([], null)}
        busy={busy}
        title="Não avisar sobre estes eventos?"
        message={`Vale para ${plural(sel.size, 'o evento selecionado', 'os eventos selecionados')}. Os alunos veem no calendário, mas não recebem aviso.`}
        confirmLabel="Aplicar"
      />

      <Modal
        open={suggest !== null}
        onClose={() => setSuggest(null)}
        title="Sugerir importância"
        subtitle="Pelas regras do calendário acadêmico: prova, último dia e inscrição em DP são Alta; feriados, inícios e prazos, Média; o resto, Baixa."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSuggest(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={applySuggest} disabled={busy || !suggest?.rows.length}>
              {busy ? 'Aplicando…' : `Aplicar em ${plural(suggest?.rows.length ?? 0, 'evento', 'eventos')}`}
            </Button>
          </>
        }
      >
        <div className="space-y-3 px-5 py-4">
          <label className="flex items-center gap-2 text-[13px] text-foreground/80">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={!suggest?.onlyUnset} onChange={(ev) => openSuggest(!ev.target.checked)} />
            Rever também os eventos que já têm importância
          </label>
          {suggest && !suggest.rows.length ? (
            <EmptyState compact title="Nada a sugerir" message="Todos os eventos já estão com a importância que as regras sugerem." />
          ) : (
            <ul className="scroll-slim max-h-[52vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {suggest?.rows.map((r) => (
                <li key={r.eventId} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="w-24 shrink-0 font-mono text-[12px] text-muted-foreground">{r.dateLabel}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">{r.title}</span>
                    <span className="block text-[12px] text-muted-foreground">{r.reason}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {r.from !== 'unset' && (
                      <>
                        <Pill tone={importanceTone(r.from)} dot={false}>
                          {IMPORTANCE_LABEL[r.from]}
                        </Pill>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      </>
                    )}
                    <Pill tone={importanceTone(r.to)} solid={r.to === 'high'}>
                      {IMPORTANCE_LABEL[r.to]}
                    </Pill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        open={avisar}
        onClose={() => setAvisar(false)}
        title="Avisar os alunos"
        subtitle={`Vale para ${plural(sel.size, 'o evento selecionado', 'os eventos selecionados')}.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAvisar(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => applyBulk(days, time)} disabled={busy || !days.length || !time}>
              {busy ? 'Aplicando…' : 'Aplicar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Quando? <span className="font-normal tracking-normal text-muted-foreground normal-case">Pode marcar mais de um.</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {REMINDER_MOMENTS.map((d) => (
                <Chip key={d} active={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>
                  {momentLabel(d)}
                </Chip>
              ))}
            </div>
          </div>
          <Field label="Horário do aviso" required help="Horário de Brasília. Vale para todos os avisos marcados.">
            {(id) => <TextInput id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="max-w-[160px]" />}
          </Field>
          {hasRange && (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Nos períodos, o aviso sai antes do começo — ou antes do fim, quando é prazo. Dá para mudar abrindo o evento.
            </p>
          )}
          {(!days.length || !time) && <p className="text-[12px] text-muted-foreground">Marque pelo menos um momento e informe o horário.</p>}
        </div>
      </Modal>
    </div>
  );
}
