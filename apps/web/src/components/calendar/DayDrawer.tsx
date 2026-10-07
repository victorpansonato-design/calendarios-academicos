import { CalendarPlus, Pencil, X } from 'lucide-react';
import type { Calendar, CalendarEvent, ISODate } from '@calendarios/core';
import { Drawer } from '../ui/Overlay';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/Surfaces';
import { EventDateLabel, EventFields, EventMeta } from './EventSummary';
import { longDate, plural } from '../../lib/format';

/* Todos os eventos de um dia, inclusive os períodos que passam por ele. */

export function DayDrawer({
  calendar,
  date,
  events,
  onClose,
  onEdit,
  onCreate,
}: {
  calendar: Calendar;
  date: ISODate | null;
  events: CalendarEvent[];
  onClose: () => void;
  onEdit: (e: CalendarEvent) => void;
  onCreate: (date: ISODate) => void;
}) {
  const editable = calendar.status !== 'archived';
  return (
    <Drawer open={Boolean(date)} onClose={onClose} label={date ? `Eventos de ${longDate(date)}` : 'Eventos do dia'} width="md">
      {date && (
        <>
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <p className="mb-1 text-[12px] font-medium text-muted-foreground">{events.length ? plural(events.length, 'evento neste dia', 'eventos neste dia') : 'Nenhum evento'}</p>
              <h2 className="font-display text-[18px] leading-tight font-medium text-foreground first-letter:uppercase">{longDate(date)}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mt-0.5 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="scroll-slim min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {events.length === 0 && <EmptyState compact title="Nenhum evento neste dia" message="Você pode incluir um evento novo com esta data." />}
            {events.map((e) => (
              <article key={e.id} className="space-y-2.5 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <EventDateLabel event={e} />
                    <h3 className="mt-0.5 text-[14px] leading-snug font-semibold text-foreground">{e.title}</h3>
                  </div>
                  {editable && (
                    <Button size="xs" icon={<Pencil className="h-3 w-3" />} onClick={() => onEdit(e)}>
                      Editar
                    </Button>
                  )}
                </div>
                <EventMeta event={e} legend={calendar.legend} />
                <EventFields event={e} />
              </article>
            ))}
          </div>
          {editable && (
            <footer className="flex shrink-0 justify-end border-t border-border bg-muted/50 px-5 py-3.5">
              <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => onCreate(date)}>
                Novo evento neste dia
              </Button>
            </footer>
          )}
        </>
      )}
    </Drawer>
  );
}
