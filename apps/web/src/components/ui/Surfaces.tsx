import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Inbox } from 'lucide-react';
import { calloutVariants } from './callout';
import { LABEL_TEXT } from './Fields';
import { emphasis, press } from '../../lib/motion';
import { cn } from '../../lib/utils';

/* ==========================================================================
   Superfícies e primitivas de layout
   --------------------------------------------------------------------------
   O cartão do template Anchieta: fundo `card`, borda, raio de 12px e a
   sombra sutil tingida de azul (`shadow-card`). Sobre a janela branca do
   canvas, é a borda que separa um bloco do outro.

   Blocos de ênfase sem moldura (`inset`/`band`) usam o preenchimento sutil
   `surface`. Os títulos de página e de seção usam a fonte de exibição do
   template (JetBrains Mono), e a página assina com o filete amarelo.

   As APIs são as mesmas de antes — as telas não mudaram, só a pele.
   ========================================================================== */

export function Card({
  children,
  className,
  padded = true,
  tone = 'plain',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /** `inset` e `band` são o preenchimento sutil, sem borda. */
  tone?: 'plain' | 'inset' | 'band';
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  const toneClass = tone === 'plain' ? 'border border-border bg-card text-card-foreground shadow-card' : 'bg-surface text-surface-foreground';

  return <Tag className={cn('rounded-xl', toneClass, padded && 'p-5', className)}>{children}</Tag>;
}

/** Cabeçalho de cartão — o SectionHeading do template. */
export function CardHeader({
  title,
  subtitle,
  eyebrow,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Só quando nomeia uma seção de verdade. Não em todo cartão. */
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</div>}
        <h2 className="font-display text-[15px] leading-tight font-medium text-foreground">{title}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/* -- Cabeçalho de página ---------------------------------------------------
   O PageHeader do template: eyebrow, título de exibição em 28px, descrição e
   ações à direita, fechando com o filete amarelo de 48 × 2px. O que é da
   página (avisos, abas) vem depois do filete. */

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Avisos e abas que pertencem a esta página. */
  children?: ReactNode;
}) {
  return (
    <header className={cn('pt-2', !children && 'border-b border-border pb-6')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</div>
          )}
          <h1 className="font-display text-[28px] leading-[1.05] font-medium text-foreground">{title}</h1>
          {description && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {/* Filete amarelo institucional — assinatura Anchieta */}
      <div className="mt-6 h-0.5 w-12 rounded-full bg-accent" aria-hidden />
      {children && <div className="mt-5 space-y-4">{children}</div>}
    </header>
  );
}

/* -- Rótulo de seção -------------------------------------------------------
   O eyebrow do template (11px, caixa alta, espaçado) sobre um divisor. */

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
      <h2 className={LABEL_TEXT}>{children}</h2>
      {action}
    </div>
  );
}

/* -- Indicador ------------------------------------------------------------ */

export function StatTile({
  label,
  value,
  detail,
  footer,
  icon,
  tone = 'plain',
  onClick,
  accent,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  tone?: 'plain' | 'band';
  onClick?: () => void;
  /** Cor de status do valor, quando o número carrega um veredito. */
  accent?: string;
}) {
  const interactive = Boolean(onClick);

  const body = (
    <>
      <div className="relative flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>

      <div className="relative mt-2 flex items-baseline gap-2">
        <span className="font-display text-[24px] leading-none font-medium tabular" style={accent ? { color: accent } : undefined}>
          <span className={accent ? '' : 'text-foreground'}>{value}</span>
        </span>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </div>

      {footer && (
        <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px] text-muted-foreground">{footer}</div>
      )}
    </>
  );

  const surface = tone === 'band' ? 'bg-surface' : 'border border-border bg-card shadow-card';

  if (interactive) {
    return (
      <motion.button type="button" whileTap={press} onClick={onClick} className={cn('flex flex-col rounded-xl p-4 text-left transition-colors hover:bg-muted/50', surface)}>
        {body}
      </motion.button>
    );
  }

  return <div className={cn('flex flex-col rounded-xl p-4', surface)}>{body}</div>;
}

/* -- Métrica: um número sem caixa em volta ---------------------------------
   Para os poucos números que abrem uma tela. Separados por espaço, não por
   cinco cartõezinhos em fila. */

