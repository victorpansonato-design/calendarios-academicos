import type { ReactNode } from 'react';
import { Badge } from './badge';
import { cn } from '../../lib/utils';

/* ==========================================================================
   Vocabulário de status
   --------------------------------------------------------------------------
   Dois tipos de rótulo pequeno, e eles não podem parecer iguais:

     STATUS — um veredito sobre o qual talvez seja preciso agir. Badge suave
              do template, com o ponto na frente: o ponto reforça o estado
              sem depender só da cor.

     TAG    — um fato sobre o registro (modalidade, semestre, canal). Badge
              de contorno, neutro. Não carrega urgência, então não tem cor
              nem ponto.

   `solid` quer dizer "este veredito é o ponto da linha" e gasta peso de
   fonte, não preenchimento.

   Os tons do app continuam os mesmos (ok/warn/risk/crit/info) e são
   traduzidos para os tons do template aqui, num lugar só.
   ========================================================================== */

export type Tone = 'ok' | 'warn' | 'risk' | 'crit' | 'info' | 'neutral' | 'muted';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const TONE: Record<Tone, BadgeTone> = {
  ok: 'success',
  warn: 'warning',
  risk: 'warning',
  crit: 'danger',
  info: 'primary',
  neutral: 'neutral',
  muted: 'neutral',
};

export function Pill({
  tone = 'neutral',
  children,
  dot = true,
  solid = false,
  mono = false,
  className,
  title,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  /** O ponto faz disto um status. Sem ele, é uma tag. */
  dot?: boolean;
  solid?: boolean;
  mono?: boolean;
  className?: string;
  title?: string;
  icon?: ReactNode;
}) {
  if (dot) {
    return (
      <Badge
        variant="soft"
        size="sm"
        dot
        tone={TONE[tone]}
        title={title}
        className={cn('w-fit shrink-0 whitespace-nowrap', solid && 'font-semibold', tone === 'muted' && 'opacity-80', mono && 'font-mono', className)}
      >
        {children}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      size="sm"
      tone={solid ? TONE[tone] : 'neutral'}
      title={title}
      className={cn(
        'w-fit shrink-0 gap-1 whitespace-nowrap',
        solid ? 'font-semibold' : 'text-muted-foreground',
        tone === 'muted' && 'opacity-80',
        mono && 'font-mono',
        className,
      )}
    >
      {icon}
      {children}
    </Badge>
  );
}

/** O estado saudável não tem ponto: nada a fazer, a linha fica quieta. */
export function QuietStatus({ children }: { children: ReactNode }) {
  return <span className="inline-flex shrink-0 items-center text-xs font-medium whitespace-nowrap text-muted-foreground">{children}</span>;
}

/* -- Avatar: iniciais, nunca foto de banco de imagens --------------------- */

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
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium select-none',
        AVATAR_SIZE[size],
        tone === 'brand' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
      )}
    >
      {initials(name)}
    </span>
  );
}
