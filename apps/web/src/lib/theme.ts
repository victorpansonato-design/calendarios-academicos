import { useSyncExternalStore } from 'react';
import { emphasis } from './motion';

/* ==========================================================================
   Tema
   --------------------------------------------------------------------------
   Preferência: claro, escuro ou sistema (o padrão, como no template Anchieta).
   No modo sistema, o tema acompanha o `prefers-color-scheme` do aparelho.

   Opt-in por classe (.dark no <html>). A chave e o formato (JSON, com aspas)
   precisam bater com o script de pré-pintura do index.html — se mudar um,
   mude o outro.

   Troca com revelação circular: o tema novo nasce no ponto clicado e cresce
   até cobrir a tela (View Transitions API). Só anima quando o tema visível
   muda de fato, e nunca quando a mudança vem do sistema. Navegador sem
   suporte ou pessoa com "reduzir movimento" ligado: troca direta.
   ========================================================================== */

const KEY = 'calendarios.v1.theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 'system';
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      /* valor antigo, sem aspas */
    }
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

let preference: ThemePreference = readPreference();

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === 'system') return media?.matches ? 'dark' : 'light';
  return pref;
}

function currentResolved(): ResolvedTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function paint(theme: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

function notify() {
  for (const l of listeners) l();
}

// Modo sistema: segue o aparelho, sem animação (ninguém clicou em nada).
media?.addEventListener('change', () => {
  if (preference !== 'system') return;
  paint(resolve('system'));
  notify();
});

function commit(pref: ThemePreference) {
  preference = pref;
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {
    /* sem armazenamento */
  }
  paint(resolve(pref));
  notify();
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

/** Muda a preferência. `origin` é o ponto (em px da janela) de onde o círculo cresce. */
export function setPreference(pref: ThemePreference, origin?: { x: number; y: number }) {
  const changes = resolve(pref) !== currentResolved();
  const doc = document as ViewTransitionDoc;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!changes || !doc.startViewTransition || reduce || !origin) {
    commit(pref);
    return;
  }
  const { x, y } = origin;
  // raio até o canto mais distante: o círculo sempre cobre a tela inteira
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(() => commit(pref));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 560, easing: `cubic-bezier(${emphasis.join(',')})`, pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: typeof setPreference;
  /** Alterna claro ↔ escuro a partir do tema visível. */
  toggle: (origin?: { x: number; y: number }) => void;
} {
  const pref = useSyncExternalStore(subscribe, () => preference);
  const resolved = useSyncExternalStore(subscribe, currentResolved);
  return {
    preference: pref,
    resolved,
    setPreference,
    toggle: (origin) => setPreference(resolved === 'dark' ? 'light' : 'dark', origin),
  };
}
