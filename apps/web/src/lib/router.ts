import { useSyncExternalStore } from 'react';

/* ==========================================================================
   Rotas (hash)
   --------------------------------------------------------------------------
     #/calendarios                       lista
     #/calendarios/:id/:aba              um calendário (aba opcional)
     #/notificacoes/:aba                 agenda | acontecimentos
     #/visao-aluno/portal[?calendario=]  como o aluno vê no Portal do aluno
     #/visao-aluno/app[?calendario=]     como o aluno vê no App Grupo Anchieta
   Hash e não History API: funciona servido de qualquer pasta, sem regra de
   reescrita no servidor — um detalhe a menos para a TI na implantação.
   ========================================================================== */

export type Route =
  | { name: 'calendars' }
  | { name: 'calendar'; id: string; tab: string | null; focus: string | null }
  | { name: 'notifications'; tab: string | null }
  | { name: 'student-portal'; calendarId: string | null }
  | { name: 'student-app'; calendarId: string | null };

export function parse(hash: string): Route {
  const [pathPart, queryPart] = hash.replace(/^#/, '').split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart ?? '');
  if (parts[0] === 'notificacoes') return { name: 'notifications', tab: parts[1] ?? null };
  if (parts[0] === 'visao-aluno' && parts[1] === 'portal') return { name: 'student-portal', calendarId: query.get('calendario') };
  if (parts[0] === 'visao-aluno' && parts[1] === 'app') return { name: 'student-app', calendarId: query.get('calendario') };
  if (parts[0] === 'calendarios' && parts[1]) return { name: 'calendar', id: parts[1], tab: parts[2] ?? null, focus: query.get('evento') };
  return { name: 'calendars' };
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parse(hash);
}

export function navigate(path: string) {
  const next = path.startsWith('#') ? path : `#${path}`;
  if (window.location.hash !== next) window.location.hash = next;
}

export const paths = {
  calendars: () => '#/calendarios',
  calendar: (id: string, tab?: string, eventId?: string) => `#/calendarios/${id}${tab ? `/${tab}` : ''}${eventId ? `?evento=${eventId}` : ''}`,
  notifications: (tab?: string) => `#/notificacoes${tab ? `/${tab}` : ''}`,
  studentPortal: (calendarId?: string) => `#/visao-aluno/portal${calendarId ? `?calendario=${calendarId}` : ''}`,
  studentApp: (calendarId?: string) => `#/visao-aluno/app${calendarId ? `?calendario=${calendarId}` : ''}`,
};
