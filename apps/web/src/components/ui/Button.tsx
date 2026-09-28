import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'motion/react';
import { press } from '../../lib/motion';

/* ==========================================================================
   Button
   --------------------------------------------------------------------------
   Buttons are pills, surfaces are 12px rectangles. Two shapes for the whole
   app, so the silhouette alone says whether a thing is a place or an action —
   which is why a button needs no outline to read as a button.

   Variants carry meaning rather than a look:

     primary   — the single most important action on the surface. One per view.
                 The one place institutional blue fills a shape.
     secondary — a real alternative to primary. Filled with the inset surface,
                 never outlined.
     ghost     — tertiary; lives inside dense rows and toolbars.
     danger    — destructive or irreversible (deleting an event, archiving).

   Press feedback is uniform across the app: a 2.5% scale-down. Nothing else.
   ========================================================================== */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'xs' | 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-crit text-white hover:brightness-110',
};

/**
 * Geometry is split from padding on purpose. Emitting both `px-3.5` and `px-0`
 * and hoping the second wins does not work: Tailwind decides the order in the
 * stylesheet, not the class attribute, so `px-3.5` won and a 32px square button
 * ended up with 28px of padding, squeezing its 14px icon down to 4px. A square
 * button now simply never receives horizontal padding.
 */
const SIZE: Record<Size, string> = {
  xs: 'h-7 text-[12px] gap-1.5 rounded-full',
  sm: 'h-8 text-[13px] gap-1.5 rounded-full',
  md: 'h-9.5 text-[13px] gap-2 rounded-full',
};

const PAD: Record<Size, string> = {
  xs: 'px-3',
  sm: 'px-3.5',
  md: 'px-4.5',
};

const SQUARE: Record<Size, string> = {
  xs: 'w-7',
  sm: 'w-8',
  md: 'w-9.5',
};

/**
 * React's native drag/animation handlers collide with Framer Motion's
 * same-named props, so they are omitted rather than cast away — nothing in the
 * app drags a button, and silencing the clash with `any` would hide real errors.
 */
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
>;

export interface ButtonProps extends NativeButtonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Renders as a square icon-only control. */
  square?: boolean;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'sm',
    icon,
    iconRight,
    square = false,
    full = false,
    className = '',
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const shape = square ? SQUARE[size] : PAD[size];

  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled ? undefined : press}
      disabled={disabled}
      className={[
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap',
        'transition-colors duration-150 select-none',
        'disabled:pointer-events-none disabled:opacity-45',
        SIZE[size],
        shape,
        VARIANT[variant],
        full ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </motion.button>
  );
});

/** Text link styled as an inline action — used at the end of card footers. */
export function LinkButton({
  children,
  icon,
  iconRight,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; iconRight?: ReactNode }) {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2',
        'transition-colors hover:text-ink disabled:opacity-45',
        className,
      ].join(' ')}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}
