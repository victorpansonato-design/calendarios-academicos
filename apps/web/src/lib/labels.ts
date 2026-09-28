import type { CalendarStatus, Importance, ImportItemStatus, IssueCode, JobKind, JobStatus } from '@calendarios/core';
import type { Tone } from '../components/ui/Badges';

/* Palavra + tom de cada estado. A palavra é sempre visível: cor nunca é o único canal. */

export const CALENDAR_STATUS: Record<CalendarStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Em preparação', tone: 'warn' },
  in_review: { label: 'Em preparação', tone: 'warn' },
  published: { label: 'Publicado', tone: 'info' },
  archived: { label: 'Fora do ar', tone: 'muted' },
};

export const IMPORT_STATUS: Record<ImportItemStatus, { label: string; tone: Tone }> = {
  staged: { label: 'Aguardando início', tone: 'muted' },
  queued: { label: 'Na fila', tone: 'muted' },
  reading: { label: 'Lendo', tone: 'info' },
  needs_review: { label: 'Precisa de atenção', tone: 'warn' },
  ready: { label: 'Pronto', tone: 'ok' },
  error: { label: 'Erro', tone: 'crit' },
  skipped: { label: 'Não importado', tone: 'muted' },
};

/* Importância, em linguagem de quem usa: o que ela significa é o aviso. */
export const IMPORTANCE: Record<Importance, { label: string; short: string; tone: Tone; help: string }> = {
  unset: { label: 'Aviso não escolhido', short: 'Não escolhido', tone: 'warn', help: 'Enquanto não escolher, nenhum aviso sai para este evento.' },
  low: { label: 'Sem aviso', short: 'Sem aviso', tone: 'muted', help: 'Os alunos veem o evento no calendário, mas não recebem aviso.' },
  medium: { label: 'Avisar 1 dia antes', short: '1 dia antes', tone: 'info', help: 'Os alunos recebem um aviso no app 1 dia antes, às 9h.' },
  high: { label: 'Avisar 3 dias e 1 dia antes', short: '3 e 1 dia antes', tone: 'risk', help: 'Os alunos recebem dois avisos no app: 3 dias antes e 1 dia antes, às 9h.' },
};

export const JOB_STATUS: Record<JobStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'Agendado', tone: 'info' },
  sending: { label: 'Enviando', tone: 'info' },
  sent: { label: 'Enviado', tone: 'ok' },
  demo_sent: { label: 'Simulado (demonstração)', tone: 'muted' },
  failed: { label: 'Falhou', tone: 'crit' },
  canceled: { label: 'Cancelado', tone: 'muted' },
  blocked: { label: 'Aguardando configuração', tone: 'warn' },
  skipped: { label: 'Não enviado', tone: 'muted' },
};

export const JOB_KIND: Record<JobKind, string> = {
  event_reminder: 'Aviso automático',
  additional: 'Envio adicional',
  lifecycle: 'Acontecimento do aluno',
};

/** Rótulo curto de cada pendência, para listas. A frase completa vem da API. */
export const ISSUE_LABEL: Record<IssueCode, string> = {
  date_unparsed: 'Data não reconhecida',
  date_invalid: 'Data inválida',
  date_ambiguous: 'Data ambígua',
  date_year_inferred: 'Ano suposto',
  date_outside_semester: 'Fora do semestre',
  text_mismatch_between_pages: 'Texto diferente entre páginas',
  low_confidence_association: 'Associação incerta',
  possible_duplicate: 'Possível duplicidade',
  ocr_extracted: 'Lido por OCR',
  missing_title: 'Sem título',
  importance_unset: 'Importância não definida',
  anchor_unconfirmed: 'Âncora do aviso não conferida',
  grid_color_mismatch: 'Grade diferente do ano',
  category_unmatched: 'Cor sem categoria',
  audience_detected: 'Público citado no texto',
  unassociated_text: 'Trecho sem data',
  courses_from_path: 'Sugerido pela pasta',
  possible_duplicate_calendar: 'Calendário parecido já existe',
  scope_unrecognized: 'Dado geral faltando',
  page_without_text: 'Página sem texto',
  grid_day_without_event: 'Dia colorido sem evento',
};

export const COHORT_LABEL = { ingressantes: 'Ingressantes', veteranos: 'Veteranos' } as const;

export const AUDIENCE_GROUPS = ['Ingressantes', 'Veteranos', 'Monitores', 'Dependência e Adaptação'];
