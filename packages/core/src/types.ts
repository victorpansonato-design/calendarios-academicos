/* ==========================================================================
   Tipos de domínio e contratos de API
   --------------------------------------------------------------------------
   Este arquivo é o contrato entre a API, a interface e as integrações futuras
   (portal do aluno, app, Lyceum, serviço de push e serviço de e-mail).

   Regras que atravessam todos os tipos:

     · Datas de calendário são strings ISO `AAAA-MM-DD` (sem hora, sem fuso).
       Um feriado em 12/10 é 12/10 em qualquer lugar.
     · Instantes (quando algo aconteceu ou vai acontecer) são ISO 8601 em UTC
       (`2026-08-24T12:00:00.000Z`). A conversão para America/Sao_Paulo é feita
       em `schedule.ts`, e em nenhum outro lugar.
     · Horários de parede (07h30 do turno diurno) são `HH:mm` e sempre se
       referem a America/Sao_Paulo.
     · Nada aqui faz I/O. Os tipos descrevem dados; a API os persiste.
   ========================================================================== */

export type ISODate = string; // AAAA-MM-DD
export type ISOInstant = string; // AAAA-MM-DDTHH:mm:ss.sssZ
export type WallTime = string; // HH:mm em America/Sao_Paulo

export const TIME_ZONE = 'America/Sao_Paulo';

/* -- Pessoas e permissões ------------------------------------------------- */

export type Role = 'leitor' | 'editor' | 'revisor' | 'publicador' | 'comunicador' | 'admin';

export type Permission =
  | 'calendar.read'
  | 'calendar.import'
  | 'calendar.edit'
  | 'calendar.review'
  | 'calendar.publish'
  | 'calendar.archive'
  | 'notification.read'
  | 'notification.send'
  | 'lifecycle.configure'
  | 'audit.read';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/* -- Calendário ----------------------------------------------------------- */

/** Rascunho → Em revisão → Publicado → Arquivado. */
export type CalendarStatus = 'draft' | 'in_review' | 'published' | 'archived';

export const CALENDAR_STATUS_LABEL: Record<CalendarStatus, string> = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  published: 'Publicado',
  archived: 'Arquivado',
};

export type Cohort = 'ingressantes' | 'veteranos';

/** Quem o calendário atende. Tudo é texto livre revisável — a instituição
    tem mais recortes do que um enum conseguiria prever. */
export interface CalendarScope {
  /** "Presencial", "EAD", "Híbrido — quinzenal", … */
  modality: string;
  /** Cursos abrangidos. Vazio = todos os cursos da modalidade. */
  courses: string[];
  /** Exceções explícitas do PDF, ex.: ["Direito"]. */
  exceptions: string[];
  /** Ingressantes, veteranos ou ambos. Vazio = ambos. */
  cohorts: Cohort[];
  /** Redação do PDF, preservada: "Cursos Presenciais (exceto Direito)". */
  audienceLabel: string;
}

export interface LegendEntry {
  key: string;
  label: string;
  /** Cor da legenda, #rrggbb — exceção funcional ao design system. */
  color: string;
  /** `fill` pinta a célula; `corner` é o triângulo de "mais de um evento"; `dot` é um marcador pequeno. */
  style: 'fill' | 'corner' | 'dot';
  /** Seção do PDF onde a entrada estava ("Legenda", "Início do semestre"). */
  group: string;
  fromPdf: boolean;
}

/** Observação que vale para o calendário inteiro (rodapé, "Fique atento!"). */
export interface CalendarNote {
  id: string;
  text: string;
  source?: SourceRef;
}

export interface CalendarSummary {
  id: string;
  title: string;
  year: number | null;
  semester: 1 | 2 | null;
  scope: CalendarScope;
  status: CalendarStatus;
  /** Existe uma versão publicada (mesmo que o rascunho atual tenha mudanças). */
  publishedVersion: number | null;
  /** O rascunho atual difere da versão publicada. */
  hasUnpublishedChanges: boolean;
  eventCount: number;
  pendingCount: number;
  sourceFileId: string | null;
  sourceFileName: string | null;
  updatedAt: ISOInstant;
  updatedBy: string;
  createdAt: ISOInstant;
}

export interface Calendar extends CalendarSummary {
  legend: LegendEntry[];
  notes: CalendarNote[];
  /** Pendências no nível do calendário (cursos sugeridos por pasta, duplicidade…). */
  review: ReviewState;
  extraction: ExtractionReport | null;
  /** O dado atual foi alterado em relação ao que foi lido do PDF. */
  modifiedFromSource: boolean;
  version: number;
}

