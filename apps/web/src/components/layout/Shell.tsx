import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Bell, CalendarDays, LogOut, Moon, Sun, X } from 'lucide-react';
import type { SystemStatus, User } from '@calendarios/core';
import { ROLE_LABEL } from '@calendarios/core';
import { BrandLockup } from '../brand/AnchietaLogo';
import { Avatar, Pill } from '../ui/Badges';
import { Drawer } from '../ui/Overlay';
import { navigate, paths } from '../../lib/router';
import { useTheme } from '../../lib/theme';
import { press } from '../../lib/motion';

/* ==========================================================================
   Shell
   --------------------------------------------------------------------------
   Duas entradas, e só duas: Calendários e Notificações. Tudo o mais vive
   dentro delas, em abas.

   Desktop: só a barra lateral (244px). Em cima, a marca e as duas entradas;
   embaixo, a conta — tema, quem está logado e Sair — sempre com o nome escrito
   ao lado do ícone. Não há cabeçalho: um lugar só para cada coisa.

   Celular: a barra lateral dá lugar a uma barra inferior com as mesmas duas
   entradas. A conta abre num painel pelo botão com as iniciais, no topo.
   ========================================================================== */

export type Section = 'calendars' | 'notifications';

const NAV: { id: Section; label: string; icon: typeof CalendarDays; href: string }[] = [
  { id: 'calendars', label: 'Calendários', icon: CalendarDays, href: paths.calendars() },
  { id: 'notifications', label: 'Notificações', icon: Bell, href: paths.notifications() },
];

const ITEM = 'relative flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] font-medium transition-colors';

function DemoNotice({ status }: { status: SystemStatus | null }) {
  if (!status) return null;
  if (status.demoMode)
    return (
      <Pill tone="warn" solid title="Nenhuma mensagem real é enviada neste modo.">
        Modo demonstração
      </Pill>
    );
  const missing = [status.services.push, status.services.email].filter((s) => s.state === 'missing').length;
  if (missing)
    return (
      <Pill tone="warn" title="Push e/ou e-mail aguardam configuração da TI.">
        Envios aguardando configuração
      </Pill>
    );
  return null;
}

/** Conta: tema, quem está logado e Sair. O mesmo bloco na barra lateral e no painel do celular. */
function AccountBlock({ user, status, onLogout }: { user: User; status: SystemStatus | null; onLogout: () => void }) {
  const [theme, toggleTheme] = useTheme();
  const dark = theme === 'dark';
  return (
    <div className="space-y-1">
      <div className="px-3 pb-2">
        <DemoNotice status={status} />
      </div>
      <motion.button
        type="button"
        whileTap={press}
        onClick={(e) => {
          // o círculo do tema novo nasce no centro do ícone
          const icon = e.currentTarget.querySelector('svg')?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect();
          toggleTheme({ x: icon.left + icon.width / 2, y: icon.top + icon.height / 2 });
        }}
        className={`${ITEM} text-ink-2 hover:bg-surface-2 hover:text-ink`}
      >
        {dark ? <Sun className="h-4 w-4 text-ink-4" /> : <Moon className="h-4 w-4 text-ink-4" />}
        <span className="flex-1">{dark ? 'Usar tema claro' : 'Usar tema escuro'}</span>
      </motion.button>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar name={user.name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight font-medium text-ink">{user.name}</p>
          <p className="truncate text-[12px] leading-tight text-ink-3">{ROLE_LABEL[user.role]}</p>
        </div>
      </div>
      <motion.button type="button" whileTap={press} onClick={onLogout} className={`${ITEM} text-ink-2 hover:bg-surface-2 hover:text-ink`}>
        <LogOut className="h-4 w-4 text-ink-4" />
        <span className="flex-1">Sair</span>
      </motion.button>
    </div>
  );
}

function Sidebar({ section, user, status, onLogout }: { section: Section; user: User; status: SystemStatus | null; onLogout: () => void }) {
  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-[244px] shrink-0 flex-col bg-surface select-none print:hidden lg:flex">
      <div className="flex h-[74px] items-center px-4">
        <BrandLockup />
      </div>
      <nav aria-label="Principal" className="mt-2 flex flex-col gap-1 px-3">
        {NAV.map((item) => {
          const active = item.id === section;
          const Icon = item.icon;
          return (
            <motion.a
              key={item.id}
              href={item.href}
              whileTap={press}
              aria-current={active ? 'page' : undefined}
              className={[ITEM, active ? 'text-on-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'].join(' ')}
            >
              {active && <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-md bg-brand" />}
              <Icon className={`relative h-4 w-4 ${active ? 'text-on-brand' : 'text-ink-4'}`} />
              <span className="relative flex-1">{item.label}</span>
            </motion.a>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-hairline px-3 py-3">
        <AccountBlock user={user} status={status} onLogout={onLogout} />
      </div>
    </aside>
  );
}

function MobileNav({ section }: { section: Section }) {
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-hairline bg-surface/95 backdrop-blur-xl print:hidden lg:hidden">
      {NAV.map((item) => {
        const active = item.id === section;
        const Icon = item.icon;
        return (
          <a
            key={item.id}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors ${active ? 'text-brand-text' : 'text-ink-3'}`}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

export function Shell({
  section,
  user,
  status,
  onLogout,
  children,
}: {
  section: Section;
  user: User;
  status: SystemStatus | null;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [account, setAccount] = useState(false);
  return (
    <div className="flex min-h-screen bg-canvas">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px]">
        Pular para o conteúdo
      </a>
      <Sidebar section={section} user={user} status={status} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Só no celular: a marca e o acesso à conta */}
        <div className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-hairline bg-surface/85 px-4 backdrop-blur-xl print:hidden lg:hidden">
          <button type="button" onClick={() => navigate(paths.calendars())} aria-label="Ir para Calendários">
            <BrandLockup subtitle="Calendários" />
          </button>
          <button type="button" onClick={() => setAccount(true)} aria-label="Minha conta" className="rounded-full">
            <Avatar name={user.name} size="md" />
          </button>
        </div>
        <main id="conteudo" className="min-w-0 flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
      <MobileNav section={section} />
      <Drawer open={account} onClose={() => setAccount(false)} label="Minha conta" width="md">
        <header className="flex shrink-0 items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Minha conta</h2>
          <button
            type="button"
            onClick={() => setAccount(false)}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-3">
          <AccountBlock user={user} status={status} onLogout={onLogout} />
        </div>
      </Drawer>
    </div>
  );
}
