import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, RefObject, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Search, X } from 'lucide-react';
import { spring } from '../../lib/motion';

/* ==========================================================================
   Form controls
   --------------------------------------------------------------------------
   Controls are filled, not outlined: the inset surface is what says "you can
   type here". An outline would repeat what the fill already says, and would put
   a rectangle back on a screen we just cleared of them.

   The one line a control draws is the focus ring, because that is the only
   moment a boundary carries information. A required field is marked once, next
   to its label, and the hint sits under the control where it is read after the
   value rather than before it.
   ========================================================================== */

const CONTROL =
  'w-full rounded-md bg-surface-2 px-3 text-[13px] text-ink ' +
  'transition-colors placeholder:text-ink-4 hover:bg-surface-3 ' +
  'focus:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-focus ' +
  'disabled:opacity-50';

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
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-ink">
        {children}
        {required && <span className="ml-1 text-crit">*</span>}
      </label>
      {hint && <span className="text-[11px] text-ink-4">{hint}</span>}
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

export function Field({ label, required, hint, help, error, children, className = '' }: FieldProps) {
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
        <p className="mt-1.5 text-[11.5px] font-medium text-crit">{error}</p>
      ) : help ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-4">{help}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} h-9 ${className}`} {...rest} />;
}

export function TextArea({ className = '', rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`${CONTROL} resize-y py-2 leading-relaxed ${className}`} {...rest} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`${CONTROL} h-9 cursor-pointer appearance-none pr-8 ${className}`} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
    </div>
  );
}

/* -- Search box ----------------------------------------------------------- */

export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Buscar…',
  className = '',
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
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={`${CONTROL} h-9 pr-8 pl-9 [&::-webkit-search-cancel-button]:hidden`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onValueChange('')}
          aria-label="Limpar busca"
          className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-4 transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* -- Segmented control ---------------------------------------------------- */

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
  /** Must be unique per instance — drives the sliding pill animation. */
  layoutId: string;
  size?: 'xs' | 'sm';
  tone?: 'plain' | 'band';
  full?: boolean;
}) {
  const height = size === 'xs' ? 'h-7' : 'h-8';
  const pad = size === 'xs' ? 'px-2.5 text-[11.5px]' : 'px-3 text-[12.5px]';

  return (
    <div
      role="tablist"
      className={[
        'shrink-0 items-center gap-0.5 rounded-full p-0.5',
        tone === 'band' ? 'bg-surface-3' : 'bg-surface-2',
        full ? 'flex w-full' : 'inline-flex',
      ].join(' ')}
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
            className={[
              'relative flex items-center justify-center gap-1.5 rounded-full whitespace-nowrap transition-colors',
              height,
              pad,
              full ? 'flex-1' : '',
              active ? 'font-semibold text-ink' : 'font-medium text-ink-3 hover:text-ink',
            ].join(' ')}
          >
            {active && <motion.span layoutId={layoutId} transition={spring} className="absolute inset-0 rounded-full bg-surface" />}
            <span className="relative z-10 flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
              {opt.count !== undefined && (
                <span className={['font-mono text-[10.5px] font-medium', active ? 'text-ink-3' : 'text-ink-4'].join(' ')}>{opt.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -- Toggle switch -------------------------------------------------------- */

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
    <div className="flex items-start justify-between gap-4 rounded-lg bg-surface-2 p-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[13px] font-medium text-ink">
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{description}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-hairline-strong',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
      >
        <motion.span
          layout
          transition={spring}
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm"
          style={{ left: checked ? 18 : 2 }}
        />
      </button>
    </div>
  );
}

/* -- Chip toggle (multi-select filter) ------------------------------------ */

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
      className={[
        'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors',
        active
          ? tone === 'crit'
            ? 'bg-crit font-semibold text-white'
            : 'bg-ink font-semibold text-canvas'
          : 'bg-surface-2 font-medium text-ink-3 hover:bg-surface-3 hover:text-ink',
      ].join(' ')}
    >
      {children}
      {count !== undefined && <span className="font-mono text-[10.5px] opacity-70">{count}</span>}
    </button>
  );
}