export function Metric({
  label,
  value,
  onClick,
  tone = 'plain',
}: {
  label: ReactNode;
  value: ReactNode;
  onClick?: () => void;
  /**
   * `brand` marca o número que responde "e agora?" numa fileira de números que
   * apenas descrevem. Um por fileira — dois já viram wallpaper e o olho volta a
   * ter de ler todos.
   */
  tone?: 'plain' | 'crit' | 'brand';
}) {
  const inner = (
    <>
      <span
        className={cn(
          'block font-display text-[30px] leading-none font-medium tabular',
          tone === 'crit' ? 'text-destructive' : tone === 'brand' ? 'text-primary' : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className={cn('mt-2 block text-xs font-medium', tone === 'brand' ? 'text-foreground/80' : 'text-muted-foreground')}>{label}</span>
    </>
  );

  if (onClick) {
    return (
      <motion.button type="button" whileTap={press} onClick={onClick} className="min-w-0 text-left transition-opacity hover:opacity-60">
        {inner}
      </motion.button>
    );
  }
  return <div className="min-w-0">{inner}</div>;
}

/* -- Linha: o item clicável das filas e listas ---------------------------- */

export function Row({
  children,
  onClick,
  active = false,
  className,
  tone = 'plain',
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  tone?: 'plain' | 'crit';
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      {...(onClick ? { type: 'button' as const } : {})}
      className={cn(
        'relative block w-full text-left transition-colors',
        onClick && 'cursor-pointer',
        active ? 'bg-muted' : onClick ? 'hover:bg-muted/50' : '',
        className,
      )}
    >
      {/* O trilho à esquerda marca a linha ativa e, em vermelho, a que falhou. */}
      {(active || tone === 'crit') && <span className={cn('absolute inset-y-0 left-0 w-0.5', active ? 'bg-primary' : 'bg-destructive')} />}
      {children}
    </Tag>
  );
}

/* -- Estado vazio ----------------------------------------------------------
   O EmptyState do template (ícone num círculo de 48px, título de exibição,
   dica) — sem a caixa tracejada, porque aqui ele quase sempre já mora
   dentro de um cartão. */

export function EmptyState({
  title,
  message,
  icon,
  action,
  compact = false,
}: {
  title: string;
  message?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-6 py-10' : 'px-6 py-14')}>
      <span className="mb-4 grid size-12 place-items-center rounded-full border border-border bg-card text-muted-foreground" aria-hidden>
        {icon ?? <Inbox className="h-5 w-5" />}
      </span>
      <p className="font-display text-[15px] font-medium text-foreground">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

/* -- Skeleton ------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md', className)} />;
}

/* -- Lista de definições -------------------------------------------------- */

export function DataList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: ReactNode; tone?: 'plain' | 'crit' | 'ok' }[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const grid = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  }[columns];
  return (
    <dl className={cn('grid gap-x-5 gap-y-3', grid, className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className={LABEL_TEXT}>{item.label}</dt>
          <dd className={cn('mt-1 text-sm font-medium', item.tone === 'crit' ? 'text-destructive' : 'text-foreground')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -- Aviso -----------------------------------------------------------------
   O Callout do template (faixa com borda e fundo suave no tom). Os tons do
   app são traduzidos aqui: warn → warning, crit → danger, ok → success. */

const CALLOUT_TONE = { info: 'info', warn: 'warning', crit: 'danger', ok: 'success' } as const;

export function Callout({
  children,
  tone = 'info',
  icon,
  title,
}: {
  children?: ReactNode;
  tone?: 'info' | 'warn' | 'crit' | 'ok';
  icon?: ReactNode;
  title?: ReactNode;
}) {
  const t = CALLOUT_TONE[tone];
  return (
    <div role={t === 'danger' ? 'alert' : 'note'} className={calloutVariants({ tone: t, variant: 'banner' })}>
      {icon && (
        <span className="mt-0.5 shrink-0 [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5 leading-snug">
        {title && <strong className="font-semibold">{title}</strong>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

/* -- Abas (sublinhado) ---------------------------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
}) {
  return (
    <div role="tablist" className="scroll-slim -mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative shrink-0 px-3.5 py-2.5 text-sm font-medium transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'rounded-sm px-1.5 py-px font-mono text-[10px] font-medium tabular',
                    active ? 'bg-muted-strong text-foreground/80' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ duration: 0.22, ease: emphasis }}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -- Indicação de "abre" -------------------------------------------------- */

export function ChevronAffordance({ className }: { className?: string }) {
  return <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5', className)} />;
}
