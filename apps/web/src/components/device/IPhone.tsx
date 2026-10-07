import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import { springSoft } from '../../lib/motion';
import { useCoarsePointer, usePointerTilt, useReducedMotion } from '../../lib/reactive';
import './iphone.css';

/* ==========================================================================
   iPhone 16 Pro — o aparelho em grandeza natural
   --------------------------------------------------------------------------
   Este componente é o INVÓLUCRO, e só isso. Ele não sabe o que a aplicação de
   dentro mostra, não conhece um indicador sequer, e é assim que ele consegue
   ser um aparelho de verdade em vez de um card com cantos arredondados.

   As medidas são as publicadas do 16 Pro, em pontos (`index.css`, `.ios-*`):
   tela 402 x 874, moldura 12, raio 55, ilha 125 x 36 a 11pt do topo, safe area
   de 62pt, home indicator 140 x 5. Elas não foram arredondadas para números
   redondos — "tamanho real" só é verdade se forem os números do fabricante, e
   o teste é encostar um aparelho na tela.

   Três decisões que separam isto de um mockup:

     1. A TELA É A APLICAÇÃO. Dentro de `.ios-screen` mora HTML focável por
        teclado, lido por leitor de tela e clicável de verdade. Um `<img>` de
        iPhone daria a mesma fotografia e zero função — e um objeto que ocupa
        900px de altura numa tela de gestão precisa fazer trabalho para
        justificar o espaço.
     2. O CHASSI É CENOGRAFIA E DIZ ISSO. Carcaça, botões e brilho do vidro são
        `aria-hidden`. Sem maçã e sem etiqueta de modelo: a marca de um
        terceiro na primeira dobra de um sistema institucional é ruído jurídico
        antes de ser ruído visual.
     3. ELE ENCOLHE COMO OBJETO, não como layout. `transform: scale` nos
        degraus de viewport mantém as proporções do fabricante em qualquer
        largura. Refluir a UI de dentro produziria um iPhone que não existe.
   ========================================================================== */

/** Medidas do aparelho, em pontos. Espelham `.ios-device` no CSS. */
export const IOS = {
  screenW: 402,
  screenH: 874,
  bezel: 12,
  safeTop: 62,
  safeBottom: 34,
  islandW: 125,
  islandH: 36,
} as const;

export function IPhone({
  children,
  island,
  /**
   * 0–100. Intensidade do brilho do papel de parede. O aparelho respira junto
   * com o indicador que ele carrega: quando a base vai bem, a tela tem mais
   * luz. É a única cor decorativa do objeto, e ela é dado.
   */
  glow = 62,
  glowTone = '#1670c9',
  label,
  className = '',
}: {
  children: ReactNode;
  island?: ReactNode;
  glow?: number;
  glowTone?: string;
  /** Nome do objeto para leitor de tela. */
  label: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const { ref, handlers, tilting } = usePointerTilt<HTMLDivElement>({
    maxDeg: 3,
    disabled: reduced || coarse,
  });

  const lit = Math.max(0, Math.min(100, glow));

  return (
    <div className={`ios-stage ${className}`}>
      <div className="ios-device">
        <div className="ios-scaler">
          <div
            ref={ref}
            {...handlers}
            data-tilting={tilting ? 'true' : 'false'}
            className="ios-body"
          >
            {/* Botões físicos, na ordem real do 16 Pro. */}
            <span className="ios-key" data-side="left" style={{ top: 168, height: 32 }} aria-hidden="true" />
            <span className="ios-key" data-side="left" style={{ top: 232, height: 66 }} aria-hidden="true" />
            <span className="ios-key" data-side="left" style={{ top: 316, height: 66 }} aria-hidden="true" />
            <span className="ios-key" data-side="right" style={{ top: 262, height: 104 }} aria-hidden="true" />
            <span className="ios-key" data-side="right" style={{ top: 400, height: 44 }} aria-hidden="true" />

            <div className="ios-screen" role="group" aria-label={label}>
              {/* Papel de parede. Duas fontes de luz: a de cima dá o volume da
                  tela ligada, a de baixo é o indicador. */}
              <span
                aria-hidden="true"
                className="absolute inset-0 z-0"
                style={{
                  backgroundImage: [
                    'radial-gradient(130% 62% at 50% -8%, #1e242e 0%, #0d1015 52%, #07080a 100%)',
                    `radial-gradient(88% 44% at 50% 108%, color-mix(in oklab, ${glowTone} ${Math.round(10 + lit * 0.24)}%, transparent) 0%, transparent 70%)`,
                  ].join(', '),
                }}
              />

              <div className="relative z-10 flex h-full flex-col">{children}</div>

              {island && <div className="ios-island-wrap">{island}</div>}

              <span className="ios-home-indicator" aria-hidden="true" />
              <span className="ios-glare" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -- Barra de status -------------------------------------------------------
   Hora real, atualizada no minuto — não no segundo. Um relógio que pisca a
   cada segundo dentro de um painel de gestão puxa o olho para o canto errado
   sessenta vezes por minuto, e a hora exata não é a informação do objeto.

   Os três glifos da direita são SVG desenhado, não um ícone de biblioteca: em
   17px de altura, um ícone genérico de bateria não tem a proporção do glifo do
   sistema, e é exatamente esse desajuste que faz um mockup parecer mockup. */

export function IosStatusBar({ tint = '#ffffff' }: { tint?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    // Alinha o primeiro disparo à virada do minuto, e só então passa a cada 60s.
    const ms = (60 - new Date().getSeconds()) * 1000;
    let interval = 0;
    const timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, ms);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-[26px]"
      style={{ height: IOS.safeTop - 15, color: tint }}
    >
      <span
        className="w-[112px] text-center text-[17px] leading-none font-semibold"
        style={{ letterSpacing: '-0.01em' }}
      >
        {time}
      </span>

      <span className="flex items-center gap-[6px]">
        <CellularGlyph />
        <WifiGlyph />
        <BatteryGlyph />
      </span>
    </div>
  );
}

function CellularGlyph() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 4.6}
          y={9 - i * 2.7}
          width="3.1"
          height={3 + i * 2.7}
          rx="1"
          opacity={i === 3 ? 0.35 : 1}
        />
      ))}
    </svg>
  );
}