/* -- Evento --------------------------------------------------------------- */

export type DateKind = 'single' | 'range' | 'list';

export interface EventDates {
  kind: DateKind;
  /** Primeira data (início do período, ou primeira da lista). */
  start: ISODate;
  /** Última data (fim do período, ou última da lista). Igual a start se única. */
  end: ISODate;
  /** Somente para `list`: as datas isoladas, em ordem. Nunca vira intervalo. */
  dates: ISODate[];
  /** Como estava escrito no PDF: "13, 14, 27 e 28/11". */
  label: string;
}

export type Shift = 'Diurno' | 'Noturno' | 'Matutino' | 'Vespertino' | 'Integral';

export interface EventTime {
  /** Turno, quando o PDF separa horário por turno. */
  shift: Shift | null;
  time: WallTime;
  /** Redação original: "Horário de início - Diurno: 07h30". */
  raw: string;
}

export type EventType =
  | 'holiday'
  | 'exam'
  | 'deadline'
  | 'enrollment'
  | 'term_start'
  | 'term_end'
  | 'online_event'
  | 'academic'
  | 'other';

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  holiday: 'Feriado ou recesso',
  exam: 'Prova ou avaliação',
  deadline: 'Prazo',
  enrollment: 'Inscrição',
  term_start: 'Início de atividades',
  term_end: 'Encerramento',
  online_event: 'Evento on-line',
  academic: 'Atividade acadêmica',
  other: 'Outro',
};

/**
 * Importância editorial: decide ONDE o evento aparece para o aluno, não se ele
 * recebe push (isso é `notification`). Alta e Média entram automaticamente em
 * "Importantes"; Baixa (e não definida) fica só no calendário completo.
 */
export type Importance = 'unset' | 'low' | 'medium' | 'high';

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  unset: 'Importância não definida',
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
};

/** Para períodos: a antecedência conta a partir do início ou do fim.
    Para listas: antes de cada data isolada, ou só antes da primeira. */
export type ReminderAnchor = 'start' | 'end' | 'each' | 'first';

export interface ReminderOffset {
  /** Identidade estável do lembrete dentro do evento ("d3", "d1", "d0"). */
  id: string;
  /** 0 = no dia do evento. */
  daysBefore: number;
  /** Horário de envio. Vazio = ainda não informado, e isso trava a publicação. */
  time: WallTime | '';
}

export interface EventNotificationRule {
  enabled: boolean;
  offsets: ReminderOffset[];
  anchor: ReminderAnchor;
  /** Uma pessoa conferiu a âncora sugerida. Exigido para períodos com aviso. */
  anchorConfirmed: boolean;
  pushTitle: string;
  pushBody: string;
  /** A equipe editou os lembretes à mão. */
  customized: boolean;
}

export interface EventAudience {
  /** Vazio = mesmo público do calendário. */
  groups: string[];
  /** Texto do PDF que motivou o recorte, ex.: "apenas aos alunos monitores". */
  evidence: string | null;
}

/** De onde veio o dado: arquivo, página e retângulo (pontos PDF, origem no topo). */
export interface SourceRef {
  fileId: string;
  page: number;
  bbox: [number, number, number, number] | null;
  /** Redação lida nessa página (pode diferir entre páginas — ver revisão). */
  text: string;
  method: 'text_layer' | 'ai_ocr' | 'manual';
}

export type IssueSeverity = 'blocker' | 'warning' | 'info';

export type IssueCode =
  | 'date_unparsed'
  | 'date_invalid'
  | 'date_ambiguous'
  | 'date_year_inferred'
  | 'date_outside_semester'
  | 'text_mismatch_between_pages'
  | 'low_confidence_association'
  | 'possible_duplicate'
  | 'ocr_extracted'
  | 'missing_title'
  | 'importance_unset'
  | 'anchor_unconfirmed'
  | 'grid_color_mismatch'
  | 'category_unmatched'
  | 'audience_detected'
  | 'unassociated_text'
  | 'courses_from_path'
  | 'possible_duplicate_calendar'
  | 'scope_unrecognized'
  | 'page_without_text'
  | 'grid_day_without_event'
  | 'reminder_time_missing'
  | 'reminder_after_start'
  | 'legend_missing';

export interface ReviewIssue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  field?: string;
  /** Detalhe técnico (versões divergentes, datas encontradas…). */
  detail?: unknown;
}

