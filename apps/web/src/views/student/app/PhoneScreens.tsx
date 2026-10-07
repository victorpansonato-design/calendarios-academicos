import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BellRing,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Info,
  Link2,
  MapPin,
  MoreHorizontal,
  Receipt,
  Search,
  Star,
  Wallet,
  X,
} from 'lucide-react';
import type { ISODate, StudentEventItem, StudentView } from '@calendarios/core';
import { fromISO, MONTH_NAMES, monthLabel, OUTROS, weekdayLong } from '@calendarios/core';
import { IOS } from '../../../components/device/IPhone';
import { AnchietaLogo } from '../../../components/brand/AnchietaLogo';
import { collapseVariants, press, spring, staggerContainer, staggerItem } from '../../../lib/motion';
import { plural } from '../../../lib/format';
import { legendStyle, TypeIcon } from '../shared';
import { initialMonth, itemsInMonth, monthLayout, monthsWithEvents, ym } from '../monthLayout';
import { BlueHeader, dark, HEADER_BG, PhoneBadge, PhoneChip, PhoneStar, SCREEN, type PushPreview } from './phoneKit';

/* ==========================================================================
   Telas do app
   --------------------------------------------------------------------------
   Início fiel ao app real; Calendário com "Importantes" e "Completo"; a
   data aberta; e Avisos, onde ficam os lembretes que o aluno vai receber.
   ========================================================================== */

export interface PhoneActions {
  open: (uid: string) => void;
  star: (uid: string) => void;
  hide: (uid: string) => void;
  ics: (item: StudentEventItem) => void;
}

const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3).toUpperCase());
const BOTTOM_SPACE = IOS.safeBottom + 92;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/* -- Início --------------------------------------------------------------- */

