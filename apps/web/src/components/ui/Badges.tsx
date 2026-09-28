import type { ReactNode } from 'react';

/* ==========================================================================
   Status vocabulary
   --------------------------------------------------------------------------
   There are two kinds of small label in this app and they must not look alike:

     STATUS  — a verdict you may have to act on. Rendered as a coloured dot
               plus a word. No fill, no outline. Ten rows of tinted balloons
               with borders is a bag of sweets; ten rows of dotted words scan
               in one pass and still let a critical row jump out.

     TAG     — a fact about the record (modality, semester, channel). Rendered
               as a quiet filled chip in ink-3. It carries no urgency, so it
               gets no colour and no dot.

   `solid` means "this verdict is the point of the row", and spends ink
   weight instead of fill.
   ========================================================================== */

export type Tone = 'ok' | 'warn' | 'risk' | 'crit' | 'info' | 'neutral' | 'muted';

const DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  risk: 'bg-risk',
  crit: 'bg-crit',
  info: 'bg-brand-2',
  neutral: 'bg-ink-4',
  muted: 'bg-ink-4',
};

/** Ink for an emphasised verdict. Only `crit` gets red. */
const EMPHASIS_INK: Record<Tone, string> = {
  ok: 'text-ink-2',
  warn: 'text-warn-ink',
  risk: 'text-risk-ink',
  crit: 'text-crit-ink',
  info: 'text-brand-text',
  neutral: 'text-ink-2',
  muted: 'text-ink-3',
};

export function Pill({
  tone = 'neutral',
  children,
  dot = true,
  solid = false,
  mono = false,
  className = '',
  title,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  /** A dot makes this a status. Without it, it is a tag. */
  dot?: boolean;
  solid?: boolean;
  mono?: boolean;
  className?: string;
  title?: string;
  icon?: ReactNode;
}) {
  if (dot) {
    return (
      <span
        title={title}
        className={[
          'inline-flex shrink-0 items-center gap-1.5 text-[12px] whitespace-nowrap',
          solid ? `font-semibold ${EMPHASIS_INK[tone]}` : 'font-medium text-ink-2',
          mono ? 'font-mono' : '',
          className,
        ].join(' ')}
      >
        <span className={`h-1.25 w-1.25 shrink-0 rounded-full ${DOT[tone]}`} />
        {children}
      </span>
    );
  }

  return (
    <span
      title={title}
      className={[
        'inline-flex shrink-0 items-center gap-1 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] whitespace-nowrap',
        solid ? `font-semibold ${EMPHASIS_INK[tone]}` : 'font-medium text-ink-3',
        mono ? 'font-mono' : '',
        className,
      ].join(' ')}
    >
      {icon}
      {children}
    </span>
  );
}

/** The healthy state has no dot: nothing to do, so the row stays quiet. */
export function QuietStatus({ children }: { children: ReactNode }) {
  return <span className="inline-flex shrink-0 items-center text-[12px] font-medium whitespace-nowrap text-ink-3">{children}</span>;
}

/* -- Avatar: initials, never stock photos --------------------------------- */

const AVATAR_SIZE = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-[12px]',
  lg: 'h-12 w-12 text-[15px]',
} as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, size = 'sm', tone = 'neutral' }: { name: string; size?: keyof typeof AVATAR_SIZE; tone?: 'neutral' | 'brand' }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium select-none',
        AVATAR_SIZE[size],
        tone === 'brand' ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-2',
      ].join(' ')}
    >
      {initials(name)}
    </span>
  );
}
