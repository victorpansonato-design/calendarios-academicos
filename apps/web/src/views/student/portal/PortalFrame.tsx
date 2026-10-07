import type { ReactNode } from 'react';
import {
  Bell,
  BookMarked,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  FileText,
  Footprints,
  Hourglass,
  House,
  Lock,
  LogOut,
  Moon,
  Newspaper,
  PanelLeft,
  Puzzle,
  Receipt,
  Search,
  User,
  Wallet,
} from 'lucide-react';
import { AnchietaLogo } from '../../../components/brand/AnchietaLogo';
import { cn } from '../../../lib/utils';

/* ==========================================================================
   Moldura do Portal do Aluno
   --------------------------------------------------------------------------
   Janela de navegador + a casca do portal (menu lateral e barra do topo),
   copiadas do portal de verdade para a equipe ver o calendário no lugar onde
   o aluno vai encontrá-lo: depois de clicar em "Calendário Acadêmico".
   Tudo aqui é cenário: nada navega. O aluno é fictício.
   ========================================================================== */

const MENU: { title?: string; items: { label: string; icon: typeof House; active?: boolean }[] }[] = [
  {
    items: [
      { label: 'Início', icon: House },
      { label: 'Horários', icon: Clock },
      { label: 'Notificações', icon: Bell },
      { label: 'Meu perfil', icon: User },
    ],
  },
  {
    title: 'Acesso rápido',
    items: [
      { label: 'Cobranças a Pagar', icon: Wallet },
      { label: 'Notas e Faltas', icon: FileSpreadsheet },
      { label: 'Contratos', icon: FileText },
    ],
  },
  {
    title: 'Acadêmico',
    items: [
      { label: 'Horas Complementares', icon: Hourglass },
      { label: 'Avaliar Disciplinas', icon: ClipboardCheck },
      { label: 'Prática Extensionista', icon: Puzzle },
      { label: 'Jornada Acadêmica', icon: Footprints },
      { label: 'Eletivas', icon: BookMarked },
      { label: 'Calendário Acadêmico', icon: CalendarDays, active: true },
      { label: 'Mural', icon: Newspaper },
    ],
  },
  { title: 'Financeiro', items: [{ label: 'Negociação Online', icon: Receipt }] },
];

export function PortalFrame({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  return (
    <div className="@container overflow-hidden rounded-xl border border-border bg-shell shadow-elevated">
      {/* barra do navegador */}
      <div className="flex items-center gap-3 border-b border-border bg-muted/70 px-4 py-2.5" aria-hidden>
        <span className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto flex min-w-0 items-center gap-1.5 rounded-md bg-background px-3 py-1 text-[12px] text-muted-foreground shadow-xs @3xl:min-w-[420px]">
          <Lock className="size-3 shrink-0" />
          <span className="truncate">app.anchieta.br/aluno-online/calendario-academico</span>
        </span>
        <span className="w-[52px]" />
      </div>

      <div className="flex h-[min(860px,calc(100svh-180px))] min-h-[640px]">
        {/* menu lateral do portal */}
        <aside className="hidden w-[218px] shrink-0 flex-col overflow-hidden px-3 py-4 @5xl:flex" aria-label="Menu do portal (ilustrativo)">
          <div className="mb-4 flex items-center justify-between px-2">
            <AnchietaLogo className="h-7 w-auto" />
            <Search className="size-4 text-muted-foreground" aria-hidden />
          </div>
          <nav className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {MENU.map((g, gi) => (
              <div key={gi}>
                {g.title && (
                  <p className="mb-1 flex items-center justify-between px-2 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                    {g.title}
                    {gi > 1 && <ChevronDown className="size-3" aria-hidden />}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {g.items.map((it) => (
                    <li
                      key={it.label}
                      aria-current={it.active ? 'page' : undefined}
                      className={cn(
                        'relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px]',
                        it.active ? 'bg-canvas font-medium text-primary shadow-xs' : 'text-foreground/80',
                      )}
                    >
                      {it.active && <span className="absolute top-1/2 left-0 h-4 w-0.75 -translate-y-1/2 rounded-r-sm bg-accent" aria-hidden />}
                      <it.icon className={cn('size-4 shrink-0', it.active ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                      <span className="truncate">{it.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* janela de conteúdo do portal */}
        <div className="relative my-2 mr-2 ml-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-canvas shadow-card @5xl:ml-0">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4" aria-hidden>
            <PanelLeft className="size-4 text-muted-foreground" />
            <span className="h-5 w-px bg-border" />
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              Início <span className="text-muted-foreground/60">›</span> <span className="font-medium text-foreground">Calendário Acadêmico</span>
            </span>
            <span className="mx-auto hidden min-w-[260px] items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-[12px] text-muted-foreground @4xl:flex">
              <Search className="size-3.5" />
              Buscar menus, páginas e recursos…
              <kbd className="ml-auto rounded border border-border bg-background px-1.5 font-mono text-[10px]">Ctrl K</kbd>
            </span>
            <span className="ml-auto flex items-center gap-3 @4xl:ml-0">
              <Moon className="size-4 text-muted-foreground" />
              <Bell className="size-4 text-muted-foreground" />
              <span className="grid size-8 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">AE</span>
              <span className="hidden leading-tight @3xl:block">
                <span className="block text-[12px] font-semibold text-foreground">Aluno Exemplo</span>
                <span className="block text-[10.5px] text-muted-foreground">RA: 0000000</span>
              </span>
              <span className="hidden items-center gap-1 rounded-full bg-destructive px-3 py-1.5 text-[12px] font-semibold text-destructive-foreground @3xl:flex">
                <LogOut className="size-3.5" /> Sair
              </span>
            </span>
          </header>
          <div data-portal-scroll className="@container scroll-slim min-h-0 flex-1 overflow-y-auto">{children}</div>
          {overlay}
        </div>
      </div>
    </div>
  );
}
