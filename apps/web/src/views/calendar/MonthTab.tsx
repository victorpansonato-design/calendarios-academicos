import { useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState } from '../../components/ui/Surfaces';
import { MonthCard } from '../../components/calendar/MonthCard';
import { EventDocument, EventFields, EventMeta } from '../../components/calendar/EventSummary';
import { calendarMonths, eventsInMonth, todayISO, type DayIndex } from '../../lib/calendarGrid';
import { datesText, monthName } from '../../lib/format';
import { useLocalPref } from '../../lib/hooks';
import type { DetailContext } from './CalendarDetailView';

/* Mês a mês, como as páginas mensais do PDF: a grade do mês e, ao lado, a
   relação data ↔ descrição completa. Um período que passa pelo mês aparece
   em todos os meses que ocupa — é o mesmo evento, não uma cópia. */

export function MonthTab({ ctx, index }: { ctx: DetailContext; index: DayIndex }) {
  const { calendar, events } = ctx.detail;
  const months = calendarMonths(calendar.year, calendar.semester, events);
  const [pos, setPos] = useLocalPref(`month-${calendar.id}`, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const i = Math.min(Math.max(0, pos), months.length - 1);
  const m = months[i];
  if (!m) return null;
  const list = eventsInMonth(events, m.year, m.month);
  const shown = selected ? list.filter((e) => index.get(selected)?.includes(e)) : list;
  const editable = calendar.status !== 'archived';

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="self-start lg:sticky lg:top-24">
        <div className="mb-3 flex items-center justify-between">
          <Button size="sm" variant="ghost" square aria-label="Mês anterior" disabled={i === 0} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => (setPos(i - 1), setSelected(null))} />
          <span className="text-[13px] font-semibold text-ink">
            {monthName(m.month)} / <span className="font-mono">{m.year}</span>
          </span>
          <Button size="sm" variant="ghost" square aria-label="Próximo mês" disabled={i === months.length - 1} icon={<ChevronRight className="h-4 w-4" />} onClick={() => (setPos(i + 1), setSelected(null))} />
        </div>
        <div data-grid="mes">
          <MonthCard gridId="mes" year={m.year} month={m.month} index={index} legend={calendar.legend} today={todayISO()} selected={selected} size="sm" onSelectDay={(d) => setSelected(selected === d ? null : d)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {months.map((mm, j) => (
            <button
              key={`${mm.year}-${mm.month}`}
              type="button"
              onClick={() => (setPos(j), setSelected(null))}
              aria-current={j === i ? 'true' : undefined}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${j === i ? 'bg-ink text-canvas' : 'bg-surface-2 text-ink-3 hover:bg-surface-3 hover:text-ink'}`}
            >
              {monthName(mm.month).slice(0, 3)}
            </button>
          ))}
        </div>
        {selected && (
          <p className="mt-3 text-[12px] text-ink-3">
            Mostrando só o dia {selected.slice(8)}.{' '}
            <button type="button" className="font-medium text-ink-2 underline" onClick={() => setSelected(null)}>
              Ver o mês inteiro
            </button>
          </p>
        )}
      </Card>

      <Card padded={false}>
        {shown.length === 0 ? (
          <EmptyState compact title="Nenhum evento neste período" />
        ) : (
          <ul className="divide-y divide-hairline">
            {shown.map((e) => (
              <li key={e.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[132px_minmax(0,1fr)]">
                <div>
                  <span className="inline-block rounded-md bg-surface-2 px-2.5 py-1.5 font-mono text-[12.5px] font-semibold text-ink">{datesText(e.dates, e.datesResolved)}</span>
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[14px] leading-snug font-semibold text-ink">{e.title}</h3>
                    {editable && (
                      <Button size="xs" variant="ghost" icon={<Pencil className="h-3 w-3" />} onClick={() => ctx.editEvent(e)}>
                        Editar
                      </Button>
                    )}
                  </div>
                  <EventMeta event={e} legend={calendar.legend} />
                  {e.description && e.description !== e.title ? <EventDocument event={e} /> : <EventFields event={e} compact />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
