import type { CalendarScope, EventInput, EventTime, Importance, LegendEntry, ReminderOffset } from '@calendarios/core';
import { compareISO, isValidDay } from '@calendarios/core';
import { badRequest } from './errors';

/* ==========================================================================
   Validação de entrada
   --------------------------------------------------------------------------
   Tudo o que chega pela API é conferido aqui antes de tocar o banco. Os
   erros são frases para a pessoa ler, não códigos.
   ========================================================================== */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WALL = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX = /^#[0-9a-f]{6}$/i;

function str(v: unknown, field: string, max: number, required = false): string {
  if (v === null || v === undefined) {
    if (required) throw badRequest(`Informe ${field}.`);
    return '';
  }
  if (typeof v !== 'string') throw badRequest(`${field} inválido.`);
  const s = v.trim();
  if (required && !s) throw badRequest(`Informe ${field}.`);
  if (s.length > max) throw badRequest(`${field} passou do limite de ${max} caracteres.`);
  return s;
}

function strList(v: unknown, field: string, maxItems: number, maxLen: number): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > maxItems) throw badRequest(`${field} inválido.`);
  return v.map((x) => str(x, field, maxLen)).filter(Boolean);
}

export function isoDate(v: unknown, field: string): string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) throw badRequest(`${field}: data inválida.`);
  const [y, m, d] = v.split('-').map(Number);
  if (!isValidDay(y, m, d)) throw badRequest(`${field}: o dia ${d}/${m}/${y} não existe.`);
  return v;
}

export function wallTime(v: unknown, field: string): string {
  if (typeof v !== 'string' || !WALL.test(v)) throw badRequest(`${field}: horário inválido (use HH:mm).`);
  return v;
}

function dates(v: unknown): EventInput['dates'] {
  const d = v as EventInput['dates'];
  if (!d || typeof d !== 'object') throw badRequest('Informe as datas do evento.');
  const label = str(d.label, 'o rótulo da data', 120);
  if (d.kind === 'single') {
    const start = isoDate(d.start, 'Data');
    return { kind: 'single', start, end: start, dates: [], label };
  }
  if (d.kind === 'range') {
    const start = isoDate(d.start, 'Início');
    const end = isoDate(d.end, 'Fim');
    if (compareISO(start, end) >= 0) throw badRequest('O fim do período precisa ser depois do início.');
    return { kind: 'range', start, end, dates: [], label };
  }
  if (d.kind === 'list') {
    if (!Array.isArray(d.dates) || d.dates.length < 2 || d.dates.length > 60) throw badRequest('Uma lista precisa de pelo menos duas datas.');
    const list = [...new Set(d.dates.map((x, i) => isoDate(x, `Data ${i + 1}`)))].sort(compareISO);
    if (list.length < 2) throw badRequest('Uma lista precisa de pelo menos duas datas diferentes.');
    return { kind: 'list', start: list[0], end: list[list.length - 1], dates: list, label };
  }
  throw badRequest('Tipo de data inválido.');
}

function times(v: unknown): EventTime[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 10) throw badRequest('Horários inválidos.');
  const shifts = ['Diurno', 'Noturno', 'Matutino', 'Vespertino', 'Integral'];
  return v.map((t: Partial<EventTime>, i) => {
    if (t.shift !== null && t.shift !== undefined && !shifts.includes(t.shift)) throw badRequest(`Turno inválido no horário ${i + 1}.`);
    return { shift: (t.shift ?? null) as EventTime['shift'], time: wallTime(t.time, `Horário ${i + 1}`), raw: str(t.raw, 'o texto do horário', 200) };
  });
}

function urls(v: unknown): string[] {
  const list = strList(v, 'Links', 20, 500);
  for (const u of list) {
    let ok = false;
    try {
      ok = ['http:', 'https:'].includes(new URL(u).protocol);
    } catch {
      ok = false;
    }
    if (!ok) throw badRequest(`O link "${u}" não é um endereço http(s) válido.`);
  }
  return list;
}

export function importance(v: unknown): Importance {
  if (v === 'unset' || v === 'low' || v === 'medium' || v === 'high') return v;
  throw badRequest('Importância inválida.');
}

