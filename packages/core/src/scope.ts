import type { CalendarScope } from './types';

/** "Cursos Presenciais (exceto Direito) · Somente veteranos" — o mesmo texto na tela e no envio. */
export function scopeLabel(scope: CalendarScope): string {
  const parts = [scope.audienceLabel || scope.modality || 'Público do calendário'];
  if (scope.courses.length && !scope.audienceLabel.includes(scope.courses[0])) parts.push(`Cursos: ${scope.courses.join(', ')}`);
  if (scope.cohorts.length === 1) parts.push(scope.cohorts[0] === 'ingressantes' ? 'Somente ingressantes' : 'Somente veteranos');
  if (scope.exceptions.length && !/exceto/i.test(scope.audienceLabel)) parts.push(`Exceto: ${scope.exceptions.join(', ')}`);
  return parts.join(' · ');
}
