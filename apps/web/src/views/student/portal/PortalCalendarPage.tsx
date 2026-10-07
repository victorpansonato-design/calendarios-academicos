import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Clock, Eye, FileText, Info, MapPin, Sparkles, Star } from 'lucide-react';
import type { ISODate, StudentEventItem, StudentView } from '@calendarios/core';
import { monthLabel, OUTROS, weekdayLong } from '@calendarios/core';
import { Button } from '../../../components/ui/button';
import { SearchInput } from '../../../components/ui/Fields';
import { collapseVariants, spring, staggerContainer } from '../../../lib/motion';
import { cn } from '../../../lib/utils';
import { plural } from '../../../lib/format';
import { LegendChip, legendStyle } from '../shared';
import { itemsInMonth, initialMonth, monthsWithEvents, ym } from '../monthLayout';
import { EventCard, EventRow, ImportanceBadge, StarButton, type CardActions, type Theme } from './EventBits';
import { PortalMonthGrid } from './PortalMonthGrid';

/* ==========================================================================
   Página "Calendário acadêmico" do Portal do Aluno
   --------------------------------------------------------------------------
   Ordem pensada para o aluno:
     1. "Sua próxima data importante" — o que ele precisa saber primeiro,
        no mesmo formato do card "Sua próxima aula" da página inicial;
     2. Importantes — só o que é com ele (Alta + Média + estrelas);
     3. Calendário completo — tudo, mês a mês, para quem quiser procurar.
   ========================================================================== */

type Tab = 'importantes' | 'completo';

export interface PageProps {
  view: StudentView;
  full: StudentView;
  theme: Theme;
  category: string | null;
  setCategory: (c: string | null) => void;
  query: string;
  setQuery: (q: string) => void;
  actions: CardActions;
  pdfHref: string | null;
  onIcsAll: () => void;
}