function offsets(v: unknown): ReminderOffset[] {
  if (!Array.isArray(v) || v.length > 6) throw badRequest('Antecedências inválidas (no máximo 6).');
  const ids = new Set<string>();
  return v.map((o: Partial<ReminderOffset>, i) => {
    const days = Number(o.daysBefore);
    if (!Number.isInteger(days) || days < 0 || days > 60) throw badRequest(`Antecedência ${i + 1}: use de 0 a 60 dias.`);
    const id = str(o.id, 'o identificador do lembrete', 40) || `c${i + 1}`;
    if (ids.has(id)) throw badRequest('Há dois lembretes com o mesmo identificador.');
    ids.add(id);
    // horário vazio é aceito (fica salvo como pendência e trava a publicação)
    const time = o.time === '' || o.time === undefined || o.time === null ? '' : wallTime(o.time, `Horário do aviso ${i + 1}`);
    return { id, daysBefore: days, time };
  });
}

export function eventInput(body: unknown): EventInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const n = (b.notification ?? {}) as Record<string, unknown>;
  const anchor = n.anchor;
  if (!['start', 'end', 'each', 'first'].includes(anchor as string)) throw badRequest('Âncora de aviso inválida.');
  const types = ['holiday', 'exam', 'deadline', 'enrollment', 'term_start', 'term_end', 'online_event', 'academic', 'other'];
  if (!types.includes(b.type as string)) throw badRequest('Tipo de evento inválido.');
  const color = b.color === null || b.color === undefined || b.color === '' ? null : str(b.color, 'a cor', 7);
  if (color && !HEX.test(color)) throw badRequest('Cor inválida (use #rrggbb).');
  const audience = (b.audience ?? {}) as Record<string, unknown>;

  return {
    title: str(b.title, 'o título', 300, true),
    description: str(b.description, 'a descrição', 5000),
    dates: dates(b.dates),
    times: times(b.times),
    location: str(b.location, 'o local', 300) || null,
    urls: urls(b.urls),
    notes: strList(b.notes, 'Observações', 20, 2000),
    audience: { groups: strList(audience.groups, 'Público', 10, 100), evidence: str(audience.evidence, 'a evidência do público', 500) || null },
    type: b.type as EventInput['type'],
    category: str(b.category, 'a categoria', 120) || null,
    color,
    importance: importance(b.importance),
    notification: {
      enabled: Boolean(n.enabled),
      offsets: offsets(n.offsets ?? []),
      anchor: anchor as EventInput['notification']['anchor'],
      anchorConfirmed: Boolean(n.anchorConfirmed),
      pushTitle: str(n.pushTitle, 'o título do push', 120),
      pushBody: str(n.pushBody, 'o texto do push', 500),
      customized: Boolean(n.customized),
    },
  };
}

export function scopeInput(v: unknown): CalendarScope {
  const s = (v ?? {}) as Record<string, unknown>;
  const cohorts = strList(s.cohorts, 'Público', 2, 20);
  if (cohorts.some((c) => c !== 'ingressantes' && c !== 'veteranos')) throw badRequest('Público inválido.');
  return {
    modality: str(s.modality, 'a modalidade', 80),
    courses: strList(s.courses, 'Cursos', 100, 160),
    exceptions: strList(s.exceptions, 'Exceções', 50, 160),
    cohorts: cohorts as CalendarScope['cohorts'],
    audienceLabel: str(s.audienceLabel, 'o público', 300),
  };
}

export function legendInput(v: unknown): LegendEntry[] {
  if (!Array.isArray(v) || v.length > 60) throw badRequest('Legenda inválida.');
  const keys = new Set<string>();
  return v.map((l: Partial<LegendEntry>, i) => {
    const key = str(l.key, 'a chave da legenda', 80, true);
    if (keys.has(key)) throw badRequest('Há duas entradas de legenda com a mesma chave.');
    keys.add(key);
    const color = str(l.color, 'a cor da legenda', 7, true);
    if (!HEX.test(color)) throw badRequest(`Legenda ${i + 1}: cor inválida.`);
    return {
      key,
      label: str(l.label, 'o nome da legenda', 200, true),
      color,
      style: l.style === 'corner' || l.style === 'dot' ? l.style : 'fill',
      group: str(l.group, 'o grupo', 60) || 'Legenda',
      fromPdf: Boolean(l.fromPdf),
    };
  });
}

export { str as stringField };
