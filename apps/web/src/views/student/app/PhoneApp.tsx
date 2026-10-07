import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { StudentEventItem, StudentView } from '@calendarios/core';
import { IosStatusBar } from '../../../components/device/IPhone';
import { exitFast, springSoft } from '../../../lib/motion';
import { AvisosScreen, CalendarScreen, DetailScreen, HomeScreen, HorariosScreen, type CalMode, type PhoneActions } from './PhoneScreens';
import { PhoneToast, PushBanner, SCREEN, TabBar, type PhoneTab, type PushPreview } from './phoneKit';
import type { StarFeedback } from '../../../lib/studentPreview';

/* ==========================================================================
   O app dentro do iPhone
   --------------------------------------------------------------------------
   Navegação como no app: 4 abas embaixo; a data aberta é uma tela empilhada
   sobre a aba de onde veio, e "voltar" volta para lá (no protótipo voltava
   sempre para a mesma tela). Avançar desliza para a esquerda; voltar, para a
   direita — a direção é a da posição de cada tela.

   A estrela é o momento "uau" da demonstração: quando ela agenda um
   lembrete, o push desce do topo com o texto real que o aluno vai receber.
   ========================================================================== */

type Screen = PhoneTab | 'detalhe';
const POSITION: Record<Screen, number> = { inicio: 0, horarios: 1, calendario: 2, avisos: 3, detalhe: 4 };
const ORIGIN_LABEL: Record<PhoneTab, string> = { inicio: 'Início', horarios: 'Horários', calendario: 'Calendário', avisos: 'Avisos' };

const VARIANTS = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 26, scale: 0.992 }),
  center: { opacity: 1, x: 0, scale: 1, transition: springSoft },
  exit: (dir: number) => ({ opacity: 0, x: dir * -16, scale: 0.996, transition: exitFast }),
};

export interface PhoneAppProps {
  view: StudentView;
  full: StudentView;
  category: string | null;
  setCategory: (c: string | null) => void;
  query: string;
  setQuery: (q: string) => void;
  toggleStar: (uid: string) => Promise<StarFeedback>;
  toggleHide: (uid: string) => Promise<string>;
  onIcs: (item: StudentEventItem) => void;
  reminderWhen: (uid: string) => string | null;
  pdfHref: string | null;
  /** Avisa a página (coluna "Lembrete de favorito"). */
  onPush: (p: PushPreview) => void;
  pushes: PushPreview[];
}

export function PhoneApp(props: PhoneAppProps) {
  const { view, full } = props;
  const [tab, setTab] = useState<PhoneTab>('inicio');
  const [detail, setDetail] = useState<string | null>(null);
  const [mode, setMode] = useState<CalMode>('importantes');
  const [push, setPush] = useState<PushPreview | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [seen, setSeen] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolls = useRef<Record<string, number>>({});

  const screen: Screen = detail ? 'detalhe' : tab;
  const prev = useRef<Screen>(screen);
  const dir = POSITION[screen] >= POSITION[prev.current] ? 1 : -1;
  useEffect(() => {
    prev.current = screen;
  }, [screen]);

  // cada tela guarda a própria rolagem; a data aberta sempre começa do topo
  const go = (fn: () => void) => {
    if (scrollRef.current) scrolls.current[screen] = scrollRef.current.scrollTop;
    fn();
  };
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: screen === 'detalhe' ? 0 : (scrolls.current[screen] ?? 0) });
  }, [screen, detail]);

  useEffect(() => {
    if (!push) return;
    const t = window.setTimeout(() => setPush(null), 5200);
    return () => window.clearTimeout(t);
  }, [push]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (tab === 'avisos') setSeen(props.pushes.length);
  }, [tab, props.pushes.length]);

  // a data aberta pode sumir (troca de calendário ou de coorte)
  const item = detail ? (full.items.find((i) => i.uid === detail) ?? null) : null;
  useEffect(() => {
    if (detail && !item) setDetail(null);
  }, [detail, item]);

  const actions: PhoneActions = {
    open: (uid) => go(() => setDetail(uid)),
    star: async (uid) => {
      try {
        const r = await props.toggleStar(uid);
        if (r.push) {
          const p = { id: Date.now(), ...r.push };
          setPush(p);
          props.onPush(p);
        } else setToast(r.note);
      } catch (e) {
        setToast((e as Error).message);
      }
    },
    hide: async (uid) => {
      try {
        setToast(await props.toggleHide(uid));
      } catch (e) {
        setToast((e as Error).message);
      }
    },
    ics: props.onIcs,
  };

  const content = (() => {
    if (screen === 'detalhe' && item)
      return <DetailScreen item={item} origin={ORIGIN_LABEL[tab]} onBack={() => go(() => setDetail(null))} actions={actions} reminderWhen={props.reminderWhen(item.uid)} pdfHref={props.pdfHref} />;
    if (tab === 'inicio') return <HomeScreen full={full} onCalendar={() => go(() => setTab('calendario'))} />;
    if (tab === 'horarios') return <HorariosScreen />;
    if (tab === 'avisos') return <AvisosScreen pushes={props.pushes} />;
    return <CalendarScreen view={view} full={full} mode={mode} setMode={setMode} category={props.category} setCategory={props.setCategory} query={props.query} setQuery={props.setQuery} actions={actions} />;
  })();

  return (
    <div className="relative flex h-full flex-col" style={{ background: SCREEN.page }}>
      <IosStatusBar />
      <div ref={scrollRef} className="ios-scroll relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={screen === 'detalhe' ? `d-${detail}` : screen} custom={dir} variants={VARIANTS} initial="enter" animate="center" exit="exit">
            {content}
          </motion.div>
        </AnimatePresence>
      </div>
      <TabBar
        tab={tab}
        badge={Math.max(0, props.pushes.length - seen)}
        onTab={(t) =>
          go(() => {
            setDetail(null);
            setTab(t);
          })
        }
      />
      <PhoneToast text={toast} />
      <PushBanner
        push={push}
        onClose={() => {
          setPush(null);
          go(() => {
            setDetail(null);
            setTab('avisos');
          });
        }}
      />
    </div>
  );
}