export function PortalCalendarPage({ view, full, theme, category, setCategory, query, setQuery, actions, pdfHref, onIcsAll }: PageProps) {
  const [tab, setTab] = useState<Tab>('importantes');
  const { calendar } = full;

  return (
    <div className="mx-auto max-w-[1180px] space-y-6 px-5 py-6 @3xl:px-8">
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-end @3xl:justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground">Calendário acadêmico</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {calendar.scope.audienceLabel}
            {calendar.year && calendar.semester ? ` · ${calendar.semester}º semestre de ${calendar.year}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pdfHref && (
            <a href={pdfHref} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" icon={<FileText className="size-4" />} tabIndex={-1}>
                PDF oficial
              </Button>
            </a>
          )}
          <Button variant="default" icon={<CalendarPlus className="size-4" />} onClick={onIcsAll} disabled={!full.importantes.length}>
            Adicionar à agenda
          </Button>
        </div>
      </div>

      <NextHero full={full} theme={theme} actions={actions} />

      <div role="tablist" aria-label="Calendários" className="flex gap-6 border-b border-border">
        {(
          [
            ['importantes', `Importantes`, full.importantes.length],
            ['completo', 'Calendário completo', full.counts.total],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn('relative pb-3 text-[14px] font-semibold transition-colors', tab === value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {label} <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground tabular">{count}</span>
            {tab === value && <motion.span layoutId="portal-tab" transition={spring} className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          {tab === 'importantes' ? (
            <ImportantesTab view={view} full={full} theme={theme} category={category} setCategory={setCategory} actions={actions} onSeeAll={() => setTab('completo')} />
          ) : (
            <CompletoTab view={view} full={full} theme={theme} category={category} setCategory={setCategory} query={query} setQuery={setQuery} actions={actions} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* -- Próxima data --------------------------------------------------------- */

function NextHero({ full, theme, actions }: { full: StudentView; theme: Theme; actions: CardActions }) {
  const next = full.next;
  const counters = (
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full bg-background/80 px-3 py-1.5 text-[12px] text-muted-foreground shadow-xs">
        Importantes <strong className="ml-1 text-[13px] font-bold text-primary tabular">{full.counts.importantes}</strong>
      </span>
      <span className="rounded-full bg-background/80 px-3 py-1.5 text-[12px] text-muted-foreground shadow-xs">
        Favoritos <strong className="ml-1 text-[13px] font-bold text-primary tabular">{full.counts.starred}</strong>
      </span>
    </div>
  );

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary-soft p-5 shadow-card @3xl:p-6">
      {next ? (
        <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-start @3xl:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted-foreground">Sua próxima data importante</p>
            <button type="button" onClick={() => actions.onOpen(next.uid)} className="mt-1 text-left text-[22px] leading-tight font-bold text-foreground hover:underline @3xl:text-[24px]">
              {next.title}
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-foreground/85">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-muted-foreground" />
                <span className="first-letter:uppercase">{next.dates.kind === 'single' ? `${weekdayLong(next.dates.start)}, ${next.friendlyDate}` : next.friendlyDate}</span>
              </span>
              {next.timeLabel && (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-muted-foreground" />
                  {next.timeLabel}
                </span>
              )}
              {next.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-muted-foreground" />
                  {next.location}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <LegendChip label={next.legendLabel} style={legendStyle(next.legendColor, theme)} />
              <ImportanceBadge item={next} />
            </div>
            {next.notes[0] && (
              <p className="mt-3 flex max-w-2xl gap-2 text-[12.5px] text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" /> {next.notes[0]}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-3 @3xl:items-end">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary px-4 py-2 text-[15px] font-bold text-primary-foreground shadow-sm first-letter:uppercase">{next.countdown}</span>
              <StarButton starred={next.starred} onToggle={() => actions.onStar(next.uid)} label={next.title} />
              <Button variant="outline" size="icon" aria-label="Adicionar à agenda" onClick={() => actions.onIcs(next)}>
                <CalendarPlus className="size-4" />
              </Button>
            </div>
            {counters}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:justify-between">
          <div>
            <p className="text-[13px] text-muted-foreground">Sua próxima data importante</p>
            <p className="mt-1 text-[18px] font-bold text-foreground">Nenhuma data importante pela frente neste semestre</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Veja tudo no calendário completo e marque com ★ o que quiser acompanhar.</p>
          </div>
          {counters}
        </div>
      )}

      {full.ongoing.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 pt-4 text-[13px]">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Acontecendo agora
          </span>
          {full.ongoing.map((o) => (
            <button key={o.uid} type="button" onClick={() => actions.onOpen(o.uid)} className="flex max-w-full min-w-0 items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-left text-foreground/85 shadow-xs hover:text-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ background: legendStyle(o.legendColor, theme).fill }} aria-hidden />
              <span className="truncate">{o.title}</span>
              <span className="shrink-0 text-muted-foreground">· {o.countdown}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* -- Importantes ---------------------------------------------------------- */

function groupByMonth(items: StudentEventItem[]) {
  const groups = new Map<string, StudentEventItem[]>();
  for (const it of items) {
    const m = it.nextDate.slice(0, 7);
    groups.set(m, [...(groups.get(m) ?? []), it]);
  }
  return [...groups.entries()];
}

function ImportantesTab({
  view,
  full,
  theme,
  category,
  setCategory,
  actions,
  onSeeAll,
}: {
  view: StudentView;
  full: StudentView;
  theme: Theme;
  category: string | null;
  setCategory: (c: string | null) => void;
  actions: CardActions;
  onSeeAll: () => void;
}) {
  const [showPast, setShowPast] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const groups = groupByMonth(view.importantes);
  const hidden = full.items.filter((i) => i.hidden);
  const legend = view.legend.filter((l) => l.importantCount > 0 || l.key === category);

  return (
    <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-6">
        {groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <Sparkles className="mx-auto mb-2 size-5 text-muted-foreground" />
            <p className="font-semibold text-foreground">{category ? 'Nada importante com essa cor pela frente' : 'Nada importante pela frente'}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {category ? 'Limpe o filtro para ver as outras datas.' : 'No calendário completo você encontra todas as datas e pode marcar com ★.'}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={category ? () => setCategory(null) : onSeeAll}>
              {category ? 'Limpar filtro' : 'Ver calendário completo'}
            </Button>
          </div>
        )}
        {groups.map(([month, items]) => (
          <section key={month}>
            <h2 className="mb-2.5 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{monthLabel(month)}</h2>
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2.5">
              {items.map((it) => (
                <EventCard key={it.uid} item={it} theme={theme} actions={actions} />
              ))}
            </motion.div>
          </section>
        ))}

        {view.importantesPast.length > 0 && (
          <section>
            <button type="button" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast} className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn('size-4 transition-transform', showPast && 'rotate-180')} />
              Já passaram ({view.importantesPast.length})
            </button>
            <AnimatePresence initial={false}>
              {showPast && (
                <motion.div variants={collapseVariants} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                  <div className="space-y-2.5 pt-3">
                    {view.importantesPast.map((it) => (
                      <EventCard key={it.uid} item={it} theme={theme} actions={actions} animated={false} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {hidden.length > 0 && (
          <section className="rounded-xl bg-muted/60 px-4 py-3">
            <button type="button" onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
              <Eye className="size-4" />
              {plural(hidden.length, 'data ocultada', 'datas ocultadas')} por você — {showHidden ? 'esconder' : 'mostrar'}
            </button>
            {showHidden && (
              <ul className="mt-2 space-y-1">
                {hidden.map((h) => (
                  <li key={h.uid} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="truncate text-foreground/80">
                      {h.dateLabel} · {h.title}
                    </span>
                    <Button variant="link" size="sm" onClick={() => actions.onHide(h.uid)}>
                      Voltar aos importantes
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <aside className="space-y-4 @3xl:sticky @3xl:top-4 @3xl:self-start">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-foreground">Filtrar por cor</h3>
            {category && (
              <button type="button" onClick={() => setCategory(null)} className="text-[12px] font-medium text-primary hover:underline">
                Limpar
              </button>
            )}
          </div>
          <p className="mb-2 text-[12px] text-muted-foreground">As cores são as do calendário oficial (PDF).</p>
          <LegendFilter legend={legend} theme={theme} category={category} setCategory={setCategory} countKey="importantCount" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-[12.5px] text-muted-foreground shadow-card">
          <h3 className="mb-2 text-[14px] font-bold text-foreground">Como funciona</h3>
          <ul className="space-y-2">
            <li>As datas de importância alta e média aparecem aqui sozinhas.</li>
            <li className="flex gap-1.5">
              <Star className="mt-0.5 size-3.5 shrink-0 fill-[var(--brand-yellow)] text-warning-foreground" />
              Marque qualquer data para receber um lembrete 1 dia antes, às 9h.
            </li>
            <li>Datas ocultadas continuam no calendário completo.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function LegendFilter({
  legend,
  theme,
  category,
  setCategory,
  countKey,
}: {
  legend: StudentView['legend'];
  theme: Theme;
  category: string | null;
  setCategory: (c: string | null) => void;
  countKey: 'count' | 'importantCount';
}) {
  if (!legend.length) return <p className="text-[12px] text-muted-foreground">Sem cores neste calendário.</p>;
  return (
    <ul className="scroll-slim max-h-[360px] space-y-0.5 overflow-y-auto">
      {legend.map((l) => {
        const ls = legendStyle(l.color, theme);
        const active = category === l.key;
        return (
          <li key={l.key}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(active ? null : l.key)}
              className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors', active ? 'bg-primary-soft text-foreground' : 'text-foreground/80 hover:bg-muted')}
            >
              <span className="size-3 shrink-0 rounded-[3px]" style={{ background: ls.fill, boxShadow: `inset 0 0 0 1px ${ls.ink}` }} aria-hidden />
              <span className="min-w-0 flex-1 leading-snug">{l.key === OUTROS ? 'Sem cor na legenda' : l.label}</span>
              <span className="text-[11px] text-muted-foreground tabular">{l[countKey]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* -- Calendário completo -------------------------------------------------- */

function CompletoTab({
  view,
  full,
  theme,
  category,
  setCategory,
  query,
  setQuery,
  actions,
}: {
  view: StudentView;
  full: StudentView;
  theme: Theme;
  category: string | null;
  setCategory: (c: string | null) => void;
  query: string;
  setQuery: (q: string) => void;
  actions: CardActions;
}) {
  const months = useMemo(() => monthsWithEvents(full.items), [full.items]);
  const [month, setMonth] = useState<string | null>(() => initialMonth(months, full.today));
  const [day, setDay] = useState<ISODate | null>(null);

  useEffect(() => {
    if (!month || !months.includes(month)) setMonth(initialMonth(months, full.today));
  }, [months, month, full.today]);
  useEffect(() => setDay(null), [month]);

  const idx = month ? months.indexOf(month) : -1;
  const searching = Boolean(query.trim());
  const list = searching ? view.items : month ? itemsInMonth(view.items, month, day) : [];
  const { year, month: m } = month ? ym(month) : { year: 0, month: 0 };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center">
        <SearchInput value={query} onValueChange={setQuery} placeholder="Buscar uma data (ex.: prova, feriado, inscrição)" className="@3xl:w-80" />
        <div className="scroll-slim -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
          {view.legend.map((l) => {
            const ls = legendStyle(l.color, theme);
            const active = category === l.key;
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(active ? null : l.key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] whitespace-nowrap transition-colors',
                  active ? 'border-primary/50 bg-primary-soft font-medium text-foreground' : 'border-border bg-background text-foreground/80 hover:bg-muted',
                )}
              >
                <span className="size-2.5 rounded-full" style={{ background: ls.fill, boxShadow: `inset 0 0 0 1px ${ls.ink}` }} aria-hidden />
                {l.key === OUTROS ? 'Sem cor' : l.label}
                <span className="text-muted-foreground tabular">{l.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {searching ? (
        <div className="rounded-xl border border-border bg-card p-3 shadow-card">
          <p className="px-2.5 pb-2 text-[12.5px] text-muted-foreground">{plural(list.length, 'data encontrada', 'datas encontradas')}</p>
          {list.length ? (
            <ul>
              {list.map((it) => (
                <EventRow key={it.uid} item={it} theme={theme} actions={actions} />
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-6 text-center text-[13px] text-muted-foreground">Nada encontrado. Tente outra palavra, como "prova" ou "feriado".</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <Button variant="ghost" size="icon" aria-label="Mês anterior" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])}>
                <ChevronLeft className="size-4" />
              </Button>
              <h3 className="text-[15px] font-bold text-foreground">{month ? monthLabel(month) : '—'}</h3>
              <Button variant="ghost" size="icon" aria-label="Próximo mês" disabled={idx < 0 || idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {month && <PortalMonthGrid items={view.items} year={year} month={m} today={full.today} selected={day} onSelect={setDay} theme={theme} />}
            <p className="mt-3 text-[11.5px] text-muted-foreground">Cada faixa é uma data; períodos aparecem do primeiro ao último dia. Clique num dia para ver só ele.</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 shadow-card">
            <div className="flex items-center justify-between px-2.5 pb-2">
              <p className="text-[13px] font-semibold text-foreground">{day ? `Dia ${Number(day.slice(8))}` : month ? `Em ${monthLabel(month).split(' de ')[0].toLowerCase()}` : 'Datas'}</p>
              {day && (
                <button type="button" onClick={() => setDay(null)} className="text-[12px] font-medium text-primary hover:underline">
                  Ver o mês inteiro
                </button>
              )}
            </div>
            {list.length ? (
              <ul className="scroll-slim max-h-[520px] overflow-y-auto">
                {list.map((it) => (
                  <EventRow key={it.uid} item={it} theme={theme} actions={actions} />
                ))}
              </ul>
            ) : (
              <p className="px-2.5 py-8 text-center text-[13px] text-muted-foreground">{day ? 'Nada marcado neste dia.' : 'Nada neste mês.'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
