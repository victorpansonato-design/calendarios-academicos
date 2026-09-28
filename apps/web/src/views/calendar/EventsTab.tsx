import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, X } from 'lucide-react';
import type { Importance } from '@calendarios/core';
import { normalizeForCompare, openEventIssues } from '@calendarios/core';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState } from '../../components/ui/Surfaces';
import { Chip, SearchInput } from '../../components/ui/Fields';
import { Pill } from '../../components/ui/Badges';
import { Swatch } from '../../components/calendar/Legend';
import { EventDateLabel } from '../../components/calendar/EventSummary';
import { Confirm } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { IMPORTANCE } from '../../lib/labels';
import { plural } from '../../lib/format';
import { collapseVariants } from '../../lib/motion';
import type { DetailContext } from './CalendarDetailView';

/* ==========================================================================
   Eventos
   --------------------------------------------------------------------------
   A lista para editar rápido. Marque vários e escolha o aviso de uma vez —
   é o jeito mais curto de preparar um calendário novo.
   ========================================================================== */

const CHOICES: Importance[] = ['low', 'medium', 'high'];

export function EventsTab({ ctx }: { ctx: DetailContext }) {
  const toast = useToast();
  const { calendar, events } = ctx.detail;
  const [q, setQ] = useState('');
  const [imp, setImp] = useState<Importance | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<Importance | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = calendar.status !== 'archived';

  const filtered = useMemo(
    () =>
      [...events]
        .sort((a, b) => (a.dates.start || '9').localeCompare(b.dates.start || '9') || a.sortOrder - b.sortOrder)
        .filter((e) => (!imp || e.importance === imp) && (!q || normalizeForCompare(`${e.title} ${e.description} ${e.dates.label}`).includes(normalizeForCompare(q)))),
    [events, imp, q],
  );

  const toggleSel = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSel(next);
  };
  const allSelected = filtered.length > 0 && filtered.every((e) => sel.has(e.id));

  const applyBulk = async () => {
    if (!bulk) return;
    setBusy(true);
    try {
      const res = await api.calendars.bulkImportance(calendar.id, [...sel], bulk);
      ctx.apply(res, `Pronto: ${plural(res.changed, 'evento ficou', 'eventos ficaram')} com "${bulk === 'low' ? 'Não avisar' : IMPORTANCE[bulk].label}".`);
      setSel(new Set());
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      setBulk(null);
    }
  };

  const count = (v: Importance) => events.filter((e) => e.importance === v).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onValueChange={setQ} placeholder="Procurar evento…" className="lg:w-72" />
        <div className="flex flex-wrap gap-2">
          {(['unset', ...CHOICES] as Importance[]).map((v) => (
            <Chip key={v} active={imp === v} onClick={() => setImp(imp === v ? null : v)} count={count(v)}>
              {IMPORTANCE[v].short}
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
              {CHOICES.map((v) => (
                <Button key={v} size="sm" onClick={() => setBulk(v)}>
                  {v === 'low' ? 'Não avisar' : IMPORTANCE[v].short}
                </Button>
              ))}
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
              <span className="hidden w-44 md:block">Aviso</span>
            </div>
            <ul className="divide-y divide-hairline">
              {filtered.map((e) => {
                const legend = calendar.legend.find((l) => l.key === e.category);
                const needsFix = openEventIssues(e).some((i) => i.severity === 'blocker');
                const im = IMPORTANCE[e.importance];
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
                      <span className="w-44 shrink-0">
                        <Pill tone={im.tone} solid={e.importance === 'unset'}>
                          {im.short}
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
        open={bulk !== null}
        onClose={() => setBulk(null)}
        onConfirm={applyBulk}
        busy={busy}
        title={bulk === 'low' ? 'Não avisar sobre estes eventos?' : `${bulk ? IMPORTANCE[bulk].label : ''}?`}
        message={
          <>
            Vale para {plural(sel.size, 'o evento selecionado', 'os eventos selecionados')}. {bulk ? IMPORTANCE[bulk].help : ''}
            {bulk && bulk !== 'low' && ' Nos períodos, o aviso sai antes do começo — ou antes do fim, quando é prazo. Dá para mudar abrindo o evento.'}
          </>
        }
        confirmLabel="Aplicar"
      />
    </div>
  );
}
