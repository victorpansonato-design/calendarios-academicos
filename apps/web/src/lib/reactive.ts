import { useEffect, useRef, useState } from 'react';

/* ==========================================================================
   Reatividade física — reduced motion, tilt e brilho posicional
   --------------------------------------------------------------------------
   A camada base do CSS já zera `animation-duration` e `transition-duration`
   quando o sistema pede menos movimento. Só que três coisas desta tela não são
   CSS e por isso escapam daquela regra:

     · o count-up dos números, que roda em `requestAnimationFrame`;
     · a inclinação do aparelho, que é uma variável CSS escrita pelo ponteiro;
     · o brilho que acompanha o cursor no vidro.

   As três precisam de um interruptor em JavaScript, e é este arquivo. Sem ele,
   "respeita prefers-reduced-motion" seria só uma linha de CSS que não alcança
   metade do movimento da página.
   ========================================================================== */

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * `true` quando o sistema pede menos movimento. Reavalia se o usuário trocar a
 * preferência com a aba aberta — no Windows isso acontece sem recarregar.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** `true` em ponteiro grosso (dedo). Nem tilt nem sheen fazem sentido no toque. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(pointer: coarse)');
    const onChange = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return coarse;
}

/* -- Inclinação por ponteiro ---------------------------------------------- */

export interface TiltHandlers {
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerLeave: () => void;
}

export interface TiltResult<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
  handlers: TiltHandlers;
  /** `true` enquanto o ponteiro está sobre o objeto — liga o `will-change`. */
  tilting: boolean;
}

/**
 * Escreve `--rx` / `--ry` no elemento a partir da posição do ponteiro.
 *
 * Três decisões que separam isto de um tilt de portfólio:
 *
 *   1. O ÂNGULO É PEQUENO. `maxDeg` fica em ~2,75°, porque acima de uns 4° o
 *      texto de dentro começa a perder nitidez de subpixel e um número passa a
 *      ser mais difícil de ler do que era antes do efeito.
 *   2. ESCREVE NO DOM, NÃO NO ESTADO. Um `setState` por `pointermove` re-renderiza
 *      a árvore inteira do hero sessenta vezes por segundo. Aqui a variável CSS
 *      é escrita direto no `style` do nó e o React não é acordado.
 *   3. VOLTA AO REPOUSO. Ao sair, os ângulos vão a zero e a transição longa
 *      (620ms) faz o objeto assentar em vez de saltar.
 *
 * Devolve `{ ref, handlers, tilting }`. Quando `disabled`, os handlers são
 * no-ops e nada é escrito — é assim que reduced motion e toque desligam o
 * efeito de verdade, e não apenas visualmente.
 */
export function usePointerTilt<T extends HTMLElement>({
  maxDeg = 2.75,
  disabled = false,
}: { maxDeg?: number; disabled?: boolean } = {}): TiltResult<T> {
  const ref = useRef<T | null>(null);
  const [tilting, setTilting] = useState(false);

  useEffect(() => {
    if (!disabled) return;
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
    setTilting(false);
  }, [disabled]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || e.pointerType === 'touch') return;
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // −1 … 1 a partir do centro do objeto.
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty('--ry', `${(nx * 2 * maxDeg).toFixed(2)}deg`);
    node.style.setProperty('--rx', `${(-ny * 2 * maxDeg).toFixed(2)}deg`);
    if (!tilting) setTilting(true);
  };

  const onPointerLeave = () => {
    const node = ref.current;
    if (node) {
      node.style.setProperty('--rx', '0deg');
      node.style.setProperty('--ry', '0deg');
    }
    setTilting(false);
  };

  return { ref, handlers: { onPointerMove, onPointerLeave }, tilting };
}

/* -- Brilho posicional ---------------------------------------------------- */

/**
 * Escreve `--mx` / `--my` (em %) para o brilho especular do vidro.
 *
 * A diferença entre "responde ao cursor" e "persegue o cursor" é o
 * amortecimento. Aqui o ponto de luz caminha 12% da distância até o ponteiro
 * por quadro: o reflexo chega onde o mouse está, mas sempre atrasado, que é
 * como luz se comporta numa superfície curva. Seguir 1:1 transforma o cartão
 * num holofote e rouba a atenção do número.
 *
 * O loop existe só enquanto o ponteiro está dentro. Fora dele não há
 * `requestAnimationFrame` rodando em lugar nenhum da página.
 */
export function useSheen<T extends HTMLElement>({ disabled = false }: { disabled?: boolean } = {}) {
  const ref = useRef<T | null>(null);
  const target = useRef({ x: 50, y: 0 });
  const current = useRef({ x: 50, y: 0 });
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const tick = () => {
    const node = ref.current;
    if (!node) return;
    const c = current.current;
    const t = target.current;
    c.x += (t.x - c.x) * 0.12;
    c.y += (t.y - c.y) * 0.12;
    node.style.setProperty('--mx', `${c.x.toFixed(1)}%`);
    node.style.setProperty('--my', `${c.y.toFixed(1)}%`);
    if (Math.abs(t.x - c.x) > 0.3 || Math.abs(t.y - c.y) > 0.3) {
      raf.current = requestAnimationFrame(tick);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || e.pointerType === 'touch') return;
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0) return;
    target.current = {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  };

  const onPointerLeave = () => {
    cancelAnimationFrame(raf.current);
    target.current = { x: 50, y: 0 };
    raf.current = requestAnimationFrame(tick);
  };

  return { ref, handlers: { onPointerMove, onPointerLeave } };
}
