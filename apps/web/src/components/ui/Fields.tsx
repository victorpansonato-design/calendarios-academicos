import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, RefObject, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Search, X } from 'lucide-react';
import { FieldLabel } from './field-label';
import { spring } from '../../lib/motion';
import { cn } from '../../lib/utils';

/* ==========================================================================
   Controles de formulário
   --------------------------------------------------------------------------
   O visual do template Anchieta: campo com contorno, fundo `background`,
   40px de altura e ring de foco semântico. O rótulo é o FieldLabel do
   template (11px, caixa alta, espaçado), com o asterisco de obrigatório em
   amarelo de aviso. A dica fica debaixo do campo, lida depois do valor.

   O Select continua nativo (teclado e celular de graça); o controle
   segmentado, o interruptor e o chip são nossos, com a animação de mola.
   ========================================================================== */

export const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 text-sm text-foreground ring-offset-background ' +
  'transition-[color,box-shadow,border-color] placeholder:text-muted-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/** O mesmo estilo do rótulo, para títulos de grupo que não apontam para um campo só. */
export const LABEL_TEXT = 'text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase';

export function Label({
  children,
  required,
  htmlFor,
  hint,
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <FieldLabel htmlFor={htmlFor} required={required}>
        {children}
      </FieldLabel>
      {hint && <span className="font-mono text-[11px] text-muted-foreground tabular">{hint}</span>}
    </div>
  );
}

export interface FieldProps {
  label?: string;
  required?: boolean;
  hint?: ReactNode;
  help?: ReactNode;
  error?: string;
  children: (id: string) => ReactNode;
  className?: string;
}

export function Field({ label, required, hint, help, error, children, className }: FieldProps) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} required={required} hint={hint}>
          {label}
        </Label>
      )}
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>
      ) : help ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-10 py-2', className)} {...rest} />;
}

export function TextArea({ className, rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(CONTROL, 'min-h-10 resize-y py-2 leading-relaxed', className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(CONTROL, 'h-10 cursor-pointer appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/* -- Busca ---------------------------------------------------------------- */

export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Buscar…',
  className,
  autoFocus,
  inputRef,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** Para quem precisa devolver o cursor ao campo depois de uma ação na tela. */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn(CONTROL, 'h-10 py-2 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onValueChange('')}
          aria-label="Limpar busca"
          className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* -- Controle segmentado -------------------------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  size = 'sm',
  tone = 'plain',
  full = false,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Precisa ser único por instância — é ele que faz a pílula deslizar. */
  layoutId: string;
  size?: 'xs' | 'sm';
  tone?: 'plain' | 'band';
  full?: boolean;
}) {
  const height = size === 'xs' ? 'h-7' : 'h-8';
  const pad = size === 'xs' ? 'px-2.5 text-xs' : 'px-3 text-[13px]';

  return (
    <div
      role="tablist"
      className={cn(
        'shrink-0 items-center gap-0.5 rounded-lg p-0.75',
        tone === 'band' ? 'bg-muted-strong' : 'bg-muted',
        full ? 'flex w-full' : 'inline-flex',
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors',
              height,
              pad,
              full && 'flex-1',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && <motion.span layoutId={layoutId} transition={spring} className="absolute inset-0 rounded-md bg-background shadow-xs" />}
            <span className="relative z-10 flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
              {opt.count !== undefined && (
                <span className={cn('font-mono text-[10.5px] font-medium tabular', active ? 'text-muted-foreground' : 'text-muted-foreground/70')}>{opt.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -- Interruptor ---------------------------------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-[1.15rem] w-8 shrink-0 rounded-full shadow-xs transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <motion.span
          layout
          transition={spring}
          className="absolute top-[0.075rem] h-4 w-4 rounded-full bg-background shadow-sm"
          style={{ left: checked ? 15 : 1 }}
        />
      </button>
    </div>
  );
}

/* -- Chip (filtro de seleção múltipla) ------------------------------------ */

export function Chip({
  active,
  onClick,
  children,
  count,
  tone = 'neutral',
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  tone?: 'neutral' | 'crit';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? tone === 'crit'
            ? 'border-destructive/40 bg-destructive-soft text-destructive'
            : 'border-primary/40 bg-primary-soft text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
      {count !== undefined && <span className="font-mono text-[10.5px] tabular opacity-70">{count}</span>}
    </button>
  );
}
