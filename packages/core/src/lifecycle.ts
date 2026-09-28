import type { ISOInstant, LifecycleRule, LifecycleStep, LifecycleTiming, StudentEventPayload } from './types';
import { instantToWall, wallTimeToInstant } from './schedule';
import { addDays } from './dates';
import { renderTemplate } from './templates';

/* ==========================================================================
   Acontecimentos do aluno
   --------------------------------------------------------------------------
   Comunicações disparadas por mudança de status vinda dos sistemas
   institucionais (horas complementares deferidas, RA encerrado…).

   O que este módulo NÃO faz, de propósito:
     · não inventa status oficiais. Os nomes das etapas são sugestões editáveis
       e o mapeamento técnico (sistema de origem + código de status) nasce
       vazio, para a TI preencher. Etapa sem mapeamento não dispara;
     · não resolve contato do aluno. O envio sai endereçado ao `studentId`, e o
       gateway da TI resolve dispositivo/e-mail. Aqui só existe o id;
     · não deixa um modelo ler outro aluno. A mensagem é renderizada apenas
       com o payload do próprio acontecimento.
   ========================================================================== */

const STUDENT_VARS = [
  { key: 'aluno.primeiro_nome', label: 'Primeiro nome do aluno', example: 'Maria' },
  { key: 'aluno.ra', label: 'RA', example: '0000000' },
];

type Seed = Omit<LifecycleRule, 'id' | 'updatedAt' | 'updatedBy' | 'steps'> & {
  steps: { label: string; pushTitle: string; pushBody: string; emailSubject: string; emailBody: string }[];
};

