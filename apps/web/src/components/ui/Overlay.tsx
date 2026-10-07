import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { drawerVariants, modalVariants, scrimVariants } from '../../lib/motion';
import { Button } from './button';

/* ==========================================================================
   Modal & Drawer
   --------------------------------------------------------------------------
   One overlay implementation, so every dialog in the app behaves identically:

     · The app behind is blurred and desaturated, not just dimmed — the sheet
       reads as floating glass over the workspace rather than a box on a grey
       rectangle. The sheet itself wears the template's dialog skin
       (background, border, 12px radius, blue-tinted shadow).
     · Escape closes. Clicking the scrim closes. The close button closes.
     · Focus moves into the sheet on open, is trapped inside while open, and
       returns to the trigger on close.
     · Body scroll is locked with the scrollbar width compensated, so the page
       underneath does not shift sideways when the dialog appears.
     · Exit animations actually run, because the AnimatePresence boundary lives
       here rather than around an early `return null`.
   ========================================================================== */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useOverlayBehaviour(open: boolean, onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Lock scroll and compensate for the disappearing scrollbar.
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    const focusFirst = window.setTimeout(() => {
      const node = sheetRef.current;
      if (!node) return;
      const target =
        node.querySelector<HTMLElement>('[data-autofocus]') ??
        node.querySelector<HTMLElement>(FOCUSABLE) ??
        node;
      target.focus({ preventScroll: true });
    }, 60);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const node = sheetRef.current;
      if (!node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.clearTimeout(focusFirst);
      document.removeEventListener('keydown', onKeyDown, true);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      restoreTo.current?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  return sheetRef;
}

/* -- Modal ---------------------------------------------------------------- */

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const MODAL_WIDTH: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  size?: ModalSize;
  /** Sticky footer — action row. */
  footer?: ReactNode;
  children: ReactNode;
  /** Accepted for compatibility. The blue-band header variant was retired;
      a dialog earns attention from its content, not from a coloured strip. */
  tone?: 'plain' | 'band';
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  icon,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  const sheetRef = useOverlayBehaviour(open, onClose);
  const titleId = useId();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="scrim fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-[6vh] sm:p-6 sm:py-[8vh]"
          variants={scrimVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={[
              'relative flex w-full flex-col overflow-hidden outline-none',
              'rounded-xl border border-border bg-background text-foreground shadow-xl',
              'max-h-[86vh]',
              MODAL_WIDTH[size],
            ].join(' ')}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="relative flex min-w-0 items-start gap-3">
                {icon && (
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground/80">
                    {icon}
                  </div>
                )}
                <div className="min-w-0">
                  {eyebrow && (
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">{eyebrow}</div>
                  )}
                  <h2 id={titleId} className="font-display text-[18px] leading-tight font-medium text-foreground">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="relative -mt-0.5 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">{children}</div>

            {footer && (
              <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/50 px-5 py-3.5">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -- Drawer --------------------------------------------------------------- */

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Rendered inside the sheet; drawers own their own header layout. */
  children: ReactNode;
  width?: 'md' | 'lg' | 'xl';
  label: string;
}

const DRAWER_WIDTH = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-3xl',
} as const;

export function Drawer({ open, onClose, children, width = 'lg', label }: DrawerProps) {
  const sheetRef = useOverlayBehaviour(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="scrim fixed inset-0 z-50 flex justify-end"
          variants={scrimVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.aside
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            variants={drawerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={[
              'relative flex h-full w-full flex-col overflow-hidden outline-none',
              'border-l border-border bg-background text-foreground shadow-lg',
              DRAWER_WIDTH[width],
            ].join(' ')}
          >
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -- Confirm dialog ------------------------------------------------------- */

export interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
}

/** Confirmação para ações destrutivas ou que saem do sistema (publicar, enviar, excluir). */
export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  busy = false,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy} data-autofocus>
            {busy ? 'Aguarde…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="px-5 py-4 text-sm leading-relaxed text-foreground/80">{message}</div>
    </Modal>
  );
}
