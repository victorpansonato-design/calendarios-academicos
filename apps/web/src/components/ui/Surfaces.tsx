import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Inbox } from 'lucide-react';
import { emphasis, press } from '../../lib/motion';

/* ==========================================================================
   Surfaces & layout primitives
   --------------------------------------------------------------------------
   A card is a lighter surface and a 12px radius. That is the whole recipe.

   No border: a hairline around every box turns a dense screen into a stack of
   picture frames, and the eye has to parse the frame before it can read the
   content. Contrast alone separates a card from the canvas, with less ink.

   No shadow either. Nothing on a page is floating — it is laid out. Only
   overlays, which genuinely sit above the app, cast one.

   Hairlines still exist, but only as dividers: between rows of a list, between
   sections of a card, under a section label. A line that separates is useful.
   A line that encloses is decoration.
   ========================================================================== */

export function Card({
  children,
  className = '',
  padded = true,
  tone = 'plain',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /** `inset` and `band` are both "one step of contrast" — no hue, no frame. */
  tone?: 'plain' | 'inset' | 'band';
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  const toneClass = tone === 'plain' ? 'bg-surface' : 'bg-surface-2';

  return (
    <Tag className={['rounded-xl', toneClass, padded ? 'p-5' : '', className].join(' ')}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  eyebrow,
  action,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Use only when it names a real section. Not on every card. */
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
            {eyebrow}
          </div>
        )}
        <h2 className="text-[15px] leading-tight font-semibold text-ink">{title}</h2>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-3">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/* -- Page header ---------------------------------------------------------- */

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
  /** Filter bar or segmented controls belonging to this page. */
  children?: ReactNode;
}) {
  return (
    <header className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1.5 flex items-center gap-2 text-[12px] font-medium text-ink-3">
              {eyebrow}
            </div>
          )}
          <h1 className="text-[24px] leading-[1.15] font-semibold text-ink sm:text-[30px]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-3">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/* -- Section divider with a label ----------------------------------------
   Sentence case, not a mono all-caps eyebrow. Uppercase mono repeated a dozen
   times per screen reads as texture, and texture is what makes a dense tool
   tiring to look at for eight hours. */

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2">
      <h2 className="text-[12px] font-semibold text-ink-3">{children}</h2>
      {action}
    </div>
  );
}

/* -- Stat tile ------------------------------------------------------------ */

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
  /** Status hue for the value, when the metric carries a verdict. */
  accent?: string;
}) {
  const interactive = Boolean(onClick);

  const body = (
    <>
      <div className="relative flex items-start justify-between gap-3">
        <span className="text-[12px] font-medium text-ink-3">{label}</span>
        {icon && <span className="text-ink-4">{icon}</span>}
      </div>

      <div className="relative mt-2 flex items-baseline gap-2">
        <span
          className="font-mono text-[24px] leading-none font-medium tracking-tight"
          style={accent ? { color: accent } : undefined}
        >
          <span className={accent ? '' : 'text-ink'}>{value}</span>
        </span>
        {detail && <span className="text-[12px] text-ink-3">{detail}</span>}
      </div>

      {footer && (
        <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-2.5 text-[11px] text-ink-3">
          {footer}
        </div>
      )}
    </>
  );

  const surface = tone === 'band' ? 'bg-surface-2' : 'bg-surface';

  if (interactive) {
    return (
      <motion.button
        type="button"
        whileTap={press}
        onClick={onClick}
        className={`flex flex-col rounded-xl p-4 text-left transition-colors hover:bg-surface-hover ${surface}`}
      >
        {body}
      </motion.button>
    );
  }

  return <div className={`flex flex-col rounded-xl p-4 ${surface}`}>{body}</div>;
}

