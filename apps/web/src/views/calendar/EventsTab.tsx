import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, X } from 'lucide-react';
import type { CalendarEvent } from '@calendarios/core';
import { REMINDER_MOMENTS, momentLabel, normalizeForCompare, openEventIssues } from '@calendarios/core';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState } from '../../components/ui/Surfaces';
import { Chip, Field, SearchInput, TextInput } from '../../components/ui/Fields';
import { Pill } from '../../components/ui/Badges';
import { Swatch } from '../../components/calendar/Legend';
import { EventDateLabel } from '../../components/calendar/EventSummary';
import { Confirm, Modal } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { reminderSummary } from '../../lib/labels';
import { plural } from '../../lib/format';
import { collapseVariants } from '../../lib/motion';
import type { DetailContext } from './CalendarDetailView';

/* ==========================================================================
   Eventos
   --------------------------------------------------------------------------
   A lista para editar rápido. Marque vários e escolha o aviso de uma vez —
   é o jeito mais curto de preparar um calendário novo.
   ========================================================================== */

type Filter = 'unset' | 'no' | 'yes' | 'missing';

const FILTERS: { value: Filter; label: string; test: (e: CalendarEvent) => boolean }[] = [
  { value: 'unset', label: 'Não escolhido', test: (e) => e.importance === 'unset' },
  { value: 'no', label: 'Não avisar', test: (e) => reminderSummary(e).text === 'Não avisar' },
  { value: 'yes', label: 'Avisa', test: (e) => reminderSummary(e).tone === 'info' },
  { value: 'missing', label: 'Falta o horário', test: (e) => reminderSummary(e).tone === 'crit' },
];

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
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(filter === f.value ? null : f.value)} count={count(f)}>
              {f.label}
            </Chip>
          ))}
        </div>
        {editable && (
          <Button className="lg:ml-auto" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => ctx.editEvent(null)}>
            Novo evento
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {sel.size > 0 && editable && (
          <motion.div variants={collapseVariants} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-3 px-4 py-3">
              <span className="mr-1 text-[13px] font-semibold text-ink">{plural(sel.size, 'selecionado', 'selecionados')} — avisar os alunos?</span>
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
            <div className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 text-[12px] font-medium text-ink-3">
              {editable && (
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  className="h-4 w-4 accent-[var(--brand)]"
                  checked={allSelected}
                  onChange={() => setSel(allSelected ? new Set() : new Set(filtered.map((e) => e.id)))}
                />
              )}
              <span className="w-32 shrink-0">Data</span>
              <span className="flex-1">Evento</span>
              <span className="hidden w-56 md:block">Aviso</span>
            </div>
            <ul className="divide-y divide-hairline">
              {filtered.map((e) => {
                const legend = calendar.legend.find((l) => l.key === e.category);
                const needsFix = openEventIssues(e).some((i) => i.severity === 'blocker');
                const rs = reminderSummary(e);
                return (
                  <li key={e.id} className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover ${sel.has(e.id) ? 'bg-surface-2' : ''}`}>
                    {editable && <input type="checkbox" aria-label={`Selecionar ${e.title}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={sel.has(e.id)} onChange={() => toggleSel(e.id)} />}
                    <button type="button" onClick={() => ctx.editEvent(e)} className="flex min-w-0 flex-1 flex-col gap-1 text-left md:flex-row md:items-start md:gap-3">
                      <span className="w-32 shrink-0">
                        <EventDateLabel event={e} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {legend && <Swatch entry={legend} size={10} />}
                          <span className="truncate text-[13px] font-medium text-ink">{e.title || 'Sem título'}</span>
                        </span>
                        {needsFix && <span className="mt-0.5 block text-[12px] text-warn-ink">Precisa de ajuste — clique para ver</span>}
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
            <p className="text-[12px] font-medium text-ink">
              Quando? <span className="font-normal text-ink-3">Pode marcar mais de um.</span>
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
            <p className="text-[12px] leading-relaxed text-ink-3">
              Nos períodos, o aviso sai antes do começo — ou antes do fim, quando é prazo. Dá para mudar abrindo o evento.
            </p>
          )}
          {(!days.length || !time) && <p className="text-[12px] text-ink-4">Marque pelo menos um momento e informe o horário.</p>}
        </div>
      </Modal>
    </div>
  );
}
