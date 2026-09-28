import { describe, expect, it } from 'vitest';
import { findStep, LIFECYCLE_SEEDS, lifecycleSendAt, renderStep, seedStep } from '../src/lifecycle';
import { renderTemplate } from '../src/templates';
import { instantToWall } from '../src/schedule';
import type { LifecycleRule } from '../src/types';

function rules(): LifecycleRule[] {
  return LIFECYCLE_SEEDS.map((s, i) => ({
    ...s,
    id: `r${i}`,
    updatedAt: '',
    updatedBy: '',
    steps: s.steps.map((st, j) => seedStep(`r${i}`, j, st)),
  }));
}

describe('acontecimentos do aluno', () => {
  it('as oito regras nascem sem mapeamento e desligadas', () => {
    const r = rules();
    expect(r).toHaveLength(8);
    for (const rule of r) for (const step of rule.steps) {
      expect(step.enabled).toBe(false);
      expect(step.trigger.statusCode).toBe('');
    }
  });

  it('sem mapeamento, nenhum status dispara nada', () => {
    expect(findStep(rules(), 'lyceum', 'DEFERIDO')).toBeNull();
  });

  it('com mapeamento da TI, o status encontra a etapa', () => {
    const r = rules();
    r[0].steps[0].trigger = { sourceSystem: 'Lyceum', statusCode: 'HC_DEF', notes: '' };
    expect(findStep(r, 'lyceum', 'hc_def')?.step.id).toBe('r0-s1');
  });

  it('a mensagem usa só o payload do próprio aluno; variável ausente fica vazia e é informada', () => {
    const step = rules()[0].steps[0];
    const out = renderStep(step, { student: { id: 's1', firstName: 'Ana' }, data: {} });
    expect(out.pushBody).toContain('Ana');
    expect(out.pushBody).not.toContain('{{');
    expect(out.missing).toContain('solicitacao.horas');
  });

  it('modelo não aceita chave estranha no payload', () => {
    const { text } = renderTemplate('{{x}}', { x: 'ok' });
    expect(text).toBe('ok');
    const step = { ...rules()[0].steps[0], pushBody: '{{outro.aluno}}' };
    const out = renderStep(step, { student: { id: 's1' }, data: { 'outro.aluno': 'João', '../x': 'y' } as never });
    // chave com formato válido é do próprio payload; formato inválido é descartado
    expect(out.pushBody).toBe('João');
  });

  it('horário comercial: fora da janela, sai no próximo início', () => {
    const at = lifecycleSendAt({ mode: 'business_hours', start: '08:00', end: '18:00' }, new Date('2026-09-28T23:30:00Z')); // 20h30 SP
    expect(instantToWall(at)).toEqual({ date: '2026-09-29', time: '08:00' });
  });
});