export const LIFECYCLE_SEEDS: Seed[] = [
  {
    key: 'horas_complementares_deferidas',
    name: 'Horas complementares deferidas',
    description: 'Quando a solicitação de horas complementares é aprovada.',
    variables: [
      ...STUDENT_VARS,
      { key: 'solicitacao.horas', label: 'Horas deferidas', example: '20' },
      { key: 'solicitacao.protocolo', label: 'Protocolo', example: '2026-000123' },
    ],
    steps: [
      {
        label: 'Deferida',
        pushTitle: 'Horas complementares deferidas',
        pushBody: '{{aluno.primeiro_nome}}, suas {{solicitacao.horas}} horas complementares foram deferidas.',
        emailSubject: 'Suas horas complementares foram deferidas',
        emailBody:
          'Olá, {{aluno.primeiro_nome}}.\n\nA solicitação {{solicitacao.protocolo}} foi deferida: {{solicitacao.horas}} horas complementares foram registradas.\n\nVocê pode acompanhar pelo App Grupo Anchieta.',
      },
    ],
  },
  {
    key: 'horas_complementares_indeferidas',
    name: 'Horas complementares indeferidas',
    description: 'Quando a solicitação de horas complementares não é aprovada.',
    variables: [
      ...STUDENT_VARS,
      { key: 'solicitacao.protocolo', label: 'Protocolo', example: '2026-000123' },
      { key: 'solicitacao.motivo', label: 'Motivo informado', example: 'Certificado sem carga horária' },
    ],
    steps: [
      {
        label: 'Indeferida',
        pushTitle: 'Horas complementares: solicitação indeferida',
        pushBody: '{{aluno.primeiro_nome}}, sua solicitação {{solicitacao.protocolo}} foi indeferida. Veja o motivo no app.',
        emailSubject: 'Sua solicitação de horas complementares foi indeferida',
        emailBody:
          'Olá, {{aluno.primeiro_nome}}.\n\nA solicitação {{solicitacao.protocolo}} foi indeferida.\nMotivo: {{solicitacao.motivo}}\n\nSe tiver dúvidas, procure a Secretaria Virtual.',
      },
    ],
  },
  {
    key: 'pratica_extensionista_deferida',
    name: 'Prática extensionista deferida',
    description: 'Quando o relatório de prática extensionista é aprovado.',
    variables: [...STUDENT_VARS, { key: 'solicitacao.horas', label: 'Horas validadas', example: '40' }],
    steps: [
      {
        label: 'Deferida',
        pushTitle: 'Prática extensionista deferida',
        pushBody: '{{aluno.primeiro_nome}}, sua prática extensionista foi deferida ({{solicitacao.horas}} horas).',
        emailSubject: 'Sua prática extensionista foi deferida',
        emailBody: 'Olá, {{aluno.primeiro_nome}}.\n\nSua prática extensionista foi deferida, com {{solicitacao.horas}} horas validadas.',
      },
    ],
  },
  {
    key: 'pratica_extensionista_indeferida',
    name: 'Prática extensionista indeferida',
    description: 'Quando o relatório de prática extensionista não é aprovado.',
    variables: [...STUDENT_VARS, { key: 'solicitacao.motivo', label: 'Motivo informado', example: 'Relatório incompleto' }],
    steps: [
      {
        label: 'Indeferida',
        pushTitle: 'Prática extensionista: relatório indeferido',
        pushBody: '{{aluno.primeiro_nome}}, seu relatório de prática extensionista foi indeferido. Veja o motivo no app.',
        emailSubject: 'Seu relatório de prática extensionista foi indeferido',
        emailBody: 'Olá, {{aluno.primeiro_nome}}.\n\nSeu relatório de prática extensionista foi indeferido.\nMotivo: {{solicitacao.motivo}}',
      },
    ],
  },
  {
    key: 'encerramento_ra_colacao',
    name: 'Encerramento do RA e colação de grau',
    description: 'Quando o RA é encerrado — orienta a conferir as informações da colação de grau.',
    variables: [...STUDENT_VARS],
    steps: [
      {
        label: 'RA encerrado',
        pushTitle: 'Confira as informações da sua colação de grau',
        pushBody: '{{aluno.primeiro_nome}}, seu RA foi encerrado. Confira no app as informações da colação de grau.',
        emailSubject: 'Confira as informações da sua colação de grau',
        emailBody:
          'Olá, {{aluno.primeiro_nome}}.\n\nSeu RA {{aluno.ra}} foi encerrado. Confira no App Grupo Anchieta as informações sobre a colação de grau.',
      },
    ],
  },
  {
    key: 'horas_estagio',
    name: 'Solicitação de horas de estágio',
    description: 'A solicitação de horas de estágio e seus desdobramentos.',
    variables: [
      ...STUDENT_VARS,
      { key: 'solicitacao.protocolo', label: 'Protocolo', example: '2026-000456' },
      { key: 'solicitacao.horas', label: 'Horas', example: '120' },
      { key: 'solicitacao.motivo', label: 'Motivo/observação', example: 'Falta assinatura do supervisor' },
    ],
    steps: [
      {
        label: 'Solicitação recebida',
        pushTitle: 'Recebemos sua solicitação de horas de estágio',
        pushBody: '{{aluno.primeiro_nome}}, sua solicitação {{solicitacao.protocolo}} foi recebida e está em análise.',
        emailSubject: 'Recebemos sua solicitação de horas de estágio',
        emailBody: 'Olá, {{aluno.primeiro_nome}}.\n\nRecebemos a solicitação {{solicitacao.protocolo}}. Avisaremos quando houver uma atualização.',
      },
      {
        label: 'Deferida',
        pushTitle: 'Horas de estágio deferidas',
        pushBody: '{{aluno.primeiro_nome}}, suas {{solicitacao.horas}} horas de estágio foram deferidas.',
        emailSubject: 'Suas horas de estágio foram deferidas',
        emailBody: 'Olá, {{aluno.primeiro_nome}}.\n\nA solicitação {{solicitacao.protocolo}} foi deferida: {{solicitacao.horas}} horas de estágio.',
      },
      {
        label: 'Indeferida',
        pushTitle: 'Horas de estágio: solicitação indeferida',
        pushBody: '{{aluno.primeiro_nome}}, sua solicitação de horas de estágio foi indeferida. Veja o motivo no app.',
        emailSubject: 'Sua solicitação de horas de estágio foi indeferida',
        emailBody: 'Olá, {{aluno.primeiro_nome}}.\n\nA solicitação {{solicitacao.protocolo}} foi indeferida.\nMotivo: {{solicitacao.motivo}}',
      },
    ],
  },
  {
    key: 'servico_secretaria_virtual',
    name: 'Serviço entregue pela Secretaria Virtual',
    description: 'Quando um serviço solicitado na Secretaria Virtual é entregue.',
    variables: [
      ...STUDENT_VARS,
      { key: 'servico.nome', label: 'Nome do serviço', example: 'Declaração de matrícula' },
      { key: 'solicitacao.protocolo', label: 'Protocolo', example: '2026-000789' },
    ],
    steps: [
      {
        label: 'Serviço entregue',
        pushTitle: 'Seu serviço está disponível',
        pushBody: '{{aluno.primeiro_nome}}, o serviço "{{servico.nome}}" foi entregue pela Secretaria Virtual.',
        emailSubject: 'Seu serviço da Secretaria Virtual foi entregue',
        emailBody: 'Olá, {{aluno.primeiro_nome}}.\n\nO serviço "{{servico.nome}}" (protocolo {{solicitacao.protocolo}}) foi entregue. Acesse a Secretaria Virtual para consultar.',
      },
    ],
  },
  {
    key: 'compensacao_ausencia',
    name: 'Compensação de Ausência',
    description: 'A solicitação de Compensação de Ausência e seus desdobramentos.',
    variables: [
      ...STUDENT_VARS,
      { key: 'solicitacao.protocolo', label: 'Protocolo', example: '2026-000321' },
      { key: 'solicitacao.disciplina', label: 'Disciplina', example: 'Anatomia Humana' },
      { key: 'solicitacao.prazo', label: 'Prazo de entrega', example: '15/10' },
      { key: 'solicitacao.motivo', label: 'Motivo/observação', example: 'Documento ilegível' },
    ],
    steps: [
      {
        label: 'Solicitação recebida',
        pushTitle: 'Recebemos sua Compensação de Ausência',
        pushBody: '{{aluno.primeiro_nome}}, sua solicitação {{solicitacao.protocolo}} foi recebida.',
        emailSubject: 'Recebemos sua solicitação de Compensação de Ausência',
        emailBody: 'Olá, {{aluno.primeiro_nome}}.\n\nRecebemos a solicitação {{solicitacao.protocolo}} ({{solicitacao.disciplina}}).',
      },
      {
        label: 'Atividades liberadas',
        pushTitle: 'Compensação de Ausência: atividades liberadas',
        pushBody: '{{aluno.primeiro_nome}}, as atividades de {{solicitacao.disciplina}} estão liberadas. Prazo: {{solicitacao.prazo}}.',
        emailSubject: 'Atividades de Compensação de Ausência liberadas',
        emailBody: 'Olá, {{aluno.primeiro_nome}}.\n\nAs atividades de compensação de {{solicitacao.disciplina}} estão liberadas. Entregue até {{solicitacao.prazo}}.',
      },
      {
        label: 'Indeferida',
        pushTitle: 'Compensação de Ausência indeferida',
        pushBody: '{{aluno.primeiro_nome}}, sua solicitação {{solicitacao.protocolo}} foi indeferida. Veja o motivo no app.',
        emailSubject: 'Sua Compensação de Ausência foi indeferida',
        emailBody: 'Olá, {{aluno.primeiro_nome}}.\n\nA solicitação {{solicitacao.protocolo}} foi indeferida.\nMotivo: {{solicitacao.motivo}}',
      },
    ],
  },
];

