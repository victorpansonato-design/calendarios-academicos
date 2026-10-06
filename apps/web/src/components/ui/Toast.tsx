import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { useTheme } from '../../lib/theme';

/* ==========================================================================
   Toast — a confirmação visível depois de salvar
   --------------------------------------------------------------------------
   Toda gravação responde com uma frase curta ("Evento salvo."). Erros ficam
   mais tempo na tela e vêm com a mensagem da API, já em português.

   Por baixo é o Sonner, o mesmo do template Anchieta (anuncia para leitores
   de tela, empilha e some sozinho). A API das telas não mudou:
   `const toast = useToast(); toast.ok('…'); toast.error(e);`
   ========================================================================== */

export function ToastProvider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();
  return (
    <>
      {children}
      <Toaster
        position="top-center"
        theme={resolved}
        visibleToasts={3}
        closeButton
        toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }}
      />
    </>
  );
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useToast() {
  return useMemo(
    () => ({
      ok: (m: string) => {
        toast.success(m, { duration: 3800 });
      },
      error: (e: unknown) => {
        toast.error(message(e), { duration: 8000 });
      },
    }),
    [],
  );
}
