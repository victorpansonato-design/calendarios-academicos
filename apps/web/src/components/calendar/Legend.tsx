import type { CSSProperties } from 'react';
import type { CalendarEvent, LegendEntry } from '@calendarios/core';

/* Legenda: a mesma do PDF, agrupada como no PDF ("Início do semestre", "Legenda").
   Clicar numa entrada destaca os dias daquela categoria na grade. */

export function Swatch({ entry, size = 14 }: { entry: Pick<LegendEntry, 'color' | 'style'>; size?: number }) {
  if (entry.style === 'corner')
    return (
      <span aria-hidden="true" className="inline-block shrink-0 overflow-hidden rounded-xs bg-muted-strong [print-color-adjust:exact]" style={{ width: size, height: size }}>
        <span className="block h-full w-full" style={{ background: `linear-gradient(225deg, ${entry.color} 0 50%, transparent 50%)` }} />
      </span>
    );
  if (entry.style === 'dot')
    return (
      <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-xs bg-muted-strong [print-color-adjust:exact]" style={{ width: size, height: size }}>
        <span className="rounded-full" style={{ width: size / 3, height: size / 3, background: entry.color }} />
      </span>
    );
  // data-swatch: contorno escurecido a partir da própria cor (index.css), para o amarelo-claro não sumir no branco
  return <span aria-hidden="true" data-swatch className="inline-block shrink-0 rounded-xs" style={{ width: size, height: size, background: entry.color, '--swatch': entry.color } as CSSProperties} />;
}

export function Legend({
  legend,
  events,
  highlight,
  onHighlight,
}: {
  legend: LegendEntry[];
  events: CalendarEvent[];
  highlight: string | null;
  onHighlight: (key: string | null) => void;
}) {
  if (!legend.length)
    return <p className="text-[12px] leading-relaxed text-muted-foreground">Este calendário não tem legenda. Você pode criar uma em "Dados gerais".</p>;

  const groups = [...new Set(legend.map((l) => l.group))];
  const counts = new Map<string, number>();
  for (const e of events) if (e.category) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  const uncategorized = events.filter((e) => !e.category).length;

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g}>
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{g}</h3>
          <ul className="space-y-0.5">
            {legend
              .filter((l) => l.group === g)
              .map((l) => {
                const active = highlight === l.key;
                return (
                  <li key={l.key}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onHighlight(active ? null : l.key)}
                      className={[
                        'flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                        active ? 'bg-muted-strong' : 'hover:bg-muted',
                      ].join(' ')}
                    >
                      <span className="mt-0.5">
                        <Swatch entry={l} />
                      </span>
                      <span className="min-w-0 flex-1 text-[12px] leading-snug text-foreground/80">{l.label}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{counts.get(l.key) ?? 0}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      {uncategorized > 0 && (
        <p className="border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
          {uncategorized} evento(s) sem cor na legenda — como no PDF, aparecem na grade com um ponto.
        </p>
      )}
    </div>
  );
}
