import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { SystemStatus, User } from '@calendarios/core';
import { ROLE_LABEL } from '@calendarios/core';
import { Badge } from '../ui/badge';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../ui/sidebar';
import { useRoute } from '../../lib/router';
import { AppSidebar, type Section } from './app-sidebar';
import { NavTitle } from './nav-title';

export type { Section } from './app-sidebar';

/* ==========================================================================
   Shell — a moldura do template Anchieta
   --------------------------------------------------------------------------
   A moldura cinza (`shell`) com a barra lateral e, flutuando sobre ela, a
   janela branca do conteúdo (`canvas`). Só a janela rola; a moldura fica
   parada. No topo da janela, uma barra de 56px: abrir/recolher o menu, onde
   você está (breadcrumb), o aviso de demonstração e quem está logado.

   Celular (< 768px): a barra lateral vira um painel aberto pelo botão da
   barra superior.
   ========================================================================== */

function DemoNotice({ status }: { status: SystemStatus | null }) {
  if (!status) return null;
  if (status.demoMode)
    return (
      <Badge tone="warning" dot title="Nenhuma mensagem real é enviada neste modo." className="shrink-0 whitespace-nowrap">
        <span className="hidden sm:inline">Modo demonstração</span>
        <span className="sm:hidden">Demo</span>
      </Badge>
    );
  const missing = [status.services.push, status.services.email].filter((s) => s.state === 'missing').length;
  if (missing)
    return (
      <Badge tone="warning" variant="outline" title="Push e/ou e-mail aguardam configuração da TI." className="hidden shrink-0 whitespace-nowrap sm:inline-flex">
        Envios aguardando configuração
      </Badge>
    );
  return null;
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
  const route = useRoute();
  const canvasRef = useRef<HTMLDivElement>(null);
  const place = `${route.name}:${route.name === 'calendar' ? route.id : ''}`;

  // Volta ao topo só quando muda de página — trocar de aba não perde a posição.
  useEffect(() => {
    canvasRef.current?.scrollTo({ top: 0 });
  }, [place]);

  return (
    <SidebarProvider className="h-svh overflow-hidden" defaultOpen={window.innerWidth >= 1024}>
      <a
        href="#conteudo"
        onClick={(e) => {
          // roteador de hash: o "#conteudo" não pode virar rota
          e.preventDefault();
          document.getElementById('conteudo')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-canvas focus:px-3 focus:py-2 focus:text-sm focus:shadow-elevated"
      >
        Pular para o conteúdo
      </a>

      <AppSidebar section={section} user={user} onLogout={onLogout} />

      <SidebarInset
        id="conteudo"
        tabIndex={-1}
        className="overflow-hidden bg-canvas text-canvas-foreground outline-none md:border md:border-border md:peer-data-[variant=inset]:shadow-elevated"
      >
        <header data-app-header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
          <SidebarTrigger className="-ml-1 cursor-pointer text-muted-foreground hover:text-foreground" />
          <div className="h-5 w-px bg-border" aria-hidden />
          <NavTitle />
          <div className="ml-auto flex min-w-0 items-center gap-4">
            <DemoNotice status={status} />
            <div className="hidden flex-col items-end leading-tight sm:flex">
              <span className="max-w-55 truncate text-xs font-medium text-foreground">{user.name}</span>
              <span className="max-w-55 truncate text-[0.65rem] text-muted-foreground">{ROLE_LABEL[user.role] ?? user.email}</span>
            </div>
          </div>
        </header>

        <div ref={canvasRef} data-canvas-scroll className="scroll-slim flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 pt-2 pb-12 sm:px-8">
            <div className="mx-auto max-w-360">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
