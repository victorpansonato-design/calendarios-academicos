import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, CalendarDays, ChevronLeft, Clock, House, Star } from 'lucide-react';
import type { StudentEventItem } from '@calendarios/core';
import { IOS } from '../../../components/device/IPhone';
import { AnchietaLogo } from '../../../components/brand/AnchietaLogo';
import { press, spring, springSoft } from '../../../lib/motion';
import { legendStyle } from '../shared';

/* ==========================================================================
   Peças do app Grupo Anchieta (tela escura, como o app de verdade)
   --------------------------------------------------------------------------
   A tela do aparelho NÃO acompanha o tema da gestão: o app é escuro, então
   as cores aqui são literais, aferidas sobre o preto do display. As cores da
   legenda do PDF passam por legendStyle(…, 'dark'), que as clareia só o
   necessário para aparecerem sobre esse preto.
   ========================================================================== */

export const SCREEN = {
  page: '#0b0b0c',
  card: '#1e1f22',
  cardHi: '#26282c',
  ink: '#ffffff',
  ink2: 'rgba(255,255,255,0.70)',
  ink3: 'rgba(255,255,255,0.50)',
  line: 'rgba(255,255,255,0.09)',
  link: '#4a9eff',
  blue: '#1689f4',
  warn: '#f5b459',
  crit: '#f4776b',
  green: '#32d583',
} as const;

export const HEADER_BG = 'radial-gradient(125% 95% at 14% -10%, #1670c9 0%, #0b5199 42%, #073d76 74%, #052f5c 100%)';

export type PhoneTab = 'inicio' | 'horarios' | 'calendario' | 'avisos';

export const dark = (item: Pick<StudentEventItem, 'legendColor'>) => legendStyle(item.legendColor, 'dark');

/* -- Cabeçalho azul das telas internas ------------------------------------ */

export function BlueHeader({ title, subtitle, back, onBack, children }: { title: string; subtitle?: string; back?: string; onBack?: () => void; children?: ReactNode }) {
  return (
    <div className="px-5 pb-5" style={{ backgroundImage: HEADER_BG, paddingTop: IOS.safeTop - 4 }}>
      {back && onBack ? (
        <button type="button" onClick={onBack} className="-ml-1.5 mb-2 flex items-center gap-0.5 text-[15px]" style={{ color: 'rgba(255,255,255,0.9)' }}>
          <ChevronLeft className="size-5" /> {back}
        </button>
      ) : (
        <span className="mb-3 block" style={{ ['--brand-mark' as string]: '#04264a' }}>
          <AnchietaLogo className="h-[22px] w-auto" />
        </span>
      )}
      <h1 className="text-[26px] leading-tight font-bold text-white">{title}</h1>
      {subtitle && <p className="mt-1 text-[13px]" style={{ color: 'rgba(255,255,255,0.75)' }}>{subtitle}</p>}
      {children}
    </div>
  );
}

/* -- Estrela -------------------------------------------------------------- */

