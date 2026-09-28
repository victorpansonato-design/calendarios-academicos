import { useSyncExternalStore } from 'react';
import { emphasis } from './motion';

/* ==========================================================================
   Tema
   --------------------------------------------------------------------------
   Opt-in por classe (.dark no <html>). A chave precisa bater com o script de
   pré-pintura do index.html — se mudar uma, mude a outra.

   Troca com revelação circular: o tema novo nasce no botão clicado e cresce
   até cobrir a tela (View Transitions API). Navegador sem suporte ou pessoa
   com "reduzir movimento" ligado: troca direta, sem animação.
   ========================================================================== */

const KEY = 'calendarios.v1.theme';
type Theme = 'light' | 'dark';
const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(KEY, JSON.stringify(theme));
  } catch {
    /* sem armazenamento */
  }
  for (const l of listeners) l();
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

/** Troca o tema. `origin` é o ponto (em px da janela) de onde o círculo cresce. */
export function setTheme(theme: Theme, origin?: { x: number; y: number }) {
  const doc = document as ViewTransitionDoc;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce || !origin) {
    apply(theme);
    return;
  }
  const { x, y } = origin;
  // raio até o canto mais distante: o círculo sempre cobre a tela inteira
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(() => apply(theme));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 560, easing: `cubic-bezier(${emphasis.join(',')})`, pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
}

export function useTheme(): [Theme, (origin?: { x: number; y: number }) => void] {
  const theme = useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, current);
  return [theme, (origin) => setTheme(theme === 'dark' ? 'light' : 'dark', origin)];
}
