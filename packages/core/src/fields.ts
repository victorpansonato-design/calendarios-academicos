import type { EventTime, EventType, ReminderAnchor, Shift, DateKind } from './types';
import { collapseWhitespace } from './text';

/* ==========================================================================
   Campos de um evento, a partir da redação do PDF
   --------------------------------------------------------------------------
   Cada linha da tabela mensal é um bloco de texto livre. Aqui ele é separado
   em campos que o app e o portal conseguem usar (horário por turno, local,
   link, ressalvas, público) — SEM reescrever nada:

     · `rawText` guarda as linhas exatamente como saíram do PDF;
     · `description` é a mesma redação, só com as quebras de linha do layout
       desfeitas (a frase que o PowerPoint quebrou volta a ser uma frase);
     · os campos estruturados são cópias de trechos, nunca paráfrases.

   Quando um padrão não é reconhecido, o campo fica vazio — o texto continua
   inteiro na descrição, e ninguém perde informação.
   ========================================================================== */

export interface FieldLine {
  text: string;
  /** A linha estava em negrito/destaque no PDF. */
  emphasis?: boolean;
}

export interface ExtractedFields {
  title: string;
  description: string;
  rawText: string;
  times: EventTime[];
  location: string | null;
  urls: string[];
  notes: string[];
  audience: { groups: string[]; evidence: string | null };
  type: EventType;
}

// Caixa importa: "Horário:" abre um campo; "horário da sua prova…" continua a frase.
const FIELD_PREFIX = /^(?:Local\s*:|Hor[áa]rio|\*)/;

