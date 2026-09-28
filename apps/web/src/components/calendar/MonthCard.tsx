import type { CSSProperties, KeyboardEvent } from 'react';
import type { ISODate, LegendEntry } from '@calendarios/core';
import { addDays, fromISO } from '@calendarios/core';
import { dayColors, monthWeeks, pointEvents, type DayIndex } from '../../lib/calendarGrid';
import { monthName, plural, readableInk } from '../../lib/format';

/* ==========================================================================
   Cartão de mês
   --------------------------------------------------------------------------
   Reproduz a leitura da primeira página do PDF: dia pintado com a cor da
   legenda; um segundo evento colorido vira o triângulo no canto; e, além do
   PDF, um contador explícito quando o dia tem mais de um evento — cor nunca é
   o único canal.

   Cada dia é um botão. As setas andam pelos dias (inclusive de um mês para o
   outro), Enter abre o dia.
   ========================================================================== */

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

export function MonthCard({
  year,
  month,
  index,
  legend,
  gridId,
  today,
  selected,
  highlight,
  onSelectDay,
  size = 'md',
}: {
  year: number;
  month: number;
  index: DayIndex;
  legend: LegendEntry[];
  gridId: string;
  today?: ISODate;
  selected?: ISODate | null;
  /** Categoria em destaque (clique na legenda): as outras esmaecem. */
  highlight?: string | null;
  onSelectDay: (date: ISODate) => void;
  size?: 'md' | 'sm';
}) {
  const weeks = monthWeeks(year, month);
  const cellH = size === 'sm' ? 'h-8' : 'h-10';

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, date: ISODate) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = addDays(date, delta);
    const el = document.querySelector<HTMLButtonElement>(`[data-grid="${gridId}"] [data-date="${next}"]`);
    el?.focus();
  };

  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-center text-[13px] font-semibold text-ink">
        {monthName(month)}
        {size === 'sm' ? '' : <span className="ml-1.5 font-mono text-[11px] font-medium text-ink-4">{year}</span>}
      </h3>
      <div role="grid" aria-label={`${monthName(month)} de ${year}`} className="overflow-hidden rounded-lg bg-surface-2 p-1">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" className="py-1.5 text-center text-[10px] font-semibold text-ink-3">
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div role="row" key={i} className="grid grid-cols-7 gap-0.5 pb-0.5">
            {week.map((date, j) => {
              if (!date) return <div key={j} role="gridcell" className={cellH} />;
              const events = index.get(date) ?? [];
              const points = pointEvents(events);
              const colors = dayColors(events, legend);
              const fill = colors[0] ?? null;
              const corner = colors[1] ?? null;
              const dim = highlight && !events.some((e) => e.category === highlight);
              const style = {
                '--day-fill': fill && !dim ? fill : undefined,
                '--day-corner': corner && !dim ? corner : undefined,
                color: fill && !dim ? readableInk(fill) : undefined,
              } as CSSProperties;
              const isToday = today === date;
              const isSel = selected === date;
              const day = fromISO(date).day;
              const label = `${day} de ${monthName(month).toLowerCase()}: ${events.length ? plural(events.length, 'evento', 'eventos') : 'sem eventos'}`;
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  data-date={date}
                  aria-label={label}
                  aria-selected={isSel || undefined}
                  title={events.map((e) => e.title).join('\n') || undefined}
                  onClick={() => onSelectDay(date)}
                  onKeyDown={(e) => onKeyDown(e, date)}
                  style={style}
                  className={[
                    'day-cell relative flex items-center justify-center rounded-sm text-[12px] transition-colors',
                    cellH,
                    fill && !dim ? 'font-semibold' : points.length ? 'bg-surface font-semibold text-ink' : 'bg-surface text-ink-3 hover:bg-surface-hover',
                    dim ? 'opacity-35' : '',
                    isSel ? 'ring-2 ring-focus ring-offset-1 ring-offset-surface-2' : isToday ? 'ring-1 ring-ink-3' : '',
                  ].join(' ')}
                >
                  <span className="font-mono">{day}</span>
                  {points.length > 1 && (
                    <span aria-hidden="true" className="absolute right-0.5 bottom-0.5 rounded-xs bg-surface px-0.5 font-mono text-[9px] leading-[12px] font-semibold text-ink-2">
                      {points.length}
                    </span>
                  )}
                  {points.length === 1 && !points[0].color && !fill && <span aria-hidden="true" className="absolute bottom-1 h-1 w-1 rounded-full bg-ink-4" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
