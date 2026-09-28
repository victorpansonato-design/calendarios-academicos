import type { Permission, Role } from './types';

/* ==========================================================================
   Papéis e permissões
   --------------------------------------------------------------------------
   Quem pode o quê. A API checa estas permissões em cada rota; a interface
   só as usa para esconder botões que a pessoa não pode usar.

     leitor       vê calendários e a agenda de avisos
     editor       + importa PDFs e edita rascunhos
     revisor      + confere pendências e envia para revisão
     publicador   + publica e arquiva
     comunicador  + envia comunicações adicionais e configura acontecimentos
     admin        tudo, inclusive auditoria

   Separar "quem edita" de "quem publica" é o que torna a revisão real: com
   papéis distintos, um calendário não vai ao ar sem dois pares de olhos.
   ========================================================================== */

const READ: Permission[] = ['calendar.read', 'notification.read'];
const EDIT: Permission[] = [...READ, 'calendar.import', 'calendar.edit'];
const REVIEW: Permission[] = [...EDIT, 'calendar.review'];
const PUBLISH: Permission[] = [...REVIEW, 'calendar.publish', 'calendar.archive'];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  leitor: READ,
  editor: EDIT,
  revisor: REVIEW,
  publicador: PUBLISH,
  comunicador: [...READ, 'notification.send', 'lifecycle.configure'],
  admin: [...PUBLISH, 'notification.send', 'lifecycle.configure', 'audit.read'],
};

export const ROLE_LABEL: Record<Role, string> = {
  leitor: 'Leitura',
  editor: 'Edição',
  revisor: 'Revisão',
  publicador: 'Publicação',
  comunicador: 'Comunicação',
  admin: 'Administração',
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
