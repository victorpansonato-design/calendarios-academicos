import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { SidebarGroupLabel, SidebarMenuButton, SidebarMenuItem } from '../ui/sidebar';
import { press } from '../../lib/motion';
import { cn } from '../../lib/utils';
import { ITEM_MOTION_TRANSITION, SECTION_MOTION_TRANSITION } from './sidebar.constants';

/* ==========================================================================
   Item da navegação lateral (template Anchieta)
   --------------------------------------------------------------------------
   Ativo: o "papel" branco do canvas com sombra leve, texto e ícone em azul e
   o filete amarelo vertical à esquerda. Aqui o papel branco é um único
   elemento compartilhado (layoutId) — ao trocar de seção ele desliza de um
   item para o outro, levando o filete junto.
   ========================================================================== */

interface SidebarNavigationItemProps {
  active: boolean;
  collapsed: boolean;
  icon: LucideIcon;
  isMobile: boolean;
  label: string;
  onNavigate: () => void;
  /** Destino no roteador de hash (ex.: "#/calendarios"). */
  href: string;
}

const MENU_ITEM_CLASSES = 'group relative rounded-md transition-colors duration-150';
// O fundo branco do ativo é o <motion.span> deslizante; o botão em si fica transparente.
// overflow-visible: o papel vem de outro item durante a animação e não pode ser recortado.
const ACTIVE_MENU_ITEM_CLASSES = 'overflow-visible bg-transparent! font-medium text-primary! hover:bg-transparent! hover:text-primary!';
const INACTIVE_MENU_ITEM_CLASSES = 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground';

export function SidebarSectionLabel({ children, collapsed }: { children: ReactNode; collapsed: boolean }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {!collapsed && (
        <motion.div
          key="section-label"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 28, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SECTION_MOTION_TRANSITION}
          className="overflow-hidden"
        >
          <SidebarGroupLabel className="h-7 px-2 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{children}</SidebarGroupLabel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SidebarNavigationItem({ active, collapsed, icon: Icon, isMobile, label, onNavigate, href }: SidebarNavigationItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={label}
        showTooltipWhenExpanded
        className={cn(MENU_ITEM_CLASSES, active ? ACTIVE_MENU_ITEM_CLASSES : INACTIVE_MENU_ITEM_CLASSES, isMobile && 'h-11')}
      >
        <motion.a href={href} whileTap={press} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
          {active && (
            <motion.span
              layoutId="sidebar-active"
              aria-hidden
              transition={ITEM_MOTION_TRANSITION}
              className="absolute inset-0 rounded-md bg-canvas shadow-xs"
            >
              <motion.span
                initial={{ opacity: 0, scaleY: 0.35 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={ITEM_MOTION_TRANSITION}
                className="absolute top-1/2 left-0 -mt-2 h-4 w-0.75 rounded-r-sm bg-(--brand-yellow) group-data-[collapsible=icon]:-mt-2.5 group-data-[collapsible=icon]:h-5"
              />
            </motion.span>
          )}

          <motion.span
            layout="position"
            aria-hidden
            initial={false}
            animate={{ scale: collapsed ? 1.05 : 1 }}
            transition={ITEM_MOTION_TRANSITION}
            className={cn('relative grid size-5 shrink-0 place-items-center transition-colors', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}
          >
            <Icon className="size-4" />
          </motion.span>

          <AnimatePresence initial={false} mode="popLayout">
            {!collapsed && (
              <motion.span
                key="item-label"
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -5 }}
                transition={ITEM_MOTION_TRANSITION}
                className="relative min-w-0 flex-1 truncate whitespace-nowrap"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