export function seedStep(rulePrefix: string, index: number, s: Seed['steps'][number]): LifecycleStep {
  return {
    id: `${rulePrefix}-s${index + 1}`,
    label: s.label,
    trigger: { sourceSystem: '', statusCode: '', notes: '' },
    enabled: false,
    channels: ['push'],
    timing: { mode: 'immediate' },
    pushTitle: s.pushTitle,
    pushBody: s.pushBody,
    emailSubject: s.emailSubject,
    emailBody: s.emailBody,
  };
}

export function isStepMapped(step: LifecycleStep): boolean {
  return Boolean(step.trigger.sourceSystem.trim() && step.trigger.statusCode.trim());
}

export function findStep(rules: LifecycleRule[], sourceSystem: string, statusCode: string): { rule: LifecycleRule; step: LifecycleStep } | null {
  const norm = (s: string) => s.trim().toLowerCase();
  for (const rule of rules) {
    for (const step of rule.steps) {
      if (isStepMapped(step) && norm(step.trigger.sourceSystem) === norm(sourceSystem) && norm(step.trigger.statusCode) === norm(statusCode))
        return { rule, step };
    }
  }
  return null;
}

/** Valores do modelo — SOMENTE do payload deste acontecimento. */
export function lifecycleValues(payload: Pick<StudentEventPayload, 'student' | 'data'>): Record<string, string | number | null> {
  const values: Record<string, string | number | null> = {
    'aluno.primeiro_nome': payload.student.firstName ?? null,
    'aluno.ra': payload.student.ra ?? null,
  };
  for (const [k, v] of Object.entries(payload.data ?? {})) {
    if (/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(k)) values[k] = v;
  }
  return values;
}

export function renderStep(step: LifecycleStep, payload: Pick<StudentEventPayload, 'student' | 'data'>) {
  const values = lifecycleValues(payload);
  const pushTitle = renderTemplate(step.pushTitle, values);
  const pushBody = renderTemplate(step.pushBody, values);
  const emailSubject = renderTemplate(step.emailSubject, values);
  const emailBody = renderTemplate(step.emailBody, values);
  return {
    pushTitle: pushTitle.text,
    pushBody: pushBody.text,
    emailSubject: emailSubject.text,
    emailBody: emailBody.text,
    missing: [...new Set([...pushTitle.missing, ...pushBody.missing, ...emailSubject.missing, ...emailBody.missing])],
  };
}

export function previewValues(rule: LifecycleRule): Record<string, string> {
  return Object.fromEntries(rule.variables.map((v) => [v.key, v.example]));
}

/** Quando enviar, a partir do momento em que o acontecimento chegou. */
export function lifecycleSendAt(timing: LifecycleTiming, receivedAt: Date): ISOInstant {
  if (timing.mode === 'immediate') return receivedAt.toISOString();
  if (timing.mode === 'delay') return new Date(receivedAt.getTime() + Math.max(0, timing.minutes) * 60000).toISOString();
  // horário comercial em São Paulo: dentro da janela sai já; fora, no próximo início
  const wall = instantToWall(receivedAt);
  if (wall.time >= timing.start && wall.time < timing.end) return receivedAt.toISOString();
  const date = wall.time < timing.start ? wall.date : addDays(wall.date, 1);
  return wallTimeToInstant(date, timing.start);
}