/* -- Metric: a number with no box around it -------------------------------
   For the handful of figures that open a screen. They are separated by
   whitespace, not by five little cards in a row. */

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
        className={[
          'block font-mono text-[30px] leading-none font-medium tracking-tight',
          tone === 'crit' ? 'text-crit-ink' : tone === 'brand' ? 'text-brand-text' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </span>
      <span
        className={[
          'mt-2 block text-[12px] font-medium',
          tone === 'brand' ? 'text-ink-2' : 'text-ink-3',
        ].join(' ')}
      >
        {label}
      </span>
    </>
  );

  if (onClick) {
    return (
      <motion.button
        type="button"
        whileTap={press}
        onClick={onClick}
        className="min-w-0 text-left transition-opacity hover:opacity-60"
      >
        {inner}
      </motion.button>
    );
  }
  return <div className="min-w-0">{inner}</div>;
}

/* -- Row: the clickable list item used across queues and directories ------ */

export function Row({
  children,
  onClick,
  active = false,
  className = '',
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
      className={[
        'relative block w-full text-left transition-colors',
        onClick ? 'cursor-pointer' : '',
        active ? 'bg-surface-2' : onClick ? 'hover:bg-surface-hover' : '',
        className,
      ].join(' ')}
    >
      {/* Left rail marks the active row and, in red, a breached one. */}
      {(active || tone === 'crit') && (
        <span
          className={['absolute inset-y-0 left-0 w-0.5', active ? 'bg-brand' : 'bg-crit'].join(' ')}
        />
      )}
      {children}
    </Tag>
  );
}

/* -- Empty state ---------------------------------------------------------- */

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
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-6 py-10' : 'gap-3 px-6 py-16',
      ].join(' ')}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-4">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <div>
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        {message && (
          <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-ink-3">{message}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* -- Skeleton ------------------------------------------------------------- */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-md ${className}`} />;
}

/* -- Definition list ------------------------------------------------------ */

export function DataList({
  items,
  columns = 2,
  className = '',
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
    <dl className={`grid gap-x-5 gap-y-3 ${grid} ${className}`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-medium text-ink-4">{item.label}</dt>
          <dd
            className={[
              'mt-0.5 text-[13px] font-medium',
              item.tone === 'crit' ? 'text-crit-ink' : 'text-ink',
            ].join(' ')}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* -- Callout --------------------------------------------------------------
   A tinted box with a matching border was the loudest thing on the page. The
   tone now lives in a 2px rail on the left edge; the box itself is just the
   inset surface. Same hierarchy, a fraction of the ink. */

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
  const rail = {
    info: 'bg-brand',
    warn: 'bg-warn',
    crit: 'bg-crit',
    ok: 'bg-ink-4',
  }[tone];

  const textClass = {
    info: 'text-ink',
    warn: 'text-warn-ink',
    crit: 'text-crit-ink',
    ok: 'text-ink',
  }[tone];

  return (
    <div className="relative flex gap-2.5 overflow-hidden rounded-lg bg-surface-2 p-3.5 pl-4">
      <span className={`absolute inset-y-0 left-0 w-0.5 ${rail}`} />
      {icon && <span className={`mt-px shrink-0 ${textClass}`}>{icon}</span>}
      <div className="min-w-0 text-[12px] leading-relaxed">
        {title && <p className={`font-semibold ${textClass}`}>{title}</p>}
        {children && <div className={`${title ? 'mt-1' : ''} text-ink-2`}>{children}</div>}
      </div>
    </div>
  );
}

/* -- Tab bar (underline style) ------------------------------------------- */

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
    <div
      role="tablist"
      className="scroll-slim -mb-px flex gap-1 overflow-x-auto border-b border-hairline"
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={[
              'relative shrink-0 px-3.5 py-2.5 text-[13px] transition-colors',
              active ? 'font-semibold text-ink' : 'font-medium text-ink-3 hover:text-ink',
            ].join(' ')}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={[
                    'rounded-sm px-1.5 py-px font-mono text-[10px] font-medium',
                    active ? 'bg-surface-3 text-ink-2' : 'bg-surface-2 text-ink-4',
                  ].join(' ')}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ duration: 0.22, ease: emphasis }}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -- Disclosure ----------------------------------------------------------- */

export function ChevronAffordance({ className = '' }: { className?: string }) {
  return (
    <ChevronRight
      className={`h-4 w-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 ${className}`}
    />
  );
}