/** Junta as linhas do layout em parágrafos, preservando cada palavra. */
export function toParagraphs(lines: FieldLine[]): string[] {
  const paragraphs: string[] = [];
  for (const line of lines) {
    const text = collapseWhitespace(line.text);
    if (!text) continue;
    const prev = paragraphs[paragraphs.length - 1];
    const startsNew =
      prev === undefined ||
      FIELD_PREFIX.test(text) ||
      (/[.:!?]$/.test(prev) && /^[A-ZÀ-Ý0-9("“]/.test(text));
    if (startsNew) paragraphs.push(text);
    else paragraphs[paragraphs.length - 1] = joinWrapped(prev, text);
  }
  return paragraphs;
}

/** "on-" + "line" continua colado; o resto ganha espaço. */
function joinWrapped(a: string, b: string): string {
  if (/[-–]$/.test(a) && /^[a-zà-ý]/.test(b) && !/\s[-–]$/.test(a)) return `${a}${b}`;
  return `${a} ${b}`;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function findUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

function hhmm(h: string, m: string | undefined): string {
  return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
}

const SHIFT_RE =
  /hor[áa]rio de in[íi]cio\s*[-–]\s*(diurno|noturno|matutino|vespertino|integral)\s*:\s*(\d{1,2})\s*h\s*(\d{2})?/gi;
const GENERIC_TIME_RE = /hor[áa]rio\s*:\s*(\d{1,2})\s*h\s*(\d{2})?(?:\s*min)?/gi;
const AT_TIME_RE = /(?<![a-zà-ý])[àa]s\s+(\d{1,2})\s*h\s*(\d{2})?/gi;

export function findTimes(paragraphs: string[]): EventTime[] {
  const out: EventTime[] = [];
  const push = (t: EventTime) => {
    if (!out.some((o) => o.shift === t.shift && o.time === t.time)) out.push(t);
  };
  for (const p of paragraphs) {
    for (const m of p.matchAll(SHIFT_RE)) {
      const shift = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as Shift;
      push({ shift, time: hhmm(m[2], m[3]), raw: m[0].trim() });
    }
    for (const m of p.matchAll(GENERIC_TIME_RE)) push({ shift: null, time: hhmm(m[1], m[2]), raw: m[0].trim() });
    for (const m of p.matchAll(AT_TIME_RE)) push({ shift: null, time: hhmm(m[1], m[2]), raw: m[0].trim() });
  }
  return out.filter((t) => Number(t.time.slice(0, 2)) < 24 && Number(t.time.slice(3)) < 60);
}

export function findLocation(paragraphs: string[]): string | null {
  for (const p of paragraphs) {
    const m = p.match(/^local\s*:\s*(.+)$/i);
    if (!m) continue;
    let value = m[1];
    value = value.split(/\s*https?:\/\//i)[0];
    value = value.split(/,\s*[àa]s\s+\d/i)[0];
    value = value.split(/\.\s+[A-ZÀ-Ý]/)[0];
    value = value.replace(/[\s:.,;]+$/, '').trim();
    return value || null;
  }
  return null;
}

export function findNotes(paragraphs: string[]): string[] {
  return paragraphs.filter((p) => p.startsWith('*')).map((p) => p.replace(/^\*+\s*/, '').trim());
}

/** Recortes de público que o texto declara explicitamente. */
export function findAudience(text: string): { groups: string[]; evidence: string | null } {
  const groups: string[] = [];
  const evidence: string[] = [];
  const hit = (re: RegExp, group: string) => {
    const m = text.match(re);
    if (m && !groups.includes(group)) {
      groups.push(group);
      evidence.push(m[0]);
    }
  };

  const mentionsNew = /\b(calouros|ingressantes)\b/i.test(text);
  const mentionsOld = /\bveteranos\b/i.test(text);
  if (mentionsNew && !mentionsOld) hit(/[^.]*\b(calouros|ingressantes)\b[^.,;:]*/i, 'Ingressantes');
  if (mentionsOld && !mentionsNew) hit(/[^.]*\bveteranos\b[^.,;:]*/i, 'Veteranos');
  hit(/(?:apenas|somente)\s+(?:aos?|para os?)\s+alunos\s+monitores|alunos monitores/i, 'Monitores');
  hit(/\(\s*depend[êe]ncia e adapta[çc][ãa]o\s*\)/i, 'Dependência e Adaptação');

  return { groups, evidence: evidence.length ? evidence.map((e) => e.trim()).join(' · ') : null };
}

export function inferType(text: string): EventType {
  const t = text.toLowerCase();
  if (/^(feriado|recesso)|\bferiado\b/.test(t)) return 'holiday';
  if (/^evento on-?line/.test(t)) return 'online_event';
  if (/[úu]ltimo dia|data m[áa]xima|prazo final/.test(t)) return 'deadline';
  if (/^(fim|t[ée]rmino|encerramento)\b/.test(t)) return 'term_end';
  if (/\bprova\b|\bp[12]\b|substitutiva|recupera[çc][ãa]o|integrativa|avalia[çc]/.test(t)) return 'exam';
  if (/per[íi]odo (?:de|para) inscri|\binscri[çc][ãa]o\b/.test(t)) return 'enrollment';
  if (/^in[íi]cio\b/.test(t)) return 'term_start';
  return 'academic';
}

/**
 * Âncora sugerida para a antecedência dos avisos. É só uma sugestão:
 * para períodos, uma pessoa precisa confirmar antes da publicação.
 */
export function suggestAnchor(kind: DateKind, type: EventType, text: string): ReminderAnchor {
  if (kind === 'list') return 'each';
  if (kind === 'single') return 'start';
  if (type === 'deadline') return 'end';
  if (/[úu]ltimo dia|prazo|data m[áa]xima|\baté\b|per[íi]odo (?:de|para) (?:inscri|entrega|elei)/i.test(text)) return 'end';
  return 'start';
}

/** Título = primeira frase, sem reescrever. Instrução em minúscula após " - " sai do título. */
export function deriveTitle(firstParagraph: string): string {
  let sentence = firstParagraph;
  const end = sentence.search(/[.!?](\s|$)/);
  if (end !== -1) sentence = sentence.slice(0, sentence[end] === '.' ? end : end + 1);
  const dash = sentence.match(/^(.{8,90}?)\s[-–]\s([a-zà-ý].*)$/);
  if (dash && sentence.length > 90) sentence = dash[1];
  return sentence.trim();
}

export function extractFields(lines: FieldLine[]): ExtractedFields {
  const rawText = lines.map((l) => collapseWhitespace(l.text)).filter(Boolean).join('\n');
  const paragraphs = toParagraphs(lines);
  const description = paragraphs.join('\n');
  const flat = paragraphs.join(' ');
  const urls = findUrls(flat);
  return {
    title: paragraphs.length ? deriveTitle(paragraphs[0]) : '',
    description,
    rawText,
    times: findTimes(paragraphs),
    location: findLocation(paragraphs),
    urls,
    notes: findNotes(paragraphs),
    audience: findAudience(flat),
    type: inferType(flat),
  };
}
