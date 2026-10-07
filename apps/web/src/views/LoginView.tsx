import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';
import { AnchietaLogo } from '../components/brand/AnchietaLogo';
import { Button } from '../components/ui/button';
import { Callout } from '../components/ui/Surfaces';
import { setSession } from '../lib/session';
import { emphasis } from '../lib/motion';

/* ==========================================================================
   Login
   --------------------------------------------------------------------------
   Só visual, por enquanto: "Entrar com a conta Microsoft" abre o sistema, sem
   Outlook e sem senha. Quando a TI ligar o Entra ID (AUTH_MODE=entra), este
   mesmo botão passa a redirecionar para a Microsoft.
   ========================================================================== */

export function LoginView() {
  // Login só visual: entra direto, sem Outlook e sem chamar o servidor.
  // Quando a TI ligar o Entra ID, é aqui que o botão passa a redirecionar.
  const enter = () =>
    setSession({ token: '', user: { id: 'dev', email: 'equipe.academica@anchieta.br', name: 'Equipe Acadêmica', role: 'admin' } });

  return (
    <div className="flex min-h-svh items-center justify-center bg-shell px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: emphasis } }}
        className="w-full max-w-sm"
      >
        <div className="rounded-xl border border-border bg-canvas p-7 text-canvas-foreground shadow-elevated sm:p-8">
          <AnchietaLogo className="h-11 w-auto" />
          <h1 className="anchieta-rule mt-7 pb-4 font-display text-[26px] leading-[1.1] font-medium text-foreground">Calendários acadêmicos</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Adicione os calendários da UniAnchieta, escolha os avisos e publique para os alunos.
          </p>

          <Button variant="primary" size="md" full className="mt-7" icon={<LogIn className="h-4 w-4" />} onClick={enter}>
            Entrar com a conta Microsoft
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">Use seu e-mail institucional (Outlook).</p>
        </div>

        <div className="mt-4">
          <Callout tone="info" title="Ambiente de desenvolvimento">
            O acesso com a conta Microsoft será ligado pela TI. Por enquanto, o botão entra direto, sem pedir senha.
          </Callout>
        </div>
        <p className="mt-6 text-center text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Centro Universitário Padre Anchieta · Jundiaí</p>
      </motion.div>
    </div>
  );
}
