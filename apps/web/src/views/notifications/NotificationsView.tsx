import type { SystemStatus } from '@calendarios/core';
import { PageHeader, Tabs } from '../../components/ui/Surfaces';
import { navigate, paths } from '../../lib/router';
import { AgendaTab } from './AgendaTab';
import { LifecycleTab } from './LifecycleTab';

/* Notificações: a agenda de todos os envios e as regras de comunicação por
   acontecimento do aluno. Duas seções internas, nenhuma entrada nova no menu. */

type TabId = 'agenda' | 'acontecimentos';

export function NotificationsView({ tab, status }: { tab: string | null; status: SystemStatus | null }) {
  const current: TabId = tab === 'acontecimentos' ? 'acontecimentos' : 'agenda';
  return (
    <div className="space-y-6">
      <PageHeader title="Notificações" description="As mensagens que vão para os alunos: avisos dos calendários e mensagens que você enviar.">
        <Tabs<TabId>
          layoutId="notifications-tabs"
          value={current}
          onChange={(t) => navigate(paths.notifications(t))}
          tabs={[
            { value: 'agenda', label: 'Mensagens' },
            { value: 'acontecimentos', label: 'Acontecimentos do aluno' },
          ]}
        />
      </PageHeader>
      {current === 'agenda' ? <AgendaTab status={status} /> : <LifecycleTab status={status} />}
    </div>
  );
}
