/* ==========================================================================
   Migrações
   --------------------------------------------------------------------------
   Cada migração roda uma vez, em ordem, dentro de uma transação. Nunca edite
   uma migração já aplicada — crie a próxima.

   Convenções:
     · ids são UUID em TEXT;
     · instantes são ISO 8601 UTC em TEXT;
     · estruturas aninhadas (escopo, legenda, pendências, evento completo)
       são JSON em TEXT, com o formato definido em packages/core/src/types.ts.
   ========================================================================== */

export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_init',
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- PDFs originais, endereçados pelo hash do conteúdo. Nunca são alterados.
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  page_count INTEGER,
  meta_json TEXT,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL,
  ignored_json TEXT NOT NULL DEFAULT '[]',
  options_json TEXT
);

CREATE TABLE import_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  relative_path TEXT NOT NULL,
  file_id TEXT REFERENCES files(id),
  sha256 TEXT,
  size INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  calendar_id TEXT,
  same_content_json TEXT NOT NULL DEFAULT '[]',
  already_json TEXT,
  group_leader_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  sort INTEGER NOT NULL
);
CREATE INDEX import_items_batch ON import_items(batch_id);
CREATE INDEX import_items_status ON import_items(status);

CREATE TABLE calendars (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  year INTEGER,
  semester INTEGER,
  scope_json TEXT NOT NULL,
  status TEXT NOT NULL,
  legend_json TEXT NOT NULL DEFAULT '[]',
  notes_json TEXT NOT NULL DEFAULT '[]',
  review_json TEXT NOT NULL,
  extraction_json TEXT,
  source_file_id TEXT REFERENCES files(id),
  published_version_id TEXT,
  published_version_number INTEGER,
  published_hash TEXT,
  modified_from_source INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Rascunho de trabalho. A versão publicada vive em calendar_versions.
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  data_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX events_calendar ON events(calendar_id);
CREATE UNIQUE INDEX events_calendar_uid ON events(calendar_id, uid);

-- Fotografias completas (dados gerais + eventos). Imutáveis.
CREATE TABLE calendar_versions (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX calendar_versions_number ON calendar_versions(calendar_id, number);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail_json TEXT
);
CREATE INDEX audit_entity ON audit_log(entity, entity_id);
CREATE INDEX audit_at ON audit_log(at);

-- Agenda de envios. idempotency_key UNIQUE: o mesmo aviso não é agendado duas vezes.
CREATE TABLE notification_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  calendar_id TEXT,
  event_uid TEXT,
  lifecycle_rule_id TEXT,
  audience_json TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  send_at TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  delivery_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  provider_message_id TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  sent_at TEXT,
  canceled_reason TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  claimed_at TEXT
);
CREATE INDEX jobs_due ON notification_jobs(status, send_at);
CREATE INDEX jobs_calendar ON notification_jobs(calendar_id);

CREATE TABLE job_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES notification_jobs(id),
  at TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE INDEX job_attempts_job ON job_attempts(job_id);

CREATE TABLE lifecycle_rules (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  data_json TEXT NOT NULL,
  sort INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Acontecimentos recebidos dos sistemas institucionais. external_event_id UNIQUE = idempotência.
CREATE TABLE student_events (
  id TEXT PRIMARY KEY,
  external_event_id TEXT NOT NULL UNIQUE,
  source_system TEXT NOT NULL,
  status_code TEXT NOT NULL,
  student_id TEXT NOT NULL,
  rule_id TEXT,
  step_id TEXT,
  outcome TEXT NOT NULL,
  job_ids_json TEXT NOT NULL DEFAULT '[]',
  received_at TEXT NOT NULL
);
CREATE INDEX student_events_received ON student_events(received_at);

-- Preferências e consentimentos sincronizados pela TI.
CREATE TABLE student_preferences (
  student_id TEXT PRIMARY KEY,
  push_opt_in INTEGER NOT NULL DEFAULT 1,
  email_opt_in INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    // Favoritos e "ocultar" do aluno (portal/app) + envios endereçados a um aluno.
    id: '002_student_marks',
    sql: `
CREATE TABLE student_event_marks (
  student_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  event_uid TEXT NOT NULL,
  mark TEXT NOT NULL CHECK (mark IN ('star', 'hide')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (student_id, calendar_id, event_uid)
);
CREATE INDEX student_marks_event ON student_event_marks(calendar_id, event_uid, mark);

ALTER TABLE notification_jobs ADD COLUMN student_id TEXT;
CREATE INDEX jobs_student ON notification_jobs(student_id, calendar_id, event_uid);
CREATE INDEX jobs_kind_calendar ON notification_jobs(kind, calendar_id, status);

-- Importância deixou de ligar avisos: só notification.enabled vale. Eventos
-- baixos/não definidos com aviso ligado por edição direta não passam a enviar.
UPDATE events SET data_json = json_set(data_json, '$.notification.enabled', json('false'))
 WHERE json_extract(data_json, '$.importance') IN ('low', 'unset')
   AND json_extract(data_json, '$.notification.enabled') = 1;
`,
  },
];
