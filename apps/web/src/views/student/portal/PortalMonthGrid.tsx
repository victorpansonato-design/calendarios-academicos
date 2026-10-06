import { useMemo } from 'react';
import type { ISODate, StudentEventItem } from '@calendarios/core';
import { fromISO } from '@calendarios/core';
import { cn } from '../../../lib/utils';
import { legendStyle } from '../shared';
import { monthLayout } from '../monthLayout';
import type { Theme } from './EventBits';

/* Grade do mês no portal: número do dia e, embaixo, as faixas coloridas dos
   eventos (períodos contínuos). Clicar num dia filtra a lista ao lado. */

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const LANE_H = 7;
const LANE_GAP = 3;

export function PortalMonthGrid({
  items,
  year,
  month,
  today,
  selected,
  onSelect,
  theme,
}: {
  items: StudentEventItem[];
  year: number;
  month: number;
  today: ISODate;
  selected: ISODate | null;
  onSelect: (d: ISODate | null) => void;
  theme: Theme;
}) {
  const weeks = useMemo(() => monthLayout(items, year, month), [items, year, month]);

  return (
    <div role="grid" aria-label="Grade do mês" className="select-none">
      <div role="row" className="grid grid-cols-7 border-b border-border pb-2">
        {WEEKDAYS.map((w) => (
          <span key={w} role="columnheader" className="text-center text-[10.5px] font-semibold tracking-wide text-muted-foreground">
            {w}
          </span>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} role="row" className="relative grid grid-cols-7 border-b border-border last:border-b-0">
          {week.days.map((d, ci) => {
            if (!d) return <span key={ci} role="gridcell" className="h-[78px]" />;
            const isToday = d === today;
            const isSel = d === selected;
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                aria-selected={isSel}
                aria-label={`${fromISO(d).day}${isToday ? ', hoje' : ''}`}
                onClick={() => onSelect(isSel ? null : d)}
                className={cn(
                  'relative flex h-[78px] flex-col items-start justify-start border-r border-border px-1.5 pt-1.5 text-left transition-colors last:border-r-0 hover:bg-muted/50 focus-visible:z-20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  isSel && 'bg-primary-soft hover:bg-primary-soft',
                )}
              >
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full text-[12px] font-semibold tabular',
                    isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {fromISO(d).day}
                </span>
                {week.hidden[ci] > 0 && <span className="absolute right-1.5 bottom-1 text-[10px] font-semibold text-muted-foreground">+{week.hidden[ci]}</span>}
              </button>
            );
          })}
          {/* faixas: por cima das células, sem capturar o clique do dia */}
          <div className="pointer-events-none absolute inset-x-0 top-[38px]" aria-hidden>
            {week.segments.map((s, i) => {
              const ls = legendStyle(s.item.legendColor, theme);
              return (
                <span
                  key={`${s.item.uid}-${i}`}
                  title={s.item.title}
                  className="absolute"
                  style={{
                    left: `calc(${(s.col0 / 7) * 100}% + ${s.capStart ? 5 : 0}px)`,
                    width: `calc(${((s.col1 - s.col0 + 1) / 7) * 100}% - ${(s.capStart ? 5 : 0) + (s.capEnd ? 5 : 0)}px)`,
                    top: s.lane * (LANE_H + LANE_GAP),
                    height: LANE_H,
                    background: ls.fill,
                    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${ls.ink} 55%, transparent)`,
                    borderRadius: `${s.capStart ? 4 : 0}px ${s.capEnd ? 4 : 0}px ${s.capEnd ? 4 : 0}px ${s.capStart ? 4 : 0}px`,
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
