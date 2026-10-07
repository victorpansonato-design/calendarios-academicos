import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'motion/react';
import { press } from '../../lib/motion';
import { cn } from '../../lib/utils';

/* ==========================================================================
   Button
   --------------------------------------------------------------------------
   As variantes e medidas do template Anchieta (shadcn new-york):

     default     — a ação mais importante da tela. Uma por vista. Azul
                   institucional cheio.
     secondary   — alternativa real à principal.
     outline     — ação neutra com contorno.
     ghost       — terciária; vive dentro de linhas densas e barras.
     destructive — destrutiva ou irreversível (excluir evento, tirar do ar).
     link        — ação em forma de link.

   Por cima do template ficam três coisas nossas: o retorno de toque uniforme
   (`whileTap={press}`, um encolhimento de 2,5%), os atalhos `icon`/`iconRight`
   e o botão quadrado só de ícone (`square`). Os nomes antigos continuam
   valendo — primary → default, danger → destructive, md → default — e o
   padrão continua `secondary`/`sm`, porque é nele que a maior parte das telas
   se apoia.
   ========================================================================== */

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // O template pinta o hover de outline/ghost com --accent (o amarelo da
        // marca). Aqui o hover é neutro: amarelo fica para a assinatura (filete,
        // indicador da navegação), não para dezenas de botões de linha.
        outline: 'border border-border bg-background hover:bg-muted hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-foreground/80 hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        xs: 'h-8 gap-1.5 px-3 text-xs',
        icon: 'h-10 w-10',
        'icon-sm': 'h-9 w-9',
        'icon-xs': 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'sm',
    },
  },
);

type CvaVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type CvaSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

/** Nomes antigos aceitos por compatibilidade com as telas existentes. */
type Variant = CvaVariant | 'primary' | 'danger';
type Size = CvaSize | 'md';

const VARIANT_ALIAS: Record<Variant, CvaVariant> = {
  default: 'default',
  destructive: 'destructive',
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'ghost',
  link: 'link',
  primary: 'default',
  danger: 'destructive',
};

const SIZE_ALIAS: Record<Size, CvaSize> = {
  default: 'default',
  sm: 'sm',
  lg: 'lg',
  xs: 'xs',
  icon: 'icon',
  'icon-sm': 'icon-sm',
  'icon-xs': 'icon-xs',
  md: 'default',
};

/** Tamanho → versão quadrada (só ícone). */
const SQUARE: Partial<Record<CvaSize, CvaSize>> = {
  default: 'icon',
  sm: 'icon-sm',
  xs: 'icon-xs',
  lg: 'icon',
};

/**
 * Os handlers nativos de arrastar/animar colidem com os de mesmo nome do
 * Motion; ficam de fora em vez de silenciados com `any` — nada no app arrasta
 * um botão.
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
  /** Botão quadrado, só com ícone. */
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
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const base = SIZE_ALIAS[size];
  const resolvedSize = square ? SQUARE[base] ?? base : base;

  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled ? undefined : press}
      disabled={disabled}
      className={cn(buttonVariants({ variant: VARIANT_ALIAS[variant], size: resolvedSize }), square && 'px-0', full && 'w-full', className)}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </motion.button>
  );
});

/** Link de texto como ação discreta — usado no fim de rodapés de cartão. */
export function LinkButton({
  children,
  icon,
  iconRight,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; iconRight?: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-primary underline-offset-4',
        'transition-colors hover:underline disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}
