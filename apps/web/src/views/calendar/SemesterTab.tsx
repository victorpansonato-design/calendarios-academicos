import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, EmptyState } from '../../components/ui/Surfaces';
import { MonthCard } from '../../components/calendar/MonthCard';
import { Legend } from '../../components/calendar/Legend';
import { calendarMonths, todayISO, type DayIndex } from '../../lib/calendarGrid';
import type { DetailContext } from './CalendarDetailView';

/* Visão do semestre: os meses em grade, cada dia com a cor da legenda, como
   a primeira página do PDF. Clicar num dia mostra todos os eventos dele. */

export function SemesterTab({ ctx, index }: { ctx: DetailContext; index: DayIndex }) {
  const { calendar, events } = ctx.detail;
  const [highlight, setHighlight] = useState<string | null>(null);
  const months = calendarMonths(calendar.year, calendar.semester, events);
  const today = todayISO();

  if (!events.length)
    return (
      <Card>
        <EmptyState
          title="Este calendário ainda não tem eventos"
          message="Inclua o primeiro evento para ele aparecer na grade."
          action={
            calendar.status !== 'archived' && (
              <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => ctx.editEvent(null)}>
                Novo evento
              </Button>
            )
          }
        />
      </Card>
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader
          title={`${calendar.year ?? ''} · ${calendar.semester ?? '?'}º semestre`}
          subtitle="Como no PDF: dias com mais de uma cor têm mais de um evento, e o número no canto diz quantos. Clique num dia para ver os eventos dele."
          action={
            calendar.status !== 'archived' && (
              <Button size="sm" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => ctx.editEvent(null)}>
                Novo evento
              </Button>
            )
          }
        />
        <div data-grid="semestre" className="mt-5 grid gap-x-5 gap-y-6 sm:grid-cols-2 2xl:grid-cols-3">
          {months.map((m) => (
            <MonthCard key={`${m.year}-${m.month}`} gridId="semestre" year={m.year} month={m.month} index={index} legend={calendar.legend} today={today} highlight={highlight} onSelectDay={ctx.openDay} />
          ))}
        </div>
      </Card>
      <Card className="self-start xl:sticky xl:top-24">
        <CardHeader title="Legenda" subtitle="Clique para destacar os dias de uma categoria." />
        <div className="mt-4">
          <Legend legend={calendar.legend} events={events} highlight={highlight} onHighlight={setHighlight} />
        </div>
      </Card>
    </div>
  );
}