export interface ReviewState {
  issues: ReviewIssue[];
  /** Códigos que alguém marcou como conferidos, com autoria. */
  acknowledged: { code: IssueCode; by: string; at: ISOInstant }[];
  /** 0–1. Quão seguro o extrator está da associação data ↔ descrição. */
  confidence: number;
}

export interface CalendarEvent {
  id: string;
  /** Identidade estável entre versões — é por ela que os avisos são casados. */
  uid: string;
  calendarId: string;
  title: string;
  description: string;
  /** Redação integral do PDF, nunca editada. Null para eventos criados à mão. */
  rawText: string | null;
  dates: EventDates;
  /** Null quando não foi possível resolver a data — fica pendente. */
  datesResolved: boolean;
  times: EventTime[];
  location: string | null;
  urls: string[];
  notes: string[];
  audience: EventAudience;
  type: EventType;
  /** Chave da legenda. Null quando o evento não tinha cor no PDF. */
  category: string | null;
  color: string | null;
  importance: Importance;
  notification: EventNotificationRule;
  sources: SourceRef[];
  review: ReviewState;
  origin: 'import' | 'manual';
  /** Algum campo foi alterado em relação à leitura do PDF. */
  modifiedFromSource: boolean;
  sortOrder: number;
  createdAt: ISOInstant;
  updatedAt: ISOInstant;
  updatedBy: string;
}

/** Campos que a interface pode enviar ao criar/editar um evento. */
export type EventInput = Pick<
  CalendarEvent,
  | 'title'
  | 'description'
  | 'dates'
  | 'times'
  | 'location'
  | 'urls'
  | 'notes'
  | 'audience'
  | 'type'
  | 'category'
  | 'color'
  | 'importance'
  | 'notification'
>;

/* -- Extração ------------------------------------------------------------- */

export interface ExtractionPageReport {
  page: number;
  kind: 'overview' | 'monthly' | 'other' | 'no_text';
  /** Linhas de tabela (data ↔ descrição) encontradas. */
  rows: number;
  textItems: number;
  method: 'text_layer' | 'ai_ocr' | 'none';
  /** Como as linhas foram delimitadas. */
  rowStrategy: 'date_cells' | 'separators' | 'nearest_date' | 'none';
  unassociated: { text: string; bbox: [number, number, number, number] }[];
}

export interface ExtractionReport {
  fileId: string;
  pageCount: number;
  pagesProcessed: number;
  rowsFound: number;
  eventsFound: number;
  mergedAcrossPages: number;
  datesRecognized: number;
  datesPending: number;
  possibleDuplicates: number;
  unassociatedSnippets: number;
  pages: ExtractionPageReport[];
  /** Cores da grade semestral por dia, lidas da página de visão geral. */
  gridDays: Record<ISODate, string[]>;
  pdfTitle: string | null;
  pdfMetadata: Record<string, string>;
  ocr: 'not_needed' | 'used' | 'unavailable';
  durationMs: number;
  engineVersion: string;
}

/* -- Importação ----------------------------------------------------------- */

export type ImportItemStatus =
  | 'staged'
  | 'queued'
  | 'reading'
  | 'needs_review'
  | 'ready'
  | 'error'
  | 'skipped';

export const IMPORT_STATUS_LABEL: Record<ImportItemStatus, string> = {
  staged: 'Aguardando início',
  queued: 'Na fila',
  reading: 'Lendo',
  needs_review: 'Precisa de revisão',
  ready: 'Pronto para publicar',
  error: 'Erro',
  skipped: 'Não importado',
};

export interface ImportItem {
  id: string;
  batchId: string;
  relativePath: string;
  fileId: string | null;
  sha256: string | null;
  size: number;
  status: ImportItemStatus;
  error: string | null;
  calendarId: string | null;
  /** Outros caminhos deste lote com o mesmo conteúdo (mesmo hash). */
  sameContentAs: string[];
  /** Calendário já existente com este mesmo arquivo. */
  alreadyImportedAs: { calendarId: string; title: string } | null;
  /** Grupo de arquivos idênticos que vira um calendário só. */
  groupLeaderId: string | null;
  attempts: number;
  startedAt: ISOInstant | null;
  finishedAt: ISOInstant | null;
  pendingCount: number;
  eventCount: number;
}

export interface IgnoredEntry {
  path: string;
  reason: string;
}

export interface ImportBatch {
  id: string;
  createdAt: ISOInstant;
  createdBy: string;
  status: 'staged' | 'running' | 'done';
  items: ImportItem[];
  ignored: IgnoredEntry[];
}