export function PhoneStar({ starred, onToggle, label, size = 40 }: { starred: boolean; onToggle: () => void; label: string; size?: number }) {
  return (
    <motion.button
      type="button"
      aria-pressed={starred}
      aria-label={starred ? `Remover ${label} dos favoritos` : `Favoritar ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      whileTap={{ scale: 0.84 }}
      className="relative z-10 grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: starred ? 'rgba(245,196,0,0.16)' : 'transparent' }}
    >
      <motion.span key={String(starred)} initial={starred ? { scale: 0.3, rotate: -40 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 15 }}>
        <Star className="size-[20px]" style={{ color: starred ? '#f5c400' : SCREEN.ink3, fill: starred ? '#f5c400' : 'transparent' }} />
      </motion.span>
    </motion.button>
  );
}

/* -- Pílula da legenda (fundo escuro) ------------------------------------- */

export function PhoneChip({ item }: { item: StudentEventItem }) {
  const ls = dark(item);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium" style={{ background: ls.tint, color: SCREEN.ink2 }}>
      <span className="size-[7px] shrink-0 rounded-full" style={{ background: ls.ink }} aria-hidden />
      <span className="truncate">{item.legendLabel}</span>
    </span>
  );
}

export function PhoneBadge({ item }: { item: StudentEventItem }) {
  if (item.studentImportance === 'high') return <Tag bg="rgba(244,119,107,0.16)" fg="#ff9d93">Não perca</Tag>;
  if (item.starred) return <Tag bg="rgba(245,196,0,0.14)" fg="#f5c400">★ Favorito</Tag>;
  if (item.why === 'medium') return <Tag bg="rgba(74,158,255,0.16)" fg="#8cc1ff">Importante</Tag>;
  return null;
}

function Tag({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2 py-[3px] text-[10.5px] font-semibold" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

/* -- Barra inferior (igual à do app: 4 abas) ------------------------------ */

const TABS: { key: PhoneTab; label: string; Icon: typeof House }[] = [
  { key: 'inicio', label: 'Início', Icon: House },
  { key: 'horarios', label: 'Horários', Icon: Clock },
  { key: 'calendario', label: 'Calendário', Icon: CalendarDays },
  { key: 'avisos', label: 'Avisos', Icon: Bell },
];

export function TabBar({ tab, onTab, badge }: { tab: PhoneTab; onTab: (t: PhoneTab) => void; badge: number }) {
  return (
    <div className="absolute inset-x-0 z-20 px-4" style={{ bottom: IOS.safeBottom - 8 }}>
      <nav aria-label="Navegação do app" className="flex items-center justify-around rounded-[28px] px-2 py-2" style={{ backgroundColor: 'rgba(28,30,33,0.94)', backdropFilter: 'blur(12px)', boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }}>
        {TABS.map(({ key, label, Icon }) => {
          const active = key === tab;
          return (
            <motion.button
              key={key}
              type="button"
              onClick={() => onTab(key)}
              aria-current={active ? 'page' : undefined}
              whileTap={press}
              className="relative flex min-w-[72px] flex-col items-center gap-1 rounded-[20px] px-2 py-1.5"
            >
              {active && <motion.span layoutId="app-active-tab" transition={spring} className="absolute inset-0 rounded-[20px]" style={{ backgroundColor: 'rgba(255,255,255,0.11)' }} />}
              <span className="relative">
                <Icon className="relative z-10 h-[22px] w-[22px]" style={{ color: active ? SCREEN.ink : SCREEN.ink2 }} />
                {key === 'avisos' && badge > 0 && (
                  <span className="absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9.5px] font-bold text-white" style={{ background: '#e5484d' }}>
                    {badge}
                  </span>
                )}
              </span>
              <span className="relative z-10 text-[10.5px] leading-none" style={{ color: active ? SCREEN.ink : SCREEN.ink2 }}>
                {label}
              </span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}

/* -- Push que desce do topo (prévia do lembrete de favorito) -------------- */

export interface PushPreview {
  id: number;
  title: string;
  body: string;
  when: string;
}

export function PushBanner({ push, onClose }: { push: PushPreview | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {push && (
        <motion.button
          key={push.id}
          type="button"
          onClick={onClose}
          initial={{ y: -140, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } }}
          exit={{ y: -140, opacity: 0, transition: { duration: 0.22 } }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          onDragEnd={(_, info) => info.offset.y < -20 && onClose()}
          aria-label={`Prévia do lembrete: ${push.body}`}
          className="absolute inset-x-2.5 z-40 flex gap-3 rounded-[22px] px-3.5 py-3 text-left"
          style={{ top: 54, background: 'rgba(38,40,46,0.86)', backdropFilter: 'blur(22px) saturate(160%)', boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)' }}
        >
          <span className="grid size-[38px] shrink-0 place-items-center rounded-[10px]" style={{ backgroundImage: HEADER_BG }} aria-hidden>
            <span className="text-[13px] font-black tracking-tight text-white italic">GA</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-white">{push.title}</span>
              <span className="shrink-0 text-[11px]" style={{ color: SCREEN.ink3 }}>
                chega {push.when}
              </span>
            </span>
            <span className="mt-0.5 line-clamp-3 block text-[13px] leading-snug" style={{ color: SCREEN.ink2 }}>
              {push.body}
            </span>
            <span className="mt-1.5 block text-[10.5px] font-medium tracking-wide uppercase" style={{ color: SCREEN.ink3 }}>
              Prévia do lembrete · Grupo Anchieta
            </span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/** Aviso curto na tela (quando a estrela não gera push). */
export function PhoneToast({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={text}
          role="status"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: springSoft }}
          exit={{ opacity: 0, y: 10, transition: { duration: 0.16 } }}
          className="absolute inset-x-6 z-30 rounded-2xl px-4 py-3 text-center text-[13px] leading-snug text-white"
          style={{ bottom: IOS.safeBottom + 76, background: 'rgba(48,50,56,0.95)', backdropFilter: 'blur(14px)', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
