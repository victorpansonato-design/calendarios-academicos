import type { EventDates, ISODate, ISOInstant } from '@calendarios/core';
import { formatDates, fromISO, instantToWall, MONTH_NAMES } from '@calendarios/core';

/* Formatação para a tela, sempre em português e no fuso de São Paulo. */

const WEEKDAY_SHORT = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];

export function monthName(month: number): string {
  const n = MONTH_NAMES[month - 1];
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function dayMonth(date: ISODate): string {
  const { day, month } = fromISO(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

export function longDate(date: ISODate): string {
  const { day, month, year } = fromISO(date);
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAY_SHORT[wd]} ${day} de ${MONTH_NAMES[month - 1]} de ${year}`;
}

export function datesText(dates: EventDates, resolved = true): string {
  if (!resolved || !dates.start) return dates.label ? `${dates.label} (pendente)` : 'Data pendente';
  return formatDates(dates);
}

/** "25/09 às 09h00" em São Paulo. */
export function when(instant: ISOInstant): string {
  const w = instantToWall(instant);
  return `${dayMonth(w.date)} às ${w.time.replace(':', 'h')}`;
}

export function whenLong(instant: ISOInstant): string {
  const w = instantToWall(instant);
  return `${longDate(w.date)}, ${w.time.replace(':', 'h')}`;
}

export function relative(instant: ISOInstant, now = new Date()): string {
  const diff = (now.getTime() - new Date(instant).getTime()) / 1000;
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) {
    const d = Math.floor(diff / 86400);
    return d === 1 ? 'ontem' : `há ${d} dias`;
  }
  return dayMonth(instantToWall(instant).date) + '/' + instantToWall(instant).date.slice(0, 4);
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Texto legível sobre uma cor de legenda (o PDF usa de amarelo-claro a azul-marinho). */
export function readableInk(hex: string | null | undefined): string {
  if (!hex) return 'var(--ink)';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.36 ? '#101317' : '#ffffff';
}

/** "…/Administração/Administração Veteranos.pdf" — pasta do arquivo e nome, que é o que distingue. */
export function shortPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length <= 2 ? parts.join(' / ') : `${parts[parts.length - 2]} / ${parts[parts.length - 1]}`;
}