export function HomeScreen({ full, onCalendar }: { full: StudentView; onCalendar: () => void }) {
  const next = full.next;
  const ongoing = full.ongoing[0];
  const chip = next ? `${next.title} · ${next.countdown}` : ongoing ? `${ongoing.title} · ${ongoing.countdown}` : 'Veja o calendário do semestre';
  return (
    <div style={{ paddingBottom: BOTTOM_SPACE }}>
      <div className="px-5 pb-16" style={{ backgroundImage: HEADER_BG, paddingTop: IOS.safeTop - 4 }}>
        <div className="flex items-start justify-between">
          <span style={{ ['--brand-mark' as string]: '#04264a' }}>
            <AnchietaLogo className="h-[26px] w-auto" />
          </span>
          <button type="button" onClick={onCalendar} aria-label="Abrir calendário acadêmico" className="grid size-9 place-items-center rounded-full text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <CalendarDays className="size-[21px]" />
          </button>
        </div>
        <div className="mt-5 flex items-start justify-between gap-4">
          <div className="min-w-0 pt-1">
            <p className="text-[16px] text-white/90">
              {greeting()}, <strong className="font-bold">Aluno</strong>!
            </p>
            <h1 className="mt-2 text-[24px] leading-[1.2] font-medium text-white">
              Dê uma olhada no
              <br />
              que tem pra hoje!
            </h1>
          </div>
          <div className="shrink-0 text-center">
            <div className="grid size-[78px] place-items-center rounded-full text-[24px] font-semibold text-white" style={{ background: 'linear-gradient(135deg,#3a7bd5,#1d3f7a)', boxShadow: '0 0 0 4px #fff' }}>
              AE
            </div>
            <p className="mt-2 text-[12.5px] font-bold text-white">RA: 0000000</p>
          </div>
        </div>
        {/* chip de vidro "Minhas datas" — a entrada aprovada pela diretoria */}
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onCalendar} className="ios-glass mt-5 flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left">
          <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(255,255,255,0.16)' }}>
            <CalendarDays className="size-[18px] text-white" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-white">Minhas datas</span>
            <span className="block truncate text-[12.5px] text-white/75">{chip}</span>
          </span>
          <ChevronRight className="size-5 text-white/70" />
        </motion.button>
      </div>

      <div className="-mt-10 space-y-6 px-4">
        <div className="rounded-[20px] p-4" style={{ background: SCREEN.card }} aria-label="Exemplo ilustrativo da aula do dia">
          <p className="flex items-center gap-2.5 text-[16px] text-white">
            <CalendarDays className="size-5" /> Hoje
          </p>
          <div className="mt-3 flex gap-3">
            <BookOpen className="mt-0.5 size-5 text-white" />
            <div>
              <p className="text-[15px] font-semibold text-white">Economia das Decisões Empresariais</p>
              <p className="text-[13px]" style={{ color: SCREEN.ink2 }}>
                Das 19:10 até 21:50
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex gap-3">
            <MapPin className="mt-0.5 size-5 text-white" />
            <div>
              <p className="text-[15px] font-semibold text-white">Prédio 1</p>
              <p className="text-[13px]" style={{ color: SCREEN.ink2 }}>
                Sala 12 - Piso Térreo
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-[14px] font-medium" style={{ borderColor: SCREEN.line, color: SCREEN.link }}>
            Ver todas as aulas <ChevronRight className="size-4" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center" aria-hidden>
          {[
            ['Cobranças a Pagar', Wallet],
            ['Notas e Faltas', FileText],
            ['Contratos', Receipt],
            ['Mais...', MoreHorizontal],
          ].map(([label, Icon]) => {
            const I = Icon as typeof Wallet;
            return (
              <div key={label as string} className="flex flex-col items-center gap-1.5">
                <span className="grid size-[62px] place-items-center rounded-[18px]" style={{ background: SCREEN.card }}>
                  <I className="size-7 text-white" />
                </span>
                <span className="text-[11px] leading-tight text-white/85">{label as string}</span>
              </div>
            );
          })}
        </div>

        <div>
          <h2 className="mb-2.5 text-[19px] font-bold text-white">Destaques</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onCalendar} className="w-[268px] shrink-0 overflow-hidden rounded-[18px] text-left" style={{ background: SCREEN.card }}>
              <CalendarArt />
              <span className="block px-3.5 py-3">
                <span className="block text-[15px] font-semibold text-white">Calendário acadêmico</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: SCREEN.ink2 }}>
                  Fique por dentro das datas importantes do semestre.
                </span>
              </span>
            </motion.button>
            <div className="w-[200px] shrink-0 overflow-hidden rounded-[18px]" style={{ background: SCREEN.card }} aria-hidden>
              <span className="block h-[118px]" style={{ background: 'linear-gradient(135deg,#f5c400,#f08a24)' }} />
              <span className="block px-3.5 py-3">
                <span className="block text-[15px] font-semibold text-white">Cursos de Extensão</span>
                <span className="mt-0.5 block text-[12.5px]" style={{ color: SCREEN.ink2 }}>
                  Vagas limitadas! Inscreva-se…
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* botão de conversa, como no app (cenário) */}
      <span aria-hidden className="absolute right-4 z-10 grid size-14 place-items-center rounded-full" style={{ bottom: BOTTOM_SPACE - 4, background: '#22c55e', boxShadow: '0 8px 20px rgba(34,197,94,0.35)' }}>
        <span className="h-4 w-5 rounded-[6px] bg-white" />
      </span>
    </div>
  );
}

/** Ilustração do card de Destaques: um mês com dias coloridos. */
function CalendarArt() {
  const colors = ['#2f5597', '#d7263d', '#f08a24', '#199e8c', '#915009'];
  return (
    <span className="relative block h-[118px] overflow-hidden" style={{ backgroundImage: 'linear-gradient(140deg,#e9eef7,#cfd9ea)' }} aria-hidden>
      <span className="absolute top-4 left-5 grid w-[160px] grid-cols-7 gap-1 rounded-lg bg-white p-2 shadow-lg" style={{ transform: 'rotate(-6deg)' }}>
        {Array.from({ length: 28 }, (_, i) => (
          <span key={i} className="h-3 rounded-[2px]" style={{ background: [3, 9, 10, 11, 17, 22, 25].includes(i) ? colors[i % colors.length] : '#eef1f6' }} />
        ))}
      </span>
      <span className="absolute right-6 bottom-3 h-14 w-20 rounded-md bg-[#2b2f36] shadow-xl" style={{ transform: 'rotate(8deg)' }} />
    </span>
  );
}

