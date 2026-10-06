import { motion } from 'motion/react';
import { CalendarPlus, EyeOff, Star } from 'lucide-react';
import type { StudentEventItem } from '@calendarios/core';
import { fromISO, MONTH_NAMES, weekdayShort } from '@calendarios/core';
import { Badge } from '../../../components/ui/badge';
import { cn } from '../../../lib/utils';
import { staggerItem } from '../../../lib/motion';
import { importanceLabel, LegendChip, legendStyle, TypeIcon } from '../shared';

/* ==========================================================================
   Peças de evento do Portal do aluno
   --------------------------------------------------------------------------
   O cartão segue os de "Minhas disciplinas" do portal: branco, cantos
   suaves e a cor na borda da esquerda — aqui, a cor da legenda do PDF, que
   nunca aparece sozinha (o nome dela vem no chip logo abaixo do título).
   ========================================================================== */

export type Theme = 'light' | 'dark';

const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3).toUpperCase());

export function StarButton({ starred, onToggle, size = 'md', label }: { starred: boolean; onToggle: () => void; size?: 'sm' | 'md'; label: string }) {
  return (
    <motion.button
      type="button"
      aria-pressed={starred}
      aria-label={starred ? `Remover ${label} dos favoritos` : `Favoritar ${label}`}
      title={starred ? 'Remover dos favoritos' : 'Favoritar: receber um lembrete'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      whileTap={{ scale: 0.86 }}
      className={cn(
        'relative z-10 grid shrink-0 place-items-center rounded-full transition-colors',
        size === 'sm' ? 'size-8' : 'size-9',
        starred ? 'bg-accent-soft text-warning-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <motion.span key={String(starred)} initial={starred ? { scale: 0.4, rotate: -30 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 16 }}>
        <Star className={cn(size === 'sm' ? 'size-4' : 'size-[18px]', starred && 'fill-[var(--brand-yellow)]')} />
      </motion.span>
    </motion.button>
  );
}

export function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** Dia grande + mês + dia da semana; período mostra início → fim. */
export function DateBlock({ item, compact = false }: { item: StudentEventItem; compact?: boolean }) {
  const s = fromISO(item.dates.start);
  const e = fromISO(item.dates.end);
  const dm = (d: { day: number; month: number }) => `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}`;
  if (item.dates.kind === 'range')
    return (
      <div className={cn('flex shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-center', compact ? 'w-14 py-1.5' : 'w-16 py-2')}>
        <span className="text-[13px] font-bold text-foreground tabular">{dm(s)}</span>
        <span className="text-[10px] text-muted-foreground">até</span>
        <span className="text-[13px] font-bold text-foreground tabular">{dm(e)}</span>
      </div>
    );
  return (
    <div className={cn('flex shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-center', compact ? 'w-14 py-1.5' : 'w-16 py-2')}>
      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">{MONTH_ABBR[s.month - 1]}</span>
      <span className={cn('leading-none font-bold text-foreground tabular', compact ? 'text-xl' : 'text-[26px]')}>{s.day}</span>
      <span className="mt-0.5 text-[10px] text-muted-foreground">{item.dates.kind === 'list' ? `+${item.dates.dates.length - 1} data(s)` : weekdayShort(item.dates.start)}</span>
    </div>
  );
}

export function ImportanceBadge({ item }: { item: StudentEventItem }) {
  const imp = importanceLabel(item);
  if (!imp) return null;
  return (
    <Badge tone={imp.tone} size="sm" variant="soft" className="shrink-0">
      {imp.tone === 'warning' && <Star className="size-3 fill-current" aria-hidden />}
      {imp.text}
    </Badge>
  );
}

export interface CardActions {
  onOpen: (uid: string) => void;
  onStar: (uid: string) => void;
  onHide: (uid: string) => void;
  onIcs: (item: StudentEventItem) => void;
}

/** Cartão de "Importantes". */
export function EventCard({ item, theme, actions, animated = true }: { item: StudentEventItem; theme: Theme; actions: CardActions; animated?: boolean }) {
  const ls = legendStyle(item.legendColor, theme);
  const past = item.status === 'past';
  return (
    <motion.article
      variants={animated ? staggerItem : undefined}
      layout="position"
      className={cn('group relative flex gap-3.5 rounded-xl border border-border bg-card p-3.5 shadow-card transition-shadow hover:shadow-md', past && 'opacity-70')}
      style={{ borderLeft: `4px solid ${ls.ink}` }}
    >
      <DateBlock item={item} />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <LegendChip label={item.legendLabel} style={ls} />
          <ImportanceBadge item={item} />
          {item.status === 'ongoing' && (
            <Badge tone="success" size="sm" dot>
              Em andamento
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={() => actions.onOpen(item.uid)}
          className="block text-left text-[15px] leading-snug font-semibold text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          <span className="line-clamp-2">{item.title}</span>
        </button>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
          {!ls.hasColor && <TypeIcon type={item.type} className="size-3.5" />}
          <span className="first-letter:uppercase">{item.friendlyDate}</span>
          {item.timeLabel && <span>· {item.timeLabel}</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <span className={cn('text-[12px] font-semibold whitespace-nowrap', item.daysUntil <= 3 && !past ? 'text-destructive' : 'text-muted-foreground')}>{item.countdown}</span>
        <div className="flex items-center">
          {item.canHide && !item.starred && !past && (
            <IconAction label="Ocultar dos meus importantes" onClick={() => actions.onHide(item.uid)}>
              <EyeOff className="size-4" />
            </IconAction>
          )}
          <IconAction label="Adicionar à agenda" onClick={() => actions.onIcs(item)}>
            <CalendarPlus className="size-4" />
          </IconAction>
          <StarButton starred={item.starred} onToggle={() => actions.onStar(item.uid)} label={item.title} />
        </div>
      </div>
    </motion.article>
  );
}

/** Linha compacta do calendário completo. */
export function EventRow({ item, theme, actions }: { item: StudentEventItem; theme: Theme; actions: CardActions }) {
  const ls = legendStyle(item.legendColor, theme);
  return (
    <li className={cn('group relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-muted/60', item.status === 'past' && 'opacity-65')}>
      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: ls.fill, boxShadow: `inset 0 0 0 1px ${ls.ink}` }} aria-hidden />
      <span className="w-[74px] shrink-0 text-[12px] leading-tight text-muted-foreground tabular">{item.dateLabel}</span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => actions.onOpen(item.uid)}
          className="block w-full truncate text-left text-[13.5px] font-medium text-foreground after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {item.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <LegendChip label={item.legendLabel} style={ls} size="xs" />
          <ImportanceBadge item={item} />
        </div>
      </div>
      <StarButton starred={item.starred} onToggle={() => actions.onStar(item.uid)} size="sm" label={item.title} />
    </li>
  );
}