/** Decisão por grupo de arquivos idênticos antes de iniciar. */
export interface ImportStartOptions {
  /** true = arquivos idênticos viram um calendário, com os cursos das pastas. */
  mergeIdentical: boolean;
  /** Itens que já existiam no sistema e a pessoa quer importar mesmo assim. */
  forceItemIds: string[];
}

/* -- Versões e auditoria -------------------------------------------------- */

export interface CalendarVersionSummary {
  id: string;
  calendarId: string;
  number: number;
  kind: 'import' | 'edit' | 'submit' | 'publish' | 'restore' | 'archive';
  summary: string;
  createdAt: ISOInstant;
  createdBy: string;
  published: boolean;
  eventCount: number;
}

export interface AuditEntry {
  id: string;
  at: ISOInstant;
  actor: string;
  action: string;
  entity: 'calendar' | 'event' | 'import' | 'notification' | 'lifecycle_rule' | 'system';
  entityId: string;
  summary: string;
  detail: unknown;
}

/* -- Notificações --------------------------------------------------------- */

export type Channel = 'push' | 'email';

/** `favorite_reminder`: lembrete de um evento que o aluno marcou com estrela — vai só para ele. */
export type JobKind = 'event_reminder' | 'additional' | 'lifecycle' | 'favorite_reminder';

export type JobStatus =
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'demo_sent'
  | 'failed'
  | 'canceled'
  | 'blocked'
  | 'skipped';

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  scheduled: 'Agendado',
  sending: 'Enviando',
  sent: 'Enviado',
  demo_sent: 'Simulado (demonstração)',
  failed: 'Falhou',
  canceled: 'Cancelado',
  blocked: 'Aguardando configuração',
  skipped: 'Não enviado',
};

/** Para quem vai. Um envio de acontecimento tem exatamente um aluno. */
export type Audience =
  | {
      type: 'calendar';
      calendarId: string;
      scope: CalendarScope;
      /** Recorte do evento (monitores, DP/Adaptação…). */
      groups: string[];
      label: string;
    }
  | {
      type: 'student';
      studentId: string;
      label: string;
    };

export interface NotificationJob {
  id: string;
  kind: JobKind;
  channel: Channel;
  calendarId: string | null;
  eventUid: string | null;
  lifecycleRuleId: string | null;
  audience: Audience;
  title: string;
  body: string;
  sendAt: ISOInstant;
  status: JobStatus;
  /** Chave única do agendamento: impede dois registros para o mesmo aviso. */
  idempotencyKey: string;
  /** Chave de entrega enviada ao provedor: impede duas entregas do mesmo envio. */
  deliveryKey: string;
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: ISOInstant;
  createdBy: string;
  sentAt: ISOInstant | null;
  canceledReason: string | null;
  /** Contexto para leitura humana: título do evento, calendário, regra. */
  context: { calendarTitle?: string; eventTitle?: string; ruleName?: string; offsetLabel?: string };
}

export interface JobAttempt {
  id: string;
  jobId: string;
  at: ISOInstant;
  outcome: 'sent' | 'demo_sent' | 'failed' | 'blocked' | 'skipped';
  detail: string;
}

export interface AdditionalCommunicationInput {
  calendarId: string;
  eventUid: string | null;
  channel: Channel;
  title: string;
  body: string;
  /** Null = enviar agora. */
  sendAt: ISOInstant | null;
  /** Recorte do público; vazio = público inteiro do calendário. */
  groups: string[];
}

/** Resultado de comparar os avisos agendados com os que a versão nova exige. */
export interface ReminderDiff<P extends PlannedReminder = PlannedReminder> {
  create: P[];
  update: { before: NotificationJob; after: P }[];
  cancel: { job: NotificationJob; reason: string }[];
  unchanged: number;
}

export interface PlannedReminder {
  idempotencyKey: string;
  calendarId: string;
  eventUid: string;
  offsetId: string;
  occurrence: ISODate;
  sendAt: ISOInstant;
  title: string;
  body: string;
  channel: Channel;
  offsetLabel: string;
  eventTitle: string;
}

/** Lembrete de favorito: o mesmo aviso, endereçado a um aluno só. */
export interface PlannedFavoriteReminder extends PlannedReminder {
  studentId: string;
}

/* -- Visão do aluno (portal e app) --------------------------------------- */

/** Marcação do aluno num evento: estrela (leva para Importantes) ou ocultar (só Média). */
export type StudentMark = 'star' | 'hide';

export interface StudentEventMark {
  studentId: string;
  calendarId: string;
  eventUid: string;
  mark: StudentMark;
  updatedAt: ISOInstant;
}

