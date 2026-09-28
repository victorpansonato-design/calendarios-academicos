import { useState } from 'react';
import { RotateCcw, ServerOff } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, EmptyState } from '../components/ui/Surfaces';

/* Uma tela só, em linguagem simples, quando o servidor do sistema não
   responde — em vez de erros espalhados por cada parte da tela. */

export function ServerUnavailable({ onRetry }: { onRetry: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card className="py-6">
      <EmptyState
        icon={<ServerOff className="h-5 w-5" />}
        title="O sistema está sem conexão com o servidor"
        message="Os calendários ficam guardados no servidor, e ele não respondeu agora. Tente de novo em alguns instantes. Se continuar, avise a TI."
        action={
          <div className="mt-2 flex flex-col items-center gap-4">
            <Button
              variant="primary"
              size="md"
              icon={<RotateCcw className="h-4 w-4" />}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onRetry();
                setBusy(false);
              }}
            >
              {busy ? 'Tentando…' : 'Tentar de novo'}
            </Button>
            <p className="max-w-md text-[11.5px] leading-relaxed text-ink-4">
              Para a TI: a interface não encontrou a API. Publique a API (apps/api) num servidor com disco e defina VITE_API_URL no build da interface — ver README, "Publicar".
            </p>
          </div>
        }
      />
    </Card>
  );
}
