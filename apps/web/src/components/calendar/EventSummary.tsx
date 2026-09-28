import { Clock, ExternalLink, Link2, MapPin, Users } from 'lucide-react';
import type { CalendarEvent, LegendEntry } from '@calendarios/core';
import { EVENT_TYPE_LABEL } from '@calendarios/core';
import { Pill } from '../ui/Badges';
import { Swatch } from './Legend';
import { datesText } from '../../lib/format';
import { IMPORTANCE } from '../../lib/labels';

/* Um evento como o sistema o entendeu: título, datas, horários por turno,
   local, links, ressalvas e público — cada um no seu campo. */

export function EventMeta({ event, legend }: { event: CalendarEvent; legend: LegendEntry[] }) {
  const entry = legend.find((l) => l.key === event.category);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {entry && (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
          <Swatch entry={entry} size={12} />
          <span className="max-w-[260px] truncate">{entry.label}</span>
        </span>
      )}
      <Pill dot={false}>{EVENT_TYPE_LABEL[event.type]}</Pill>
      <Pill tone={IMPORTANCE[event.importance].tone} solid={event.importance === 'unset'}>
        {IMPORTANCE[event.importance].label}
      </Pill>
      {event.modifiedFromSource && event.origin === 'import' && <Pill dot={false}>Alterado em relação ao PDF</Pill>}
      {event.origin === 'manual' && <Pill dot={false}>Incluído manualmente</Pill>}
    </div>
  );
}

export function EventFields({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <div className="space-y-2">
      {!compact && event.description && event.description !== event.title && (
        <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink-2">{event.description}</p>
      )}
      <dl className="space-y-1.5 text-[12px]">
        {event.times.length > 0 && (
          <div className="flex items-start gap-2">
            <dt className="mt-0.5 text-ink-4">
              <Clock className="h-3.5 w-3.5" aria-label="Horário" />
            </dt>
            <dd className="text-ink-2">
              {event.times.map((t, i) => (
                <span key={i} className="mr-3 inline-block">
                  {t.shift && <span className="text-ink-3">{t.shift}: </span>}
                  <span className="font-mono">{t.time.replace(':', 'h')}</span>
                </span>
              ))}
            </dd>
          </div>
        )}
        {event.location && (
          <div className="flex items-start gap-2">
            <dt className="mt-0.5 text-ink-4">
              <MapPin className="h-3.5 w-3.5" aria-label="Local" />
            </dt>
            <dd className="text-ink-2">{event.location}</dd>
          </div>
        )}
        {event.urls.map((u) => (
          <div key={u} className="flex items-start gap-2">
            <dt className="mt-0.5 text-ink-4">
              <Link2 className="h-3.5 w-3.5" aria-label="Link" />
            </dt>
            <dd className="min-w-0">
              <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-brand-text hover:underline">
                {u}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </dd>
          </div>
        ))}
        {event.audience.groups.length > 0 && (
          <div className="flex items-start gap-2">
            <dt className="mt-0.5 text-ink-4">
              <Users className="h-3.5 w-3.5" aria-label="Público" />
            </dt>
            <dd className="text-ink-2">Somente: {event.audience.groups.join(', ')}</dd>
          </div>
        )}
      </dl>
      {event.notes.map((n, i) => (
        <p key={i} className="rounded-md bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">Observação: </span>
          {n}
        </p>
      ))}
    </div>
  );
}

/** Como no PDF: a descrição completa, com os links clicáveis. */
export function EventDocument({ event }: { event: CalendarEvent }) {
  const parts = event.description.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink-2">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p.replace(/[.,;]+$/, '')} target="_blank" rel="noopener noreferrer" className="break-all text-brand-text hover:underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

export function EventDateLabel({ event }: { event: CalendarEvent }) {
  return <span className={`font-mono text-[12px] font-medium ${event.datesResolved ? 'text-ink' : 'text-crit-ink'}`}>{datesText(event.dates, event.datesResolved)}</span>;
}