function WifiGlyph() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor">
      <path d="M1 4.1a10.6 10.6 0 0 1 14 0" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M3.7 6.9a6.8 6.8 0 0 1 8.6 0" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="10.2" r="1.35" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BatteryGlyph() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
      <rect x="0.6" y="0.6" width="22" height="11.8" rx="3.4" stroke="currentColor" opacity="0.4" />
      <rect x="2.2" y="2.2" width="16.6" height="8.6" rx="2.1" fill="currentColor" />
      <path
        d="M24.4 4.6c1 .3 1.6 1 1.6 1.9s-.6 1.6-1.6 1.9V4.6Z"
        fill="currentColor"
        opacity="0.4"
      />
    </svg>
  );
}

/* -- Ilha dinâmica ---------------------------------------------------------
   O padrão da referência usado pelo que ele é bom: um recorte pequeno, sempre
   visível, com o estado mais recente — e que CRESCE a partir de si mesmo
   quando você toca, em vez de abrir uma caixa em outro lugar da tela.

   A expansão é `layout` do Motion sobre a mesma caixa preta, então a pílula e
   o painel são o mesmo objeto em dois tamanhos. Trocar um nó pelo outro daria
   um corte; aqui a forma se estica, que é o que o aparelho faz.

   Colapsada, a ilha ocupa exatamente os 125 x 36 pt do hardware quando não há
   atividade. Com atividade, ela alarga para caber o glifo à esquerda e o valor
   à direita — o mesmo comportamento do sistema, e a razão de a largura ser
   `auto` com um mínimo em vez de fixa.
*/

export function DynamicIsland({
  expanded,
  onToggle,
  leading,
  trailing,
  children,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  /** Glifo à esquerda na forma compacta. */
  leading?: ReactNode;
  /** Valor à direita na forma compacta. */
  trailing?: ReactNode;
  /** Conteúdo da forma expandida. */
  children: ReactNode;
  label: string;
}) {
  const reduced = useReducedMotion();
  const hasCompact = Boolean(leading || trailing);

  const style: CSSProperties = expanded
    ? { width: 371, borderRadius: 34 }
    : {
        minWidth: IOS.islandW,
        height: IOS.islandH,
        borderRadius: IOS.islandH / 2,
        paddingLeft: hasCompact ? 11 : 0,
        paddingRight: hasCompact ? 11 : 0,
      };

  return (
    <motion.button
      type="button"
      layout
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? `Recolher ${label}` : `Expandir ${label}`}
      transition={reduced ? { duration: 0 } : springSoft}
      style={style}
      className="ios-island flex items-center justify-between overflow-hidden text-white"
    >
      {expanded ? (
        <motion.div
          layout="position"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: reduced ? 0 : 0.08 }}
          className="w-full px-4 py-3.5 text-left"
        >
          {children}
        </motion.div>
      ) : (
        hasCompact && (
          <motion.div
            layout="position"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, delay: reduced ? 0 : 0.06 }}
            className="flex w-full items-center justify-between gap-3"
          >
            {leading}
            {trailing}
          </motion.div>
        )
      )}
    </motion.button>
  );
}
