import { useEffect, useState } from 'react';
import { Mail, Plus, Smartphone, Trash2, Wrench, X } from 'lucide-react';
import type { Channel, LifecycleRule, LifecycleStep } from '@calendarios/core';
import { isStepMapped } from '@calendarios/core';
import { Drawer, Confirm } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Callout, SectionLabel } from '../../components/ui/Surfaces';
import { Chip, Field, Segmented, Switch, TextArea, TextInput } from '../../components/ui/Fields';
import { Pill } from '../../components/ui/Badges';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';

/* Edição de uma regra de acontecimento: etapas (desdobramentos), gatilho
   técnico, canal, momento do envio e os modelos, com prévia fictícia. */

type Preview = { pushTitle: string; pushBody: string; emailSubject: string; emailBody: string; missing: string[] };

function newStep(n: number): LifecycleStep {
  return {
    id: `novo-${Date.now().toString(36)}-${n}`,
    label: 'Novo desdobramento',
    trigger: { sourceSystem: '', statusCode: '', notes: '' },
    enabled: false,
    channels: ['push'],
    timing: { mode: 'immediate' },
    pushTitle: '',
    pushBody: '',
    emailSubject: '',
    emailBody: '',
  };
}

function StepEditor({
  rule,
  step,
  onChange,
  onRemove,
  canRemove,
  index,
}: {
  rule: LifecycleRule;
  step: LifecycleStep;
  onChange: (s: LifecycleStep) => void;
  onRemove: () => void;
  canRemove: boolean;
  index: number;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const mapped = isStepMapped(step);

  useEffect(() => {
    const t = window.setTimeout(() => {
      api.lifecycle.preview(rule.id, step).then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => window.clearTimeout(t);
  }, [rule.id, step.pushTitle, step.pushBody, step.emailSubject, step.emailBody]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<LifecycleStep>) => onChange({ ...step, ...patch });
  const toggleChannel = (c: Channel) => set({ channels: step.channels.includes(c) ? step.channels.filter((x) => x !== c) : [...step.channels, c] });

  return (
    <section className="space-y-4 px-5 py-5">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label={`Etapa ${index + 1}`} help="Nome humano do desdobramento. Ajuste conforme o fluxo oficial.">
            {(id) => <TextInput id={id} value={step.label} onChange={(e) => set({ label: e.target.value })} />}
          </Field>
        </div>
        {canRemove && <Button variant="ghost" square aria-label={`Remover etapa ${step.label}`} icon={<Trash2 className="h-4 w-4" />} onClick={onRemove} />}
      </div>

      <div className="space-y-3 border-t border-hairline pt-4">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Wrench className="h-3.5 w-3.5 text-ink-3" /> Gatilho — preenchido pela TI
          {!mapped && <Pill tone="warn">Aguardando mapeamento</Pill>}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sistema de origem">
            {(id) => <TextInput id={id} value={step.trigger.sourceSystem} placeholder="Ex.: lyceum" onChange={(e) => set({ trigger: { ...step.trigger, sourceSystem: e.target.value } })} />}
          </Field>
          <Field label="Código do status">
            {(id) => <TextInput id={id} value={step.trigger.statusCode} placeholder="Código exato enviado pelo sistema" onChange={(e) => set({ trigger: { ...step.trigger, statusCode: e.target.value } })} />}
          </Field>
        </div>
        <Field label="Observações técnicas">
          {(id) => <TextArea id={id} rows={2} value={step.trigger.notes} onChange={(e) => set({ trigger: { ...step.trigger, notes: e.target.value } })} />}
        </Field>
      </div>

      <Switch
        checked={step.enabled}
        onChange={(v) => set({ enabled: v })}
        disabled={!mapped}
        label="Etapa ligada"
        description={mapped ? 'Quando o status chegar, a mensagem é enviada ao aluno.' : 'Só pode ser ligada depois que a TI preencher o sistema de origem e o código do status.'}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-ink">Canal</p>
          <div className="flex gap-2">
            <Chip active={step.channels.includes('push')} onClick={() => toggleChannel('push')}>
              Push
            </Chip>
            <Chip active={step.channels.includes('email')} onClick={() => toggleChannel('email')}>
              E-mail
            </Chip>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-ink">Público</p>
          <p className="text-[12px] leading-relaxed text-ink-3">Somente o aluno do acontecimento. Não é configurável, de propósito.</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[12px] font-medium text-ink">Quando enviar</p>
        <Segmented
          layoutId={`timing-${step.id}`}
          value={step.timing.mode}
          onChange={(mode) =>
            set({ timing: mode === 'delay' ? { mode, minutes: 30 } : mode === 'business_hours' ? { mode, start: '08:00', end: '18:00' } : { mode: 'immediate' } })
          }
          options={[
            { value: 'immediate', label: 'Na hora' },
            { value: 'delay', label: 'Depois de um tempo' },
            { value: 'business_hours', label: 'Horário comercial' },
          ]}
        />
        {step.timing.mode === 'delay' && (
          <div className="flex items-center gap-2 text-[13px] text-ink-2">
            <TextInput
              type="number"
              min={1}
              max={10080}
              aria-label="Minutos de espera"
              value={step.timing.minutes}
              onChange={(e) => set({ timing: { mode: 'delay', minutes: Number(e.target.value) } })}
              className="w-24"
            />
            minutos depois de o status chegar
          </div>
        )}
        {step.timing.mode === 'business_hours' && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            entre
            <TextInput type="time" aria-label="Início do horário comercial" value={step.timing.start} onChange={(e) => set({ timing: { ...(step.timing as { mode: 'business_hours'; start: string; end: string }), start: e.target.value } })} className="w-32" />
            e
            <TextInput type="time" aria-label="Fim do horário comercial" value={step.timing.end} onChange={(e) => set({ timing: { ...(step.timing as { mode: 'business_hours'; start: string; end: string }), end: e.target.value } })} className="w-32" />
            (Brasília)
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          {step.channels.includes('push') && (
            <>
              <Field label="Título do push">{(id) => <TextInput id={id} maxLength={120} value={step.pushTitle} onChange={(e) => set({ pushTitle: e.target.value })} />}</Field>
              <Field label="Texto do push">{(id) => <TextArea id={id} rows={3} maxLength={500} value={step.pushBody} onChange={(e) => set({ pushBody: e.target.value })} />}</Field>
            </>
          )}
          {step.channels.includes('email') && (
            <>
              <Field label="Assunto do e-mail">{(id) => <TextInput id={id} maxLength={200} value={step.emailSubject} onChange={(e) => set({ emailSubject: e.target.value })} />}</Field>
              <Field label="Texto do e-mail">{(id) => <TextArea id={id} rows={6} maxLength={5000} value={step.emailBody} onChange={(e) => set({ emailBody: e.target.value })} />}</Field>
            </>
          )}
          <div className="flex flex-wrap gap-1.5">
            {rule.variables.map((v) => (
              <span key={v.key} title={v.label} className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">
                {`{{${v.key}}}`}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-ink-3">Prévia com dados fictícios</p>
          <div className="space-y-2">
            {step.channels.includes('push') && (
              <div className="rounded-xl bg-surface-2 p-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-4">
                  <Smartphone className="h-3 w-3" /> Push
                </p>
                <p className="mt-1 text-[13px] font-semibold text-ink">{preview?.pushTitle || '—'}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-2">{preview?.pushBody || '—'}</p>
              </div>
            )}
            {step.channels.includes('email') && (
              <div className="rounded-xl bg-surface-2 p-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-4">
                  <Mail className="h-3 w-3" /> E-mail
                </p>
                <p className="mt-1 text-[13px] font-semibold text-ink">{preview?.emailSubject || '—'}</p>
                <p className="mt-0.5 text-[12.5px] whitespace-pre-line text-ink-2">{preview?.emailBody || '—'}</p>
              </div>
            )}
            {preview?.missing.length ? <p className="text-[11.5px] text-warn-ink">Variável sem exemplo: {preview.missing.join(', ')}. Confira a grafia.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function RuleDrawer({ rule, onClose, onSaved }: { rule: LifecycleRule | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [steps, setSteps] = useState<LifecycleStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSteps(rule ? structuredClone(rule.steps) : []);
    setError(null);
  }, [rule]);

  const dirty = rule ? JSON.stringify(steps) !== JSON.stringify(rule.steps) : false;
  const close = () => (dirty ? setDiscard(true) : onClose());

  const save = async () => {
    if (!rule) return;
    setSaving(true);
    setError(null);
    try {
      await api.lifecycle.save(rule.id, steps);
      toast.ok('Regra salva.');
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Drawer open={Boolean(rule)} onClose={close} label={rule ? `Regra ${rule.name}` : 'Regra'} width="xl">
        {rule && (
          <>
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-5 py-4">
              <div className="min-w-0">
                <p className="mb-1 text-[12px] font-medium text-ink-3">Acontecimento do aluno</p>
                <h2 className="text-[15px] leading-tight font-semibold text-ink">{rule.name}</h2>
                <p className="mt-1 text-[12px] text-ink-3">{rule.description}</p>
              </div>
              <button type="button" onClick={close} aria-label="Fechar" className="-mt-0.5 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="scroll-slim min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
              {error && (
                <div className="px-5 pt-4">
                  <Callout tone="crit" title="Não foi possível salvar">
                    {error}
                  </Callout>
                </div>
              )}
              {steps.map((s, i) => (
                <StepEditor
                  key={s.id}
                  rule={rule}
                  step={s}
                  index={i}
                  canRemove={steps.length > 1}
                  onChange={(next) => setSteps(steps.map((x) => (x.id === s.id ? next : x)))}
                  onRemove={() => setSteps(steps.filter((x) => x.id !== s.id))}
                />
              ))}
              <div className="px-5 py-4">
                <SectionLabel>Desdobramentos</SectionLabel>
                <p className="mt-2 text-[12px] text-ink-3">Solicitações com vários resultados (recebida, deferida, indeferida…) têm uma etapa para cada status.</p>
                <Button size="sm" className="mt-3" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setSteps([...steps, newStep(steps.length)])} disabled={steps.length >= 12}>
                  Adicionar desdobramento
                </Button>
              </div>
            </div>
            <footer className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface-2/60 px-5 py-3.5">
              <Pill dot={false}>
                Última alteração: {rule.updatedBy}
              </Pill>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" onClick={close}>
                  Cancelar
                </Button>
                <Button variant="primary" onClick={save} disabled={!dirty || saving}>
                  {saving ? 'Salvando…' : 'Salvar regra'}
                </Button>
              </div>
            </footer>
          </>
        )}
      </Drawer>
      <Confirm
        open={discard}
        onClose={() => setDiscard(false)}
        onConfirm={() => {
          setDiscard(false);
          onClose();
        }}
        title="Descartar as alterações?"
        message="As mudanças nesta regra ainda não foram salvas."
        confirmLabel="Descartar"
        tone="danger"
      />
    </>
  );
}
