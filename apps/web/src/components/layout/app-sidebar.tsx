import { useCallback, useRef } from 'react';
import type { ComponentType } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, CalendarDays, Check, ChevronUp, Globe, LaptopMinimal, LogOut, Moon, Settings2, Smartphone, Sun, type LucideIcon } from 'lucide-react';
import type { User } from '@calendarios/core';
import { ROLE_LABEL } from '@calendarios/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarRail, useSidebar } from '../ui/sidebar';
import { initials } from '../ui/Badges';
import { paths } from '../../lib/router';
import { useTheme, type ThemePreference } from '../../lib/theme';
import { ITEM_MOTION_TRANSITION } from './sidebar.constants';
import { SidebarNavigationItem, SidebarSectionLabel } from './sidebar-navigation-item';
import { SystemLogo } from './system-logo';

/* ==========================================================================
   Barra lateral (template Anchieta)
   --------------------------------------------------------------------------
   Duas seções:
     Gestão         — Calendários e Notificações. Tudo o mais vive dentro
                      delas, em abas.
     Visão do aluno — como os alunos veem os calendários publicados, no
                      Portal do aluno e no App Grupo Anchieta.

   Embaixo, quem está logado (com Sair) e as preferências de aparência.
   Desktop: recolhe para ícones (Ctrl/⌘ + B) e pode ser redimensionada.
   Celular (< 768px): vira um painel que fecha ao navegar.
   ========================================================================== */

export type Section = 'calendars' | 'notifications' | 'student-portal' | 'student-app';

interface MenuItem {
  id: Section;
  label: string;
  href: string;
  icon: LucideIcon;
}

const MENU: { label: string; items: MenuItem[] }[] = [
  {
    label: 'Gestão',
    items: [
      { id: 'calendars', label: 'Calendários', href: paths.calendars(), icon: CalendarDays },
      { id: 'notifications', label: 'Notificações', href: paths.notifications(), icon: Bell },
    ],
  },
  {
    label: 'Visão do aluno',
    items: [
      { id: 'student-portal', label: 'Portal do aluno', href: paths.studentPortal(), icon: Globe },
      { id: 'student-app', label: 'App Grupo Anchieta', href: paths.studentApp(), icon: Smartphone },
    ],
  },
];

export function AppSidebar({ section, user, onLogout }: { section: Section; user: User; onLogout: () => void }) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const collapsed = !isMobile && state === 'collapsed';

  const handleNavigate = useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex h-full min-h-0 flex-col"
      >
        <SystemLogo />

        <SidebarContent className="gap-4 px-2 py-4 group-data-[collapsible=icon]:px-1">
          <nav aria-label="Navegação principal" className="flex flex-col gap-4">
            {MENU.map((group) => (
              <SidebarGroup key={group.label} className="px-2 py-1 group-data-[collapsible=icon]:px-0">
                <SidebarSectionLabel collapsed={collapsed}>{group.label}</SidebarSectionLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarNavigationItem
                        key={item.id}
                        active={item.id === section}
                        collapsed={collapsed}
                        icon={item.icon}
                        isMobile={isMobile}
                        label={item.label}
                        onNavigate={handleNavigate}
                        href={item.href}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>

        <SidebarFooter className="gap-2 border-t border-sidebar-border p-3 group-data-[collapsible=icon]:px-1.5">
          <UserCard collapsed={collapsed} user={user} onLogout={onLogout} />
          <PreferencesMenu collapsed={collapsed} />
        </SidebarFooter>
      </motion.div>

      <SidebarRail />
    </Sidebar>
  );
}

function UserCard({ collapsed, user, onLogout }: { collapsed: boolean; user: User; onLogout: () => void }) {
  return (
    <motion.div
      layout
      transition={ITEM_MOTION_TRANSITION}
      className="flex items-center gap-3 rounded-md bg-sidebar-accent/40 px-2.5 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <motion.div
        layout="position"
        transition={ITEM_MOTION_TRANSITION}
        className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
        aria-hidden
      >
        <span className="text-xs font-semibold">{initials(user.name)}</span>
      </motion.div>

      <AnimatePresence initial={false} mode="popLayout">
        {!collapsed && (
          <motion.div
            key="user-details"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={ITEM_MOTION_TRANSITION}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-medium text-sidebar-foreground">{user.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">{ROLE_LABEL[user.role] ?? user.email}</span>
            </div>
            <button
              type="button"
              aria-label="Sair"
              title="Sair"
              onClick={onLogout}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
            >
              <LogOut className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: LaptopMinimal },
];

const THEME_LABEL: Record<ThemePreference, string> = {
  light: 'Claro',
  dark: 'Escuro',
  system: 'Sistema',
};

/**
 * Aparência: claro, escuro ou sistema. A troca mantém a revelação circular,
 * que nasce no ícone do botão — e só depois que o menu terminou de fechar,
 * para o círculo não "fotografar" o menu aberto.
 */
function PreferencesMenu({ collapsed }: { collapsed: boolean }) {
  const { preference, setPreference } = useTheme();
  const iconRef = useRef<HTMLSpanElement>(null);
  const pending = useRef<ThemePreference | null>(null);
  const CurrentIcon = THEME_OPTIONS.find((option) => option.value === preference)?.icon ?? LaptopMinimal;

  const applyPending = () => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    const rect = iconRef.current?.getBoundingClientRect();
    const origin = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
    requestAnimationFrame(() => setPreference(next, origin));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          title="Preferências"
        >
          <motion.span ref={iconRef} layout="position" transition={ITEM_MOTION_TRANSITION} className="grid size-4 shrink-0 place-items-center">
            <Settings2 className="size-3.5" />
          </motion.span>

          <AnimatePresence initial={false} mode="popLayout">
            {!collapsed && (
              <motion.span
                key="preference-label"
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -5 }}
                transition={ITEM_MOTION_TRANSITION}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <span className="text-left">Preferências</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] tracking-[0.06em] text-muted-foreground/80 uppercase">
                  <CurrentIcon className="size-3" />
                  {THEME_LABEL[preference]}
                </span>
                <ChevronUp className="size-3 text-muted-foreground" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[220px]" onCloseAutoFocus={applyPending}>
        <DropdownMenuLabel className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Aparência</DropdownMenuLabel>
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = preference === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => {
                pending.current = option.value;
              }}
              className="flex items-center gap-2"
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="flex-1">{option.label}</span>
              {active ? <Check className="size-3.5 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
