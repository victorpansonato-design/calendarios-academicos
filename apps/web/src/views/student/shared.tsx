import type { CSSProperties, ReactNode } from 'react';
import { BookOpen, CalendarCheck, CalendarDays, ClipboardList, GraduationCap, Info, PartyPopper, Radio, RotateCcw, Sparkles } from 'lucide-react';
import type { Cohort, EventType, Shift } from '@calendarios/core';
import type { StudentEventItem } from '@calendarios/core';
import { Field, Segmented, Select } from '../../components/ui/Fields';
import { Pill } from '../../components/ui/Badges';
import { legibleOn } from '../../lib/color';
import { cn } from '../../lib/utils';
import type { StudentPreviewState } from '../../lib/studentPreview';

/* ==========================================================================
   Peças comuns às prévias do Portal e do App
   --------------------------------------------------------------------------
   · PreviewToolbar — "ver como": calendário, versão, coorte, turno e data.
   · legendStyle    — a cor da legenda do PDF pronta para borda, ponto,
                      fundo tingido e texto, legível no fundo claro ou escuro.
   · TypeIcon       — ícone do tipo, para quando o evento não tem cor
                      (aparece em cinza + ícone, nunca só a cor).
   ========================================================================== */

const GRAY = { light: '#7b8494', dark: '#8b93a1' } as const;

export interface LegendStyle {
  /** Cor exata do PDF (preenchimento de grade, faixas). */
  fill: string;
  /** Cor ajustada para ≥ 3:1 sobre o fundo: borda, ponto, ícone. */
  ink: string;
  /** Fundo tingido para chips e cartões. */
  tint: string;
  hasColor: boolean;
}

export function legendStyle(color: string | null, background: 'light' | 'dark'): LegendStyle {
  if (!color) {
    const g = GRAY[background];
    return { fill: g, ink: g, tint: `color-mix(in oklab, ${g} ${background === 'light' ? 12 : 22}%, transparent)`, hasColor: false };
  }
  const ink = legibleOn(color, background);
  return { fill: color, ink, tint: `color-mix(in oklab, ${color} ${background === 'light' ? 14 : 26}%, transparent)`, hasColor: true };
}

const TYPE_ICON: Record<EventType, typeof Info> = {
  holiday: PartyPopper,
  exam: BookOpen,
  deadline: ClipboardList,
  enrollment: CalendarCheck,
  term_start: GraduationCap,
  term_end: GraduationCap,
  online_event: Radio,
  academic: Sparkles,
  other: CalendarDays,
};

export function TypeIcon({ type, className, style }: { type: EventType; className?: string; style?: CSSProperties }) {
  const Icon = TYPE_ICON[type];
  return <Icon className={className} style={style} aria-hidden />;
}

/** Selo de importância como o aluno lê. */
export function importanceLabel(it: Pick<StudentEventItem, 'why' | 'studentImportance' | 'starred'>): { text: string; tone: 'danger' | 'primary' | 'warning' | 'neutral' } | null {
  if (it.studentImportance === 'high') return { text: 'Não perca', tone: 'danger' };
  if (it.starred) return { text: 'Favorito', tone: 'warning' };
  if (it.studentImportance === 'medium' && it.why === 'medium') return { text: 'Importante', tone: 'primary' };
  return null;
}

/* -- Barra "ver como" ----------------------------------------------------- */

export function PreviewToolbar({ p, children }: { p: StudentPreviewState; children?: ReactNode }) {
  const simulated = p.today !== p.realToday;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] xl:items-end">
        <Field label="Calendário">
          {(id) => (
            <Select id={id} value={p.calendarId ?? ''} onChange={(e) => p.setCalendarId(e.target.value)} disabled={!p.calendars?.length}>
              {(p.calendars ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.year ? ` · ${c.year}/${c.semester ?? ''}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Versão">
          {() => (
            <Segmented
              layoutId="preview-source"
              value={p.source}
              onChange={p.setSource}
              options={[
                { value: 'published', label: 'Publicada' },
                { value: 'draft', label: 'Rascunho' },
              ]}
            />
          )}
        </Field>
        <Field label="Ver como">
          {(id) => (
            <Select id={id} value={p.persona.cohort ?? ''} onChange={(e) => p.setPersona({ ...p.persona, cohort: (e.target.value || null) as Cohort | null })}>
              <option value="">Qualquer aluno</option>
              <option value="ingressantes">Ingressante</option>
              <option value="veteranos">Veterano</option>
            </Select>
          )}
        </Field>
        <Field label="Turno">
          {(id) => (
            <Select id={id} value={p.persona.shift ?? ''} onChange={(e) => p.setPersona({ ...p.persona, shift: (e.target.value || null) as Shift | null })}>
              <option value="">Todos os horários</option>
              <option value="Diurno">Diurno</option>
              <option value="Noturno">Noturno</option>
            </Select>
          )}
        </Field>
        <Field label="Hoje é">
          {(id) => (
            <div className="flex items-center gap-2">
              <input
                id={id}
                type="date"
                value={p.today}
                onChange={(e) => e.target.value && p.setToday(e.target.value)}
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm tabular focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              {simulated && (
                <button
                  type="button"
                  onClick={() => p.setToday(p.realToday)}
                  title="Voltar para hoje"
                  aria-label="Voltar para hoje"
                  className="grid size-10 shrink-0 place-items-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw className="size-4" />
                </button>
              )}
            </div>
          )}
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {p.source === 'draft' ? (
          <Pill tone="warn">{p.hasPublished ? 'Rascunho: ainda não é o que o aluno vê' : 'Rascunho: este calendário ainda não foi publicado'}</Pill>
        ) : (
          <Pill tone="ok">Versão publicada: é o que o aluno vê</Pill>
        )}
        {simulated && <Pill tone="info">Data simulada</Pill>}
        <span>
          {p.persists
            ? 'Estrelas e "ocultar" gravam como um aluno de demonstração e aparecem na Agenda.'
            : 'Estrelas e "ocultar" valem só nesta prévia; ela mostra o lembrete que seria agendado.'}
        </span>
        {children}
      </div>
    </div>
  );
}

/** Classe utilitária para uma pílula de legenda (ponto + nome). */
export function LegendChip({ label, style, className, size = 'sm' }: { label: string; style: LegendStyle; className?: string; size?: 'xs' | 'sm' }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full font-medium',
        size === 'xs' ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-0.5 text-[11.5px]',
        className,
      )}
      style={{ background: style.tint }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: style.fill, boxShadow: `inset 0 0 0 1px ${style.ink}` }} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}
