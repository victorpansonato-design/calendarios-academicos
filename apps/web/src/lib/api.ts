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
  PublishCheck,
  ReminderDiff,
  StudentEventRecord,
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(path, {
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
  const data = text ? (JSON.parse(text) as unknown) : undefined;
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

export interface UploadProgress {
  loaded: number;
  total: number;
}

/** Envio com progresso (XHR — o fetch não informa progresso de upload). */
function uploadFiles(files: { file: File; path: string }[], onProgress: (p: UploadProgress) => void): Promise<ImportBatch> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('manifest', JSON.stringify(files.map((f, i) => ({ field: `f${i}`, path: f.path }))));
    files.forEach((f, i) => form.append(`f${i}`, f.file, f.file.name));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/imports');
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
    ack: (id: string, eventId: string | null, code: IssueCode, undo = false) => request<CalendarDetail>('POST', `/api/calendars/${id}/review/ack`, { eventId, code, undo }),
    submit: (id: string) => request<CalendarDetail>('POST', `/api/calendars/${id}/submit`),
    returnToDraft: (id: string) => request<CalendarDetail>('POST', `/api/calendars/${id}/return`),
    publishPreview: (id: string) => request<{ publishCheck: PublishCheck; diff: ReminderDiff; status: string }>('GET', `/api/calendars/${id}/publish-preview`),
    publish: (id: string) => request<CalendarDetail & { diff: ReminderDiff }>('POST', `/api/calendars/${id}/publish`, { confirm: true }),
    archive: (id: string) => request<CalendarDetail & { canceledJobs: number }>('POST', `/api/calendars/${id}/archive`),
    unarchive: (id: string) => request<CalendarDetail>('POST', `/api/calendars/${id}/unarchive`),
    versions: (id: string) => request<{ items: CalendarVersionSummary[] }>('GET', `/api/calendars/${id}/versions`),
    restore: (id: string, versionId: string) => request<CalendarDetail>('POST', `/api/calendars/${id}/versions/${versionId}/restore`),
    audit: (id: string) => request<{ items: AuditEntry[] }>('GET', `/api/calendars/${id}/audit`),
    reminders: (id: string) => request<{ draftPlan: PlannedReminder[]; jobs: NotificationJob[] }>('GET', `/api/calendars/${id}/reminders`),
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
  const token = getToken() ?? '';
  return `/api/files/${fileId}/content?token=${encodeURIComponent(token)}${page ? `#page=${page}` : ''}`;
}

export async function fetchPdfBytes(fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(`/api/files/${fileId}/content`, { headers: { authorization: `Bearer ${getToken() ?? ''}` } });
  if (!res.ok) throw new ApiError(res.status, 'Não foi possível abrir o PDF original.');
  return res.arrayBuffer();
}
