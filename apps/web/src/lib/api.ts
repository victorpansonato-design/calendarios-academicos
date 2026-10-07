import type {
  AdditionalCommunicationInput,
  AuditEntry,
  Calendar,
  CalendarEvent,
  CalendarScope,
  CalendarSummary,
  CalendarVersionSummary,
  CalendarNote,
  EventInput,
  ImportBatch,
  Importance,
  IssueCode,
  JobAttempt,
  LegendEntry,
  LifecycleRule,
  LifecycleStep,
  NotificationJob,
  PlannedReminder,
  PublicCalendar,
  PublishCheck,
  ReminderDiff,
  StudentEventRecord,
  StudentImpact,
  SystemStatus,
  User,
  Audience,
} from '@calendarios/core';
import { clearSession, getToken } from './session';

/* ==========================================================================
   Cliente da API
   --------------------------------------------------------------------------
   Uma função por rota, com os tipos do contrato (packages/core). As telas
   nunca montam URL nem tratam status HTTP — só chamam `api.*` e mostram
   `ApiError.message`, que já vem em português, pronta para a pessoa ler.
   ========================================================================== */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

/**
 * Endereço da API. Vazio = mesma origem (desenvolvimento e implantação única).
 * Com a interface na Vercel e a API em outro servidor, defina VITE_API_URL
 * (ex.: https://calendarios-api.anchieta.br) no build da interface.
 */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

/** Demonstração só-interface: as rotas são atendidas no próprio navegador (src/demo). */
export const DEMO = import.meta.env.VITE_DEMO === 'true';

async function demo<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { demoRequest, DemoError } = await import('../demo/server');
  try {
    return (await demoRequest(method, path, body)) as T;
  } catch (err) {
    if (err instanceof DemoError) throw new ApiError(err.status, err.message, err.detail);
    throw err;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (DEMO) return demo<T>(method, path, body);
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Confira sua internet e tente de novo.');
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // resposta que não é da API (ex.: página 404 da hospedagem)
    throw new ApiError(res.status, 'O servidor do sistema não respondeu. Se esta é a versão publicada, confira se a API está no ar e se VITE_API_URL aponta para ela.');
  }
  if (res.status === 401 && !path.startsWith('/api/auth/login')) {
    clearSession();
    throw new ApiError(401, 'Sua sessão expirou. Entre novamente.');
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; detail?: unknown };
    throw new ApiError(res.status, d.error ?? `Erro ${res.status}`, d.detail);
  }
  return data as T;
}

export type CalendarDetail = { calendar: Calendar; events: CalendarEvent[]; publishCheck: PublishCheck };

export interface ImportanceSuggestionRow {
  eventId: string;
  title: string;
  dateLabel: string;
  from: Importance;
  to: Exclude<Importance, 'unset'>;
  ruleId: string;
  reason: string;
}

/** Lembrete de favorito como o aluno vê. */
export interface StudentReminder {
  eventUid: string | null;
  sendAt: string;
  status: string;
  offsetLabel: string;
  title: string;
  body: string;
}