/* -- Calendário ----------------------------------------------------------- */

export type CalMode = 'importantes' | 'completo';

export function CalendarScreen({
  view,
  full,
  mode,
  setMode,
  category,
  setCategory,
  query,
  setQuery,
  actions,
}: {
  view: StudentView;
  full: StudentView;
  mode: CalMode;
  setMode: (m: CalMode) => void;
  category: string | null;
  setCategory: (c: string | null) => void;
  query: string;
  setQuery: (q: string) => void;
  actions: PhoneActions;
}) {
  return (
    <div style={{ paddingBottom: BOTTOM_SPACE }}>
      <BlueHeader title="Calendário acadêmico" subtitle={full.calendar.scope.audienceLabel}>
        <div role="tablist" className="mt-4 flex rounded-full p-1" style={{ background: 'rgba(0,0,0,0.28)' }}>
          {(
            [
              ['importantes', `Importantes · ${full.importantes.length}`],
              ['completo', 'Completo'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} role="tab" type="button" aria-selected={mode === value} onClick={() => setMode(value)} className="relative flex-1 rounded-full py-2 text-[13.5px] font-semibold" style={{ color: mode === value ? '#fff' : 'rgba(255,255,255,0.7)' }}>
              {mode === value && <motion.span layoutId="app-cal-mode" transition={spring} className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(180deg,#087fea,#0670d5)' }} />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </BlueHeader>
      {mode === 'importantes' ? (
        <Importantes view={view} full={full} actions={actions} category={category} setCategory={setCategory} onAll={() => setMode('completo')} />
      ) : (
        <Completo view={view} full={full} actions={actions} category={category} setCategory={setCategory} query={query} setQuery={setQuery} />
      )}
    </div>
  );
}

function Importantes({ view, full, actions, category, setCategory, onAll }: { view: StudentView; full: StudentView; actions: PhoneActions; category: string | null; setCategory: (c: string | null) => void; onAll: () => void }) {
  const [past, setPast] = useState(false);
  const next = full.next;
  const groups = useMemo(() => {
    const m = new Map<string, StudentEventItem[]>();
    for (const it of view.importantes) m.set(it.nextDate.slice(0, 7), [...(m.get(it.nextDate.slice(0, 7)) ?? []), it]);
    return [...m.entries()];
  }, [view.importantes]);

  return (
    <div className="space-y-5 px-4 pt-4">
      {next && !category && (
        <motion.button type="button" whileTap={press} onClick={() => actions.open(next.uid)} className="block w-full rounded-[20px] p-4 text-left" style={{ background: 'linear-gradient(180deg,#26282c,#1b1c1f)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
          <span className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: SCREEN.ink3 }}>
              PRÓXIMA DATA
            </span>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white uppercase" style={{ background: dark(next).ink, color: '#0b0b0c' }}>
              {next.countdown}
            </span>
          </span>
          <span className="mt-2 block text-[19px] leading-snug font-bold text-white">{next.title}</span>
          <span className="mt-1 block text-[13px] first-letter:uppercase" style={{ color: SCREEN.ink2 }}>
            {next.dates.kind === 'single' ? `${weekdayLong(next.dates.start)}, ${next.friendlyDate}` : next.friendlyDate}
            {next.timeLabel ? ` · ${next.timeLabel}` : ''}
          </span>
          <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <PhoneChip item={next} />
            <PhoneBadge item={next} />
          </span>
          <span className="mt-3 flex items-center justify-end text-[13px] font-medium" style={{ color: SCREEN.link }}>
            Ver detalhes <ChevronRight className="size-4" />
          </span>
        </motion.button>
      )}

      {full.ongoing.length > 0 && !category && (
        <div className="rounded-2xl px-3.5 py-3" style={{ background: 'rgba(50,213,131,0.08)', boxShadow: 'inset 0 0 0 1px rgba(50,213,131,0.2)' }}>
          <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold" style={{ color: SCREEN.green }}>
            <span className="size-1.5 rounded-full" style={{ background: SCREEN.green }} /> Acontecendo agora
          </p>
          {full.ongoing.map((o) => (
            <button key={o.uid} type="button" onClick={() => actions.open(o.uid)} className="flex w-full items-center justify-between gap-2 py-1 text-left text-[13.5px] text-white">
              <span className="truncate">{o.title}</span>
              <span className="shrink-0 text-[12px]" style={{ color: SCREEN.ink2 }}>
                {o.countdown}
              </span>
            </button>
          ))}
        </div>
      )}

      {category && (
        <button type="button" onClick={() => setCategory(null)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-white" style={{ background: SCREEN.cardHi }}>
          Filtrando por cor <X className="size-3.5" />
        </button>
      )}

      {groups.length === 0 && <p className="py-8 text-center text-[13.5px]" style={{ color: SCREEN.ink2 }}>Nada importante pela frente. Toque em “Completo” para ver todas as datas.</p>}

      {groups.map(([month, items]) => (
        <section key={month}>
          <h2 className="mb-2 text-[12px] font-semibold tracking-[0.08em] uppercase" style={{ color: SCREEN.ink3 }}>
            {monthLabel(month)}
          </h2>
          <motion.ol variants={staggerContainer} initial="initial" animate="animate">
            {items.map((it, i) => (
              <TimelineRow key={it.uid} item={it} last={i === items.length - 1} actions={actions} />
            ))}
          </motion.ol>
        </section>
      ))}

      {view.importantesPast.length > 0 && (
        <section>
          <button type="button" onClick={() => setPast((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: SCREEN.ink2 }}>
            <ChevronDown className="size-4 transition-transform" style={{ transform: past ? 'rotate(180deg)' : undefined }} /> Já passaram ({view.importantesPast.length})
          </button>
          <AnimatePresence initial={false}>
            {past && (
              <motion.ol variants={collapseVariants} initial="initial" animate="animate" exit="exit" className="overflow-hidden pt-2 opacity-70">
                {view.importantesPast.map((it, i) => (
                  <TimelineRow key={it.uid} item={it} last={i === view.importantesPast.length - 1} actions={actions} />
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
        </section>
      )}

      <p className="rounded-2xl px-4 py-3 text-[12.5px] leading-relaxed" style={{ background: SCREEN.card, color: SCREEN.ink2 }}>
        Aqui: <strong className="text-white">{full.counts.importantes}</strong> das <strong className="text-white">{full.counts.total}</strong> datas do seu calendário.{' '}
        <button type="button" onClick={onAll} className="font-medium" style={{ color: SCREEN.link }}>
          Ver o calendário completo ›
        </button>
      </p>
    </div>
  );
}

function TimelineRow({ item, last, actions }: { item: StudentEventItem; last: boolean; actions: PhoneActions }) {
  const ls = dark(item);
  const s = fromISO(item.nextDate);
  return (
    <motion.li variants={staggerItem} className="flex gap-3">
      <div className="w-[38px] shrink-0 pt-2.5 text-center">
        <span className="block text-[20px] leading-none font-bold text-white tabular">{s.day}</span>
        <span className="mt-0.5 block text-[10px] font-semibold" style={{ color: SCREEN.ink3 }}>
          {MONTH_ABBR[s.month - 1]}
        </span>
      </div>
      <div className="relative flex w-3 shrink-0 justify-center">
        <span className="absolute top-0 bottom-0 w-px" style={{ background: last ? 'linear-gradient(rgba(255,255,255,0.2),transparent)' : 'rgba(255,255,255,0.2)' }} />
        <span className="relative mt-4 size-3 rounded-full" style={{ background: ls.ink, boxShadow: `0 0 0 3px ${SCREEN.page}` }} />
      </div>
      <div className="relative mb-2.5 flex min-w-0 flex-1 gap-2 rounded-[17px] py-3 pr-1.5 pl-3.5" style={{ background: 'linear-gradient(180deg,#202123,#171819)', boxShadow: `inset 3px 0 0 ${ls.ink}` }}>
        <button type="button" onClick={() => actions.open(item.uid)} className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-[17px]">
          <span className="flex flex-wrap items-center gap-1.5">
            <PhoneChip item={item} />
            <PhoneBadge item={item} />
          </span>
          <span className="mt-1.5 line-clamp-2 block text-[14.5px] leading-snug font-semibold text-white">{item.title}</span>
          <span className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: SCREEN.ink2 }}>
            <Clock className="size-3.5" /> {item.countdown}
            {item.timeLabel ? ` · ${item.timeLabel}` : ''}
          </span>
        </button>
        <PhoneStar starred={item.starred} onToggle={() => actions.star(item.uid)} label={item.title} />
      </div>
    </motion.li>
  );
}

function Completo({
  view,
  full,
  actions,
  category,
  setCategory,
  query,
  setQuery,
}: {
  view: StudentView;
  full: StudentView;
  actions: PhoneActions;
  category: string | null;
  setCategory: (c: string | null) => void;
  query: string;
  setQuery: (q: string) => void;
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

  return (
    <div className="space-y-4 pt-4">
      <div className="px-4">
        <label className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5" style={{ background: SCREEN.card }}>
          <Search className="size-4" style={{ color: SCREEN.ink3 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar uma data" className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/40" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca">
              <X className="size-4" style={{ color: SCREEN.ink3 }} />
            </button>
          )}
        </label>
      </div>
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {view.legend.map((l) => {
          const ls = legendStyle(l.color, 'dark');
          const active = category === l.key;
          return (
            <button
              key={l.key}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(active ? null : l.key)}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] whitespace-nowrap"
              style={{ background: active ? 'rgba(74,158,255,0.22)' : SCREEN.card, color: active ? '#fff' : SCREEN.ink2, boxShadow: active ? 'inset 0 0 0 1px rgba(74,158,255,0.6)' : 'none' }}
            >
              <span className="size-2 rounded-full" style={{ background: ls.ink }} />
              {l.key === OUTROS ? 'Sem cor' : l.label}
            </button>
          );
        })}
      </div>

      {!searching && month && (
        <div className="mx-4 rounded-[20px] p-3.5" style={{ background: SCREEN.card }}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Mês anterior" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])} className="grid size-8 place-items-center rounded-full disabled:opacity-30" style={{ color: SCREEN.ink }}>
              <ChevronLeft className="size-5" />
            </button>
            <span className="text-[15px] font-semibold text-white">{monthLabel(month)}</span>
            <button type="button" aria-label="Próximo mês" disabled={idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])} className="grid size-8 place-items-center rounded-full disabled:opacity-30" style={{ color: SCREEN.ink }}>
              <ChevronRight className="size-5" />
            </button>
          </div>
          <PhoneMonth items={view.items} month={month} today={full.today} selected={day} onSelect={setDay} />
        </div>
      )}

      <div className="px-4">
        <p className="mb-2 flex items-center justify-between text-[12px] font-semibold tracking-[0.06em] uppercase" style={{ color: SCREEN.ink3 }}>
          {searching ? plural(list.length, 'data encontrada', 'datas encontradas') : day ? `Dia ${fromISO(day).day}` : `${plural(list.length, 'data', 'datas')} no mês`}
          {day && (
            <button type="button" onClick={() => setDay(null)} className="font-medium normal-case" style={{ color: SCREEN.link }}>
              Ver o mês inteiro
            </button>
          )}
        </p>
        {list.length ? (
          <ul className="space-y-2">
            {list.map((it) => (
              <CompactRow key={it.uid} item={it} actions={actions} />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[13.5px]" style={{ color: SCREEN.ink2 }}>
            {searching ? 'Nada encontrado. Tente "prova" ou "feriado".' : 'Nada marcado neste dia.'}
          </p>
        )}
      </div>
    </div>
  );
}

function PhoneMonth({ items, month, today, selected, onSelect }: { items: StudentEventItem[]; month: string; today: ISODate; selected: ISODate | null; onSelect: (d: ISODate | null) => void }) {
  const { year, month: m } = ym(month);
  const weeks = useMemo(() => monthLayout(items, year, m, 2), [items, year, m]);
  return (
    <div role="grid" aria-label="Grade do mês">
      <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-semibold" style={{ color: SCREEN.ink3 }}>
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      {weeks.map((w, wi) => (
        <div key={wi} className="relative grid h-[46px] grid-cols-7">
          {w.days.map((d, ci) =>
            d ? (
              <button key={d} type="button" onClick={() => onSelect(selected === d ? null : d)} aria-label={`Dia ${fromISO(d).day}`} aria-pressed={selected === d} className="flex flex-col items-center pt-1">
                <span
                  className="grid size-[28px] place-items-center rounded-full text-[14px] font-medium tabular"
                  style={{
                    background: selected === d ? SCREEN.blue : 'transparent',
                    color: '#fff',
                    boxShadow: d === today && selected !== d ? 'inset 0 0 0 1.5px rgba(255,255,255,0.65)' : 'none',
                  }}
                >
                  {fromISO(d).day}
                </span>
                {w.hidden[ci] > 0 && <span className="text-[8px]" style={{ color: SCREEN.ink3 }}>+{w.hidden[ci]}</span>}
              </button>
            ) : (
              <span key={ci} />
            ),
          )}
          <div className="pointer-events-none absolute inset-x-0 top-[33px]" aria-hidden>
            {w.segments.map((s, i) => {
              const ls = legendStyle(s.item.legendColor, 'dark');
              return (
                <span
                  key={i}
                  className="absolute"
                  style={{
                    left: `calc(${(s.col0 / 7) * 100}% + ${s.capStart ? 9 : 0}px)`,
                    width: `calc(${((s.col1 - s.col0 + 1) / 7) * 100}% - ${(s.capStart ? 9 : 0) + (s.capEnd ? 9 : 0)}px)`,
                    top: s.lane * 5,
                    height: 3,
                    background: ls.ink,
                    borderRadius: 2,
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

function CompactRow({ item, actions }: { item: StudentEventItem; actions: PhoneActions }) {
  const ls = dark(item);
  const s = fromISO(item.dates.start);
  return (
    <li className="relative flex items-center gap-3 rounded-[16px] py-2.5 pr-1.5 pl-3" style={{ background: SCREEN.card, opacity: item.status === 'past' ? 0.6 : 1 }}>
      <span className="w-9 shrink-0 text-center">
        <span className="block text-[17px] leading-none font-bold text-white tabular">{s.day}</span>
        <span className="block text-[9.5px] font-semibold" style={{ color: SCREEN.ink3 }}>
          {MONTH_ABBR[s.month - 1]}
        </span>
      </span>
      <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: ls.ink }} />
      <button type="button" onClick={() => actions.open(item.uid)} className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-[16px]">
        <span className="line-clamp-2 block text-[13.5px] leading-snug font-medium text-white">{item.title}</span>
        <span className="mt-1 flex items-center gap-1.5">
          {!ls.hasColor && <TypeIcon type={item.type} className="size-3.5" style={{ color: SCREEN.ink3 }} />}
          <span className="truncate text-[11.5px]" style={{ color: SCREEN.ink2 }}>
            {item.status === 'past' ? 'Já aconteceu' : item.countdown}
          </span>
        </span>
      </button>
      <PhoneStar starred={item.starred} onToggle={() => actions.star(item.uid)} label={item.title} size={36} />
    </li>
  );
}

/* -- Detalhe -------------------------------------------------------------- */

export function DetailScreen({ item, origin, onBack, actions, reminderWhen, pdfHref }: { item: StudentEventItem; origin: string; onBack: () => void; actions: PhoneActions; reminderWhen: string | null; pdfHref: string | null }) {
  const [official, setOfficial] = useState(false);
  const ls = dark(item);
  const reminder = item.calendarReminder.enabled
    ? `A UniAnchieta avisa todos os alunos: ${item.calendarReminder.labels.join(', ').toLowerCase()}.`
    : item.starred
      ? reminderWhen
        ? `Você vai receber um lembrete em ${reminderWhen}.`
        : item.status === 'ongoing'
          ? 'Esta data já está acontecendo, então não há lembrete a agendar.'
          : 'O horário do lembrete já passou.'
      : 'Toque na ★ para receber um lembrete 1 dia antes, às 9h.';

  return (
    <div style={{ paddingBottom: BOTTOM_SPACE }}>
      <BlueHeader title={item.title} back={origin} onBack={onBack}>
        <p className="mt-1.5 text-[13px] text-white/80 first-letter:uppercase">
          {item.dates.kind === 'single' ? `${weekdayLong(item.dates.start)}, ${item.friendlyDate}` : item.friendlyDate}
        </p>
      </BlueHeader>
      <div className="space-y-3 px-4 pt-4">
        <div className="rounded-[20px] p-4" style={{ background: SCREEN.card }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <PhoneChip item={item} />
            <PhoneBadge item={item} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: ls.tint }}>
              <TypeIcon type={item.type} className="size-5" style={{ color: ls.ink }} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-white first-letter:uppercase">{item.countdown}</span>
              <span className="block text-[12.5px]" style={{ color: SCREEN.ink2 }}>
                {item.dateLabel}
              </span>
            </span>
          </div>
          <ul className="mt-3 space-y-2 border-t pt-3 text-[13.5px]" style={{ borderColor: SCREEN.line, color: SCREEN.ink2 }}>
            {item.shiftTimes.length > 0 && (
              <li className="flex gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0" /> {item.shiftTimes.map((t) => (t.shift ? `${t.shift}: ${t.time.replace(':', 'h')}` : t.time.replace(':', 'h'))).join(' · ')}
              </li>
            )}
            {item.location && (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0" /> {item.location}
              </li>
            )}
            {item.urls.map((u) => (
              <li key={u} className="flex gap-2.5">
                <Link2 className="mt-0.5 size-4 shrink-0" />
                <a href={u} target="_blank" rel="noopener noreferrer" className="truncate" style={{ color: SCREEN.link }}>
                  {u.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              </li>
            ))}
            {item.details.map((d) => (
              <li key={d} className="text-white/85">
                {d}
              </li>
            ))}
          </ul>
        </div>

        {item.notes.map((n) => (
          <div key={n} className="flex gap-2.5 rounded-2xl px-3.5 py-3 text-[13px] leading-snug" style={{ background: 'rgba(245,180,89,0.12)', color: '#f7c98a' }}>
            <Info className="mt-0.5 size-4 shrink-0" /> {n}
          </div>
        ))}

        <div className="rounded-[20px] p-4" style={{ background: SCREEN.card }}>
          <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em] uppercase" style={{ color: SCREEN.ink3 }}>
            <BellRing className="size-3.5" /> Lembrete
          </p>
          <p className="mt-1.5 text-[14px] text-white">{reminder}</p>
          <motion.button
            type="button"
            whileTap={press}
            onClick={() => actions.star(item.uid)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold"
            style={item.starred ? { background: SCREEN.cardHi, color: '#fff' } : { background: 'linear-gradient(180deg,#087fea,#0670d5)', color: '#fff' }}
          >
            <Star className="size-[18px]" style={{ fill: item.starred ? '#f5c400' : 'transparent', color: item.starred ? '#f5c400' : '#fff' }} />
            {item.starred ? 'Remover dos favoritos' : 'Favoritar'}
          </motion.button>
        </div>

        <div className="overflow-hidden rounded-[20px]" style={{ background: SCREEN.card }}>
          <ActionRow icon={<CalendarPlus className="size-[18px]" />} label="Adicionar à agenda" onClick={() => actions.ics(item)} />
          {item.canHide && !item.starred && (
            <ActionRow icon={item.hidden ? <Eye className="size-[18px]" /> : <EyeOff className="size-[18px]" />} label={item.hidden ? 'Voltar aos importantes' : 'Ocultar dos importantes'} onClick={() => actions.hide(item.uid)} />
          )}
          {(item.officialText || pdfHref) && <ActionRow icon={<FileText className="size-[18px]" />} label="Ver texto oficial" onClick={() => setOfficial((v) => !v)} open={official} />}
          <AnimatePresence initial={false}>
            {official && (
              <motion.div variants={collapseVariants} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                <div className="px-4 pb-4 text-[12.5px] leading-relaxed whitespace-pre-line" style={{ color: SCREEN.ink2 }}>
                  {item.officialText ?? item.description}
                  {pdfHref && (
                    <a href={pdfHref} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 font-medium" style={{ color: SCREEN.link }}>
                      Abrir o PDF oficial <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ActionRow({ icon, label, onClick, open }: { icon: React.ReactNode; label: string; onClick: () => void; open?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b px-4 py-3.5 text-left text-[14.5px] text-white last:border-b-0" style={{ borderColor: SCREEN.line }}>
      <span style={{ color: SCREEN.link }}>{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-4 transition-transform" style={{ color: SCREEN.ink3, transform: open ? 'rotate(90deg)' : undefined }} />
    </button>
  );
}

/* -- Avisos e Horários ---------------------------------------------------- */

export function AvisosScreen({ pushes }: { pushes: PushPreview[] }) {
  return (
    <div style={{ paddingBottom: BOTTOM_SPACE }}>
      <BlueHeader title="Avisos" subtitle="Lembretes das datas que você marcou" />
      <div className="space-y-2.5 px-4 pt-4">
        {pushes.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Star className="mx-auto mb-3 size-7" style={{ color: SCREEN.ink3 }} />
            <p className="text-[14px] text-white">Nenhum lembrete ainda</p>
            <p className="mt-1 text-[13px]" style={{ color: SCREEN.ink2 }}>
              Quando você marcar uma data com ★, o lembrete aparece aqui.
            </p>
          </div>
        ) : (
          pushes.map((p) => (
            <div key={p.id} className="rounded-[18px] px-4 py-3" style={{ background: SCREEN.card }}>
              <p className="flex items-center justify-between text-[12px]" style={{ color: SCREEN.ink3 }}>
                <span className="font-semibold">{p.title}</span>
                <span>chega {p.when}</span>
              </p>
              <p className="mt-1 text-[14px] leading-snug text-white">{p.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function HorariosScreen() {
  return (
    <div style={{ paddingBottom: BOTTOM_SPACE }}>
      <BlueHeader title="Horários" subtitle="Suas aulas da semana" />
      <div className="px-8 py-16 text-center">
        <Clock className="mx-auto mb-3 size-7" style={{ color: SCREEN.ink3 }} />
        <p className="text-[14px] text-white">Esta aba fica igual à do app</p>
        <p className="mt-1 text-[13px]" style={{ color: SCREEN.ink2 }}>
          A prévia mostra só o calendário acadêmico.
        </p>
      </div>
    </div>
  );
}