/** Importância como o aluno enxerga: não definida conta como baixa. */
export type StudentImportance = 'high' | 'medium' | 'low';

/** Evento como sai na leitura pública (portal/app). Nunca expõe rascunho, pendências ou autoria. */
export interface PublicCalendarEvent {
  uid: string;
  title: string;
  description: string;
  dates: EventDates;
  times: EventTime[];
  location: string | null;
  urls: string[];
  notes: string[];
  /** Recortes de público (vazio = público inteiro do calendário). */
  audience: string[];
  type: EventType;
  category: string | null;
  color: string | null;
  importance: Importance;
  studentImportance: StudentImportance;
  /** O calendário já manda push deste evento para todos — favoritar não duplica. */
  calendarReminder: { enabled: boolean; labels: string[] };
  /** Texto do push do evento (o favorito usa exatamente este). */
  pushTitle: string;
  pushBody: string;
  anchor: ReminderAnchor;
  /** Redação do PDF, para "ver texto oficial". Null em eventos criados à mão. */
  officialText: string | null;
}

export interface PublicCalendar {
  id: string;
  version: number;
  publishedAt: ISOInstant | null;
  /** `draft` só aparece na prévia da equipe. */
  source: 'published' | 'draft';
  title: string;
  year: number | null;
  semester: 1 | 2 | null;
  scope: CalendarScope;
  legend: LegendEntry[];
  notes: { id: string; text: string }[];
  /** Arquivo original, para o link "PDF oficial". */
  sourceFileId: string | null;
  sourceFileName: string | null;
  events: PublicCalendarEvent[];
}

/** O que a publicação muda para os alunos (mostrado antes de publicar). */
export interface StudentImpact {
  importantes: number;
  unset: number;
  withoutLegend: number;
  favorites: { create: number; update: number; cancel: number; students: number };
}

/* -- Acontecimentos do aluno --------------------------------------------- */

export type LifecycleTiming =
  | { mode: 'immediate' }
  | { mode: 'delay'; minutes: number }
  | { mode: 'business_hours'; start: WallTime; end: WallTime };

export interface LifecycleStep {
  id: string;
  /** Nome humano do desdobramento ("Deferida", "Indeferida"…). */
  label: string;
  /** Mapeamento técnico preenchido pela TI. Sem ele a etapa não dispara. */
  trigger: { sourceSystem: string; statusCode: string; notes: string };
  enabled: boolean;
  channels: Channel[];
  timing: LifecycleTiming;
  pushTitle: string;
  pushBody: string;
  emailSubject: string;
  emailBody: string;
}

export interface LifecycleRule {
  id: string;
  key: string;
  name: string;
  description: string;
  /** Variáveis que a mensagem pode usar, com exemplo fictício para a prévia. */
  variables: { key: string; label: string; example: string }[];
  steps: LifecycleStep[];
  updatedAt: ISOInstant;
  updatedBy: string;
}

/** O que os sistemas institucionais enviam quando um status muda. */
export interface StudentEventPayload {
  /** Identificador único na origem — reenvio com o mesmo id é ignorado. */
  eventId: string;
  sourceSystem: string;
  statusCode: string;
  occurredAt: ISOInstant;
  student: { id: string; ra?: string; firstName?: string };
  /** Dados do acontecimento usados no modelo ({{solicitacao.protocolo}}…). */
  data?: Record<string, string | number | null>;
}

export interface StudentEventRecord {
  id: string;
  externalEventId: string;
  sourceSystem: string;
  statusCode: string;
  studentId: string;
  ruleId: string | null;
  stepId: string | null;
  outcome: 'scheduled' | 'unmapped' | 'disabled' | 'opted_out' | 'duplicate';
  jobIds: string[];
  receivedAt: ISOInstant;
}

export interface StudentPreference {
  studentId: string;
  pushOptIn: boolean;
  emailOptIn: boolean;
  updatedAt: ISOInstant;
}

/* -- Sistema -------------------------------------------------------------- */

export type ServiceState = 'configured' | 'missing' | 'demo';

export interface SystemStatus {
  demoMode: boolean;
  authMode: 'dev' | 'entra';
  services: {
    ai: { state: ServiceState; detail: string };
    push: { state: ServiceState; detail: string };
    email: { state: ServiceState; detail: string };
    integrations: { state: ServiceState; detail: string };
  };
  limits: { maxFileMb: number; maxBatchMb: number; maxZipEntries: number };
  timeZone: string;
  version: string;
}