export interface StarResult {
  mark: 'star';
  coveredByCalendar: boolean;
  pushOptIn: boolean | null;
  reminders: StudentReminder[];
  note: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/** Envio com progresso (XHR — o fetch não informa progresso de upload). */
function uploadFiles(files: { file: File; path: string }[], onProgress: (p: UploadProgress) => void): Promise<ImportBatch> {
  if (DEMO) return Promise.reject(new ApiError(400, 'Na demonstração a importação de PDFs fica desligada. O calendário de exemplo já está carregado.'));
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('manifest', JSON.stringify(files.map((f, i) => ({ field: `f${i}`, path: f.path }))));
    files.forEach((f, i) => form.append(`f${i}`, f.file, f.file.name));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/imports`);
    const token = getToken();
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress({ loaded: e.loaded, total: e.total });
    xhr.onerror = () => reject(new ApiError(0, 'O envio foi interrompido. Confira sua conexão e tente de novo.'));
    xhr.onload = () => {
      let data: { error?: string; detail?: unknown } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* resposta vazia */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as unknown as ImportBatch);
      else {
        if (xhr.status === 401) clearSession();
        reject(new ApiError(xhr.status, data.error ?? `Erro ${xhr.status}`, data.detail));
      }
    };
    xhr.send(form);
  });
}

export const api = {
  login: () => request<{ token: string; user: User }>('POST', '/api/auth/login', { provider: 'microsoft' }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => request<{ user: User }>('GET', '/api/auth/me'),
  status: () => request<SystemStatus>('GET', '/api/system/status'),

  calendars: {
    list: (q: Record<string, string> = {}) => request<{ items: CalendarSummary[] }>('GET', `/api/calendars?${new URLSearchParams(q)}`),
    get: (id: string) => request<CalendarDetail>('GET', `/api/calendars/${id}`),
    update: (
      id: string,
      patch: Partial<{ title: string; year: number | null; semester: 1 | 2 | null; scope: CalendarScope; legend: LegendEntry[]; notes: CalendarNote[] }> & { expectedVersion?: number },
    ) => request<CalendarDetail>('PATCH', `/api/calendars/${id}`, patch),
    createEvent: (id: string, input: EventInput) => request<CalendarDetail & { event: CalendarEvent }>('POST', `/api/calendars/${id}/events`, input),
    updateEvent: (id: string, eventId: string, input: EventInput, expectedVersion?: number) =>
      request<CalendarDetail & { event: CalendarEvent }>('PATCH', `/api/calendars/${id}/events/${eventId}`, { ...input, expectedVersion }),
    deleteEvent: (id: string, eventId: string) => request<CalendarDetail>('DELETE', `/api/calendars/${id}/events/${eventId}`),
    duplicateEvent: (id: string, eventId: string) => request<CalendarDetail & { event: CalendarEvent }>('POST', `/api/calendars/${id}/events/${eventId}/duplicate`),
    bulkImportance: (id: string, eventIds: string[], importance: Importance) =>
      request<CalendarDetail & { changed: number }>('POST', `/api/calendars/${id}/events/bulk-importance`, { eventIds, importance }),
    bulkReminders: (id: string, eventIds: string[], days: number[], time: string | null) =>
      request<CalendarDetail & { changed: number }>('POST', `/api/calendars/${id}/events/bulk-reminders`, { eventIds, days, time }),
    ack: (id: string, eventId: string | null, code: IssueCode, undo = false) => request<CalendarDetail>('POST', `/api/calendars/${id}/review/ack`, { eventId, code, undo }),
    submit: (id: string) => request<CalendarDetail>('POST', `/api/calendars/${id}/submit`),
    returnToDraft: (id: string) => request<CalendarDetail>('POST', `/api/calendars/${id}/return`),
    suggestImportance: (id: string, opts: { apply?: boolean; onlyUnset?: boolean; eventIds?: string[] } = {}) =>
      request<{ suggestions: ImportanceSuggestionRow[]; changed: number } & Partial<CalendarDetail>>('POST', `/api/calendars/${id}/events/suggest-importance`, opts),
    studentPreview: (id: string, source: 'draft' | 'published') => request<PublicCalendar>('GET', `/api/calendars/${id}/student-preview?source=${source}`),
    publishPreview: (id: string) =>
      request<{ publishCheck: PublishCheck; diff: ReminderDiff; status: string; studentImpact?: StudentImpact }>('GET', `/api/calendars/${id}/publish-preview`),
    publish: (id: string) =>
      request<CalendarDetail & { diff: ReminderDiff; favoriteDiff?: { create: number; update: number; cancel: number } }>('POST', `/api/calendars/${id}/publish`, { confirm: true }),
    archive: (id: string) => request<CalendarDetail & { canceledJobs: number }>('POST', `/api/calendars/${id}/archive`),
    unarchive: (id: string) => request<CalendarDetail>('POST', `/api/calendars/${id}/unarchive`),
    versions: (id: string) => request<{ items: CalendarVersionSummary[] }>('GET', `/api/calendars/${id}/versions`),
    restore: (id: string, versionId: string) => request<CalendarDetail>('POST', `/api/calendars/${id}/versions/${versionId}/restore`),
    audit: (id: string) => request<{ items: AuditEntry[] }>('GET', `/api/calendars/${id}/audit`),
    reminders: (id: string) =>
      request<{ draftPlan: PlannedReminder[]; jobs: NotificationJob[]; favoriteSummary?: { scheduled: number; students: number } }>('GET', `/api/calendars/${id}/reminders`),
  },

  /**
   * Marcações do aluno (estrela/ocultar). Em produção quem chama é o backend do
   * portal/app, com a STUDENT_API_KEY — o navegador da equipe não tem a chave.
   * Por isso as prévias só gravam de verdade na demonstração.
   */
  student: {
    persists: DEMO,
    marks: (studentId: string, calendarId: string) =>
      request<{ starred: string[]; hidden: string[]; reminders: StudentReminder[] }>('GET', `/api/public/students/${encodeURIComponent(studentId)}/calendars/${calendarId}/marks`),
    star: (studentId: string, calendarId: string, uid: string) =>
      request<StarResult>('PUT', `/api/public/students/${encodeURIComponent(studentId)}/calendars/${calendarId}/events/${uid}/star`),
    unstar: (studentId: string, calendarId: string, uid: string) =>
      request<{ mark: null; canceled: number }>('DELETE', `/api/public/students/${encodeURIComponent(studentId)}/calendars/${calendarId}/events/${uid}/star`),
    hide: (studentId: string, calendarId: string, uid: string) =>
      request<{ mark: 'hide'; canceled: number }>('PUT', `/api/public/students/${encodeURIComponent(studentId)}/calendars/${calendarId}/events/${uid}/hide`),
    unhide: (studentId: string, calendarId: string, uid: string) =>
      request<{ mark: null }>('DELETE', `/api/public/students/${encodeURIComponent(studentId)}/calendars/${calendarId}/events/${uid}/hide`),
  },

  imports: {
    upload: uploadFiles,
    get: (id: string) => request<ImportBatch>('GET', `/api/imports/${id}`),
    recent: () => request<{ items: { id: string; createdAt: string; createdBy: string; status: string; total: number; done: number }[] }>('GET', '/api/imports'),
    start: (id: string, options: { mergeIdentical: boolean; forceItemIds: string[] }) => request<ImportBatch>('POST', `/api/imports/${id}/start`, options),
    retry: (id: string) => request<ImportBatch>('POST', `/api/imports/${id}/retry`, {}),
  },

  notifications: {
    jobs: (q: Record<string, string> = {}) => request<{ items: NotificationJob[]; counts: Record<string, number> }>('GET', `/api/notifications/jobs?${new URLSearchParams(q)}`),
    job: (id: string) => request<{ job: NotificationJob; attempts: JobAttempt[] }>('GET', `/api/notifications/jobs/${id}`),
    cancel: (id: string) => request<{ job: NotificationJob }>('POST', `/api/notifications/jobs/${id}/cancel`),
    retry: (id: string) => request<{ job: NotificationJob }>('POST', `/api/notifications/jobs/${id}/retry`),
    audience: (calendarId: string, groups: string[]) =>
      request<{ audience: Audience; estimate: number | null; note: string }>('POST', '/api/notifications/audience-preview', { calendarId, groups }),
    additional: (input: AdditionalCommunicationInput) => request<{ job: NotificationJob }>('POST', '/api/notifications/additional', { ...input, confirm: true }),
  },

  lifecycle: {
    rules: () => request<{ items: LifecycleRule[] }>('GET', '/api/lifecycle/rules'),
    save: (id: string, steps: LifecycleStep[]) => request<{ rule: LifecycleRule }>('PUT', `/api/lifecycle/rules/${id}`, { steps }),
    preview: (id: string, step: Partial<LifecycleStep>) =>
      request<{ pushTitle: string; pushBody: string; emailSubject: string; emailBody: string; missing: string[] }>('POST', `/api/lifecycle/rules/${id}/preview`, step),
    events: (ruleId?: string) => request<{ items: StudentEventRecord[] }>('GET', `/api/lifecycle/events${ruleId ? `?ruleId=${ruleId}` : ''}`),
  },
};

/** Link do PDF original, aberto no visualizador do navegador na página certa. */
export function pdfUrl(fileId: string, page?: number): string {
  if (DEMO) return `${DEMO_PDF}${page ? `#page=${page}` : ''}`;
  const token = getToken() ?? '';
  return `${API_BASE}/api/files/${fileId}/content?token=${encodeURIComponent(token)}${page ? `#page=${page}` : ''}`;
}

/** PDF de exemplo da demonstração (apps/web/public/demo). */
const DEMO_PDF = `${import.meta.env.BASE_URL}demo/calendario_presencial_2026_2.pdf`;

export async function fetchPdfBytes(fileId: string): Promise<ArrayBuffer> {
  const res = DEMO
    ? await fetch(DEMO_PDF)
    : await fetch(`${API_BASE}/api/files/${fileId}/content`, { headers: { authorization: `Bearer ${getToken() ?? ''}` } });
  if (!res.ok) throw new ApiError(res.status, 'Não foi possível abrir o PDF original.');
  return res.arrayBuffer();
}
