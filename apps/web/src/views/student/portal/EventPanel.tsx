import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, CalendarDays, CalendarPlus, ChevronDown, Clock, ExternalLink, EyeOff, Eye, FileText, Info, Link2, MapPin, Star, X } from 'lucide-react';
import type { StudentEventItem } from '@calendarios/core';
import { weekdayLong } from '@calendarios/core';
import { Button } from '../../../components/ui/button';
import { collapseVariants, drawerVariants, scrimVariants } from '../../../lib/motion';
import { cn } from '../../../lib/utils';
import { LegendChip, legendStyle } from '../shared';
import { ImportanceBadge, type Theme } from './EventBits';

/* ==========================================================================
   Detalhe do evento — painel dentro da janela do portal
   --------------------------------------------------------------------------
   Abre por cima do conteúdo do portal (não da tela de gestão inteira), como
   abriria no portal de verdade. A seção "Lembrete" responde a dúvida que o
   aluno tem ao favoritar: "vou ser avisado? quando?".
   ========================================================================== */

export interface PanelProps {
  item: StudentEventItem | null;
  theme: Theme;
  /** Quando o lembrete do favorito sai, se a prévia já calculou. */
  reminderWhen: string | null;
  pdfHref: string | null;
  onClose: () => void;
  onStar: (uid: string) => void;
  onHide: (uid: string) => void;
  onIcs: (item: StudentEventItem) => void;
}

export function EventPanel({ item, theme, reminderWhen, pdfHref, onClose, onStar, onHide, onIcs }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [official, setOfficial] = useState(false);

  useEffect(() => {
    if (!item) return;
    setOfficial(false);
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const ls = item ? legendStyle(item.legendColor, theme) : null;

  return (
    <AnimatePresence>
      {item && ls && (
        <>
          <motion.div key="scrim" variants={scrimVariants} initial="initial" animate="animate" exit="exit" onClick={onClose} className="absolute inset-0 z-30 bg-black/25 backdrop-blur-[1px]" aria-hidden />
          <motion.div
            key="panel"
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={item.title}
            variants={drawerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[430px] flex-col border-l border-border bg-background shadow-xl outline-none"
          >
            <div className="h-1.5 shrink-0" style={{ background: ls.fill }} aria-hidden />
            <header className="flex items-start gap-3 border-b border-border px-5 pt-4 pb-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <LegendChip label={item.legendLabel} style={ls} />
                  <ImportanceBadge item={item} />
                </div>
                <h2 className="text-[19px] leading-snug font-bold text-foreground">{item.title}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="size-4" />
              </button>
            </header>

            <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 text-[13.5px] leading-relaxed text-foreground/85">
              <ul className="space-y-2.5">
                <li className="flex gap-3">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-semibold text-foreground first-letter:uppercase">{item.friendlyDate}</span>
                    {item.dates.kind !== 'list' && <span className="text-muted-foreground"> · {weekdayLong(item.dates.start)}</span>}
                    <span className={cn('mt-1 block w-fit rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', item.status === 'past' ? 'bg-muted text-muted-foreground' : 'bg-primary-soft text-primary')}>{item.countdown}</span>
                  </span>
                </li>
                {item.shiftTimes.length > 0 && (
                  <li className="flex gap-3">
                    <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span>{item.shiftTimes.map((t) => (t.shift ? `${t.shift}: ${t.time.replace(':', 'h')}` : t.time.replace(':', 'h'))).join(' · ')}</span>
                  </li>
                )}
                {item.location && (
                  <li className="flex gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span>{item.location}</span>
                  </li>
                )}
                {item.urls.map((u) => (
                  <li key={u} className="flex gap-3">
                    <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <a href={u} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-primary hover:underline">
                      {u.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  </li>
                ))}
              </ul>

              {item.details.length > 0 && (
                <div className="space-y-2">
                  {item.details.map((d) => (
                    <p key={d}>{d}</p>
                  ))}
                </div>
              )}

              {item.notes.map((n) => (
                <div key={n} className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-[13px] text-warning-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <span>{n}</span>
                </div>
              ))}

              <section className="rounded-xl border border-border bg-surface p-4">
                <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <BellRing className="size-3.5" /> Lembrete
                </p>
                <p className="text-[13.5px] text-foreground">
                  {item.calendarReminder.enabled
                    ? `A UniAnchieta avisa todos os alunos: ${item.calendarReminder.labels.join(', ').toLowerCase()}.`
                    : item.starred
                      ? reminderWhen
                        ? `Você vai receber um lembrete em ${reminderWhen}.`
                        : item.status === 'ongoing'
                        ? 'Você marcou esta data. Ela já está acontecendo, então não há lembrete a agendar.'
                        : 'Você marcou esta data. O horário do lembrete já passou.'
                      : 'Marque com ★ para receber um lembrete 1 dia antes, às 9h.'}
                </p>
              </section>

              <div className="flex flex-wrap gap-2">
                <Button variant={item.starred ? 'outline' : 'default'} icon={<Star className={cn('size-4', item.starred && 'fill-[var(--brand-yellow)] text-warning-foreground')} />} onClick={() => onStar(item.uid)}>
                  {item.starred ? 'Remover dos favoritos' : 'Favoritar'}
                </Button>
                <Button variant="outline" icon={<CalendarPlus className="size-4" />} onClick={() => onIcs(item)}>
                  Adicionar à agenda
                </Button>
                {item.canHide && !item.starred && (
                  <Button variant="ghost" icon={item.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />} onClick={() => onHide(item.uid)}>
                    {item.hidden ? 'Voltar aos importantes' : 'Ocultar'}
                  </Button>
                )}
              </div>

              {(item.officialText || pdfHref) && (
                <section className="border-t border-border pt-4">
                  <button type="button" onClick={() => setOfficial((v) => !v)} aria-expanded={official} className="flex w-full items-center gap-2 text-[13px] font-semibold text-foreground">
                    <FileText className="size-4 text-muted-foreground" />
                    Texto oficial do PDF
                    <ChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', official && 'rotate-180')} />
                  </button>
                  <AnimatePresence initial={false}>
                    {official && (
                      <motion.div variants={collapseVariants} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                        {item.officialText && <p className="mt-3 rounded-lg bg-muted px-3 py-2.5 text-[12.5px] whitespace-pre-line text-foreground/80">{item.officialText}</p>}
                        {pdfHref && (
                          <a href={pdfHref} target="_blank" rel="noopener noreferrer" className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
                            Abrir PDF oficial <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
