import { useSyncExternalStore } from 'react';
import type { User } from '@calendarios/core';

/* ==========================================================================
   Sessão
   --------------------------------------------------------------------------
   O token de sessão fica no localStorage deste navegador. Todo acesso é
   protegido: navegação privada ou armazenamento bloqueado apenas fazem a
   pessoa entrar de novo — nunca quebram a tela.
   ========================================================================== */

const KEY = 'calendarios.v1.session';

interface Session {
  token: string;
  user: User;
}

let current: Session | null = read();
const listeners = new Set<() => void>();

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function emit() {
  for (const l of listeners) l();
}

export function setSession(s: Session) {
  current = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento: vale só nesta aba */
  }
  emit();
}

export function clearSession() {
  current = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
  emit();
}

export function getToken(): string | null {
  return current?.token ?? null;
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
