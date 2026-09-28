import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toastVariants } from '../../lib/motion';

/* ==========================================================================
   Toast — a confirmação visível depois de salvar
   --------------------------------------------------------------------------
   Toda gravação responde com uma frase curta ("Evento salvo."). Erros ficam
   mais tempo na tela e vêm com a mensagem da API, já em português.
   Anunciado para leitores de tela via aria-live.
   ========================================================================== */

interface Toast {
  id: number;
  tone: 'ok' | 'error';
  message: string;
}

const ToastContext = createContext<{ ok: (m: string) => void; error: (m: unknown) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Toast['tone'], message: string) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-2), { id, tone, message }]);
      window.setTimeout(() => remove(id), tone === 'error' ? 8000 : 3800);
    },
    [remove],
  );
  const value = useMemo(
    () => ({
      ok: (m: string) => push('ok', m),
      error: (e: unknown) => push('error', e instanceof Error ? e.message : String(e)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              variants={toastVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl bg-surface p-3.5 pr-2 shadow-overlay"
            >
              {t.tone === 'ok' ? <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-ink-2" /> : <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-crit" />}
              <p className={`min-w-0 flex-1 text-[13px] leading-snug ${t.tone === 'error' ? 'font-medium text-crit-ink' : 'font-medium text-ink'}`}>{t.message}</p>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Fechar aviso"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fora do ToastProvider');
  return ctx;
}
