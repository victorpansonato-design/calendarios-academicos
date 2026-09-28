import { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';
import { AnchietaLogo } from '../components/brand/AnchietaLogo';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Surfaces';
import { api } from '../lib/api';
import { setSession } from '../lib/session';
import { emphasis } from '../lib/motion';

/* ==========================================================================
   Login
   --------------------------------------------------------------------------
   Visual apenas, por enquanto: "Entrar com a conta Microsoft" cria a sessão
   de desenvolvimento, sem Outlook. Quando a TI ligar o Entra ID
   (AUTH_MODE=entra), este mesmo botão passa a redirecionar para a Microsoft.
   ========================================================================== */

export function LoginView() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api.login();
      setSession({ token, user });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: emphasis } }}
        className="w-full max-w-sm"
      >
        <div className="rounded-xl bg-surface p-7 sm:p-8">
          <AnchietaLogo className="h-11 w-auto" />
          <h1 className="mt-7 text-[24px] leading-[1.15] font-semibold text-ink">Calendários acadêmicos</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            Importe, confira e publique os calendários da UniAnchieta, e programe os avisos para os alunos.
          </p>

          <Button variant="primary" size="md" full className="mt-7" icon={<LogIn className="h-4 w-4" />} onClick={enter} disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar com a conta Microsoft'}
          </Button>
          <p className="mt-3 text-center text-[12px] text-ink-4">Use seu e-mail institucional (Outlook).</p>

          {error && (
            <p role="alert" className="mt-4 text-[12px] font-medium text-crit-ink">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4">
          <Callout tone="info" title="Ambiente de desenvolvimento">
            O acesso com a conta Microsoft será ligado pela TI. Por enquanto, o botão entra direto, sem pedir senha.
          </Callout>
        </div>
        <p className="mt-6 text-center text-[11px] text-ink-4">Centro Universitário Padre Anchieta · Jundiaí</p>
      </motion.div>
    </div>
  );
}
