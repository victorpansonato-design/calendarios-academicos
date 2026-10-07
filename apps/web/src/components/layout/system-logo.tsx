import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import iconHeader from '../../assets/icons/icone_header.png';
import { Button } from '../ui/button';
import { useSidebar } from '../ui/sidebar';
import { paths } from '../../lib/router';
import { ITEM_MOTION_TRANSITION, SECTION_MOTION_TRANSITION } from './sidebar.constants';

/* Marca no topo da barra lateral, como no template Anchieta: o símbolo de
   36px e, ao lado, o nome do sistema e a instituição. Recolhida, fica só o
   símbolo. O wordmark largo (AnchietaLogo) continua no login. */

export function SystemLogo() {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const collapsed = !isMobile && state === 'collapsed';

  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <motion.div
      layout
      initial={false}
      animate={{ paddingLeft: collapsed ? 6 : 12, paddingRight: collapsed ? 6 : 12 }}
      transition={SECTION_MOTION_TRANSITION}
      className="flex min-h-15 items-center pt-4 pb-2"
    >
      <a href={paths.calendars()} aria-label="Ir para Calendários" onClick={handleNavigate} className="rounded-md">
        <motion.span
          layout="position"
          transition={ITEM_MOTION_TRANSITION}
          className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md shadow-sm"
        >
          <img src={iconHeader} alt="" width={300} height={300} className="size-full object-contain" />
        </motion.span>
      </a>

      <AnimatePresence initial={false} mode="popLayout">
        {!collapsed && (
          <motion.div
            key="system-name"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={ITEM_MOTION_TRANSITION}
            className="ml-3 flex min-w-0 flex-col leading-tight"
          >
            <span className="font-display text-[14px] font-medium text-foreground">Calendários</span>
            <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Grupo Anchieta</span>
          </motion.div>
        )}
      </AnimatePresence>

      {isMobile && (
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-8 text-muted-foreground [&_svg]:size-4"
          aria-label="Fechar menu"
          onClick={() => setOpenMobile(false)}
        >
          <X />
        </Button>
      )}
    </motion.div>
  );
}
