import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type { CalendarNote, CalendarScope, Cohort, LegendEntry } from '@calendarios/core';
import { ACKNOWLEDGEABLE, openCalendarIssues, slug } from '@calendarios/core';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, SectionLabel } from '../../components/ui/Surfaces';
import { Chip, Field, Select, TextArea, TextInput } from '../../components/ui/Fields';
import { Swatch } from '../../components/calendar/Legend';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import type { DetailContext } from './CalendarDetailView';
import { HistoryTab } from './HistoryTab';
import { Callout } from '../../components/ui/Surfaces';

/* ==========================================================================
   Dados gerais
   --------------------------------------------------------------------------
   Quem o calendário atende (modalidade, cursos, exceções, ingressantes ou
   veteranos), a legenda de cores e as observações gerais do PDF. É aqui que
   se confirmam os cursos sugeridos pelos nomes das pastas.
   ========================================================================== */

function TagInput({ label, values, onChange, placeholder, help }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; help?: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
  };
  return (
    <Field label={label} help={help}>
      {(id) => (
        <div className="space-y-2">
          {values.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {values.map((v) => (
                <span key={v} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-2 pr-1 pl-3 text-[12px] font-medium text-ink-2">
                  {v}
                  <button
                    type="button"
                    aria-label={`Remover ${v}`}
                    onClick={() => onChange(values.filter((x) => x !== v))}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-3 hover:text-ink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <TextInput id={id} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={placeholder} />
            <Button onClick={add} disabled={!text.trim()}>
              Adicionar
            </Button>
          </div>
        </div>
      )}
    </Field>
  );
}

export function GeneralTab({ ctx }: { ctx: DetailContext }) {
  const toast = useToast();
  const { calendar } = ctx.detail;
  const init = () => ({
    title: calendar.title,
    year: calendar.year ?? new Date().getFullYear(),
    semester: (calendar.semester ?? 2) as 1 | 2,
    scope: structuredClone(calendar.scope) as CalendarScope,
    legend: structuredClone(calendar.legend) as LegendEntry[],
    notes: structuredClone(calendar.notes) as CalendarNote[],
  });
  const [form, setForm] = useState(init);
  const [saving, setSaving] = useState(false);
  const [editLegend, setEditLegend] = useState(false);
  useEffect(() => setForm(init()), [calendar.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(form) !== JSON.stringify(init());
  const editable = calendar.status !== 'archived';
  const setScope = (patch: Partial<CalendarScope>) => setForm((f) => ({ ...f, scope: { ...f.scope, ...patch } }));
  const toggleCohort = (c: Cohort) => setScope({ cohorts: form.scope.cohorts.includes(c) ? form.scope.cohorts.filter((x) => x !== c) : [...form.scope.cohorts, c] });

  const save = async () => {
    setSaving(true);
    try {
      ctx.apply(await api.calendars.update(calendar.id, { ...form, expectedVersion: calendar.version }), 'Informações salvas.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const notices = openCalendarIssues(calendar).filter((i) => ['courses_from_path', 'possible_duplicate_calendar', 'scope_unrecognized', 'page_without_text', 'unassociated_text'].includes(i.code));
  const ack = async (code: (typeof notices)[number]['code']) => {
    try {
      ctx.apply(await api.calendars.ack(calendar.id, null, code), 'Anotado.');
    } catch (e) {
      toast.error(e);
    }
  };

  const setLegend = (i: number, patch: Partial<LegendEntry>) => setForm((f) => ({ ...f, legend: f.legend.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {notices.length > 0 && (
        <div className="space-y-2 xl:col-span-2">
          {notices.map((i) => (
            <Callout key={i.code + i.message} tone={i.severity === 'blocker' ? 'warn' : 'info'} title="Vale conferir">
              <p>{i.message}</p>
              {editable && ACKNOWLEDGEABLE.has(i.code) && i.severity !== 'blocker' && (
                <div className="mt-2">
                  <Button size="xs" onClick={() => ack(i.code)}>
                    Está certo
                  </Button>
                </div>
              )}
            </Callout>
          ))}
        </div>
      )}
      <Card className="space-y-5">
        <CardHeader title="Sobre este calendário" subtitle="Para quem é e de quando é. Define quem recebe os avisos." />
        <fieldset disabled={!editable} className="space-y-4">
          <Field label="Nome do calendário" required>
            {(id) => <TextInput id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ano" required>
              {(id) => <TextInput id={id} type="number" min={2000} max={2100} value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />}
            </Field>
            <Field label="Semestre" required>
              {(id) => (
                <Select id={id} value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value) as 1 | 2 })}>
                  <option value={1}>1º semestre</option>
                  <option value={2}>2º semestre</option>
                </Select>
              )}
            </Field>
          </div>
          <Field label="Modalidade" required help="Ex.: Presencial, EAD, Híbrido.">
            {(id) => (
              <>
                <TextInput id={id} list="modalidades" value={form.scope.modality} onChange={(e) => setScope({ modality: e.target.value })} />
                <datalist id="modalidades">
                  <option value="Presencial" />
                  <option value="EAD" />
                  <option value="Híbrido" />
                </datalist>
              </>
            )}
          </Field>
          <Field label="Público como escrito no PDF" help="Aparece para os alunos. Ex.: Cursos Presenciais (exceto Direito).">
            {(id) => <TextInput id={id} value={form.scope.audienceLabel} onChange={(e) => setScope({ audienceLabel: e.target.value })} />}
          </Field>
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-ink">Ingressantes ou veteranos</p>
            <div className="flex gap-2">
              <Chip active={form.scope.cohorts.includes('ingressantes')} onClick={() => toggleCohort('ingressantes')}>
                Ingressantes
              </Chip>
              <Chip active={form.scope.cohorts.includes('veteranos')} onClick={() => toggleCohort('veteranos')}>
                Veteranos
              </Chip>
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-4">Nenhum ou os dois marcados = os dois.</p>
          </div>
          <TagInput label="Cursos abrangidos" values={form.scope.courses} onChange={(v) => setScope({ courses: v })} placeholder="Nome do curso e Enter" help="Vazio = todos os cursos da modalidade." />
          <TagInput label="Exceções" values={form.scope.exceptions} onChange={(v) => setScope({ exceptions: v })} placeholder="Curso excluído e Enter" help="Cursos que NÃO seguem este calendário." />
        </fieldset>
      </Card>

      <div className="space-y-4">
        <Card className="space-y-4">
          <CardHeader
            title="Cores do calendário"
            subtitle="As mesmas cores do PDF."
            action={
              editable && (
                <Button size="sm" onClick={() => setEditLegend(!editLegend)}>
                  {editLegend ? 'Fechar edição' : 'Editar cores'}
                </Button>
              )
            }
          />
          {!editLegend && (
            <ul className="space-y-1.5">
              {form.legend.map((l) => (
                <li key={l.key} className="flex items-start gap-2.5 text-[13px] text-ink-2">
                  <span className="mt-0.5">
                    <Swatch entry={l} size={16} />
                  </span>
                  {l.label}
                </li>
              ))}
              {form.legend.length === 0 && <li className="text-[12px] text-ink-3">Sem cores.</li>}
            </ul>
          )}
          {editLegend && (
          <fieldset disabled={!editable} className="divide-y divide-hairline">
            {form.legend.map((l, i) => (
              <div key={l.key} className="space-y-2 py-3 first:pt-0">
                <TextArea aria-label="Nome da categoria" rows={1} value={l.label} onChange={(e) => setLegend(i, { label: e.target.value })} />
                <div className="flex items-center gap-2">
                <Swatch entry={l} size={18} />
                <input
                  type="color"
                  aria-label={`Cor de ${l.label}`}
                  value={l.color}
                  onChange={(e) => setLegend(i, { color: e.target.value })}
                  className="h-8 w-9 cursor-pointer rounded-sm bg-transparent"
                />
                <span className="flex-1 text-[11.5px] text-ink-4">{l.group}{l.fromPdf ? ' · do PDF' : ''}</span>
                <div className="w-32">
                  <Select aria-label="Estilo na grade" value={l.style} onChange={(e) => setLegend(i, { style: e.target.value as LegendEntry['style'] })}>
                    <option value="fill">Pinta o dia</option>
                    <option value="corner">Canto</option>
                    <option value="dot">Ponto</option>
                  </Select>
                </div>
                <Button size="sm" variant="ghost" square aria-label={`Remover ${l.label}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setForm((f) => ({ ...f, legend: f.legend.filter((_, j) => j !== i) }))} />
                </div>
              </div>
            ))}
            <div className="pt-3">
            <Button
              size="xs"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setForm((f) => ({ ...f, legend: [...f.legend, { key: `${slug('nova categoria')}-${Date.now().toString(36)}`, label: 'Nova categoria', color: '#8faadc', style: 'fill', group: 'Legenda', fromPdf: false }] }))}
            >
              Adicionar cor
            </Button>
            </div>
          </fieldset>
          )}
        </Card>

        <Card className="space-y-3">
          <CardHeader title="Observações gerais" subtitle="Rodapés e avisos do PDF que valem para o calendário inteiro." />
          <fieldset disabled={!editable} className="space-y-2">
            {form.notes.map((n, i) => (
              <div key={n.id} className="flex items-start gap-2">
                <TextArea aria-label={`Observação ${i + 1}`} rows={2} value={n.text} onChange={(e) => setForm((f) => ({ ...f, notes: f.notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
                <Button size="sm" variant="ghost" square aria-label={`Remover observação ${i + 1}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setForm((f) => ({ ...f, notes: f.notes.filter((_, j) => j !== i) }))} />
              </div>
            ))}
            {form.notes.length === 0 && <p className="text-[12px] text-ink-3">Nenhuma observação geral.</p>}
            <Button size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm((f) => ({ ...f, notes: [...f.notes, { id: `n-${Date.now().toString(36)}`, text: '' }] }))}>
              Adicionar observação
            </Button>
          </fieldset>
        </Card>
      </div>

      {editable && dirty && (
        <div className="sticky bottom-20 z-10 xl:col-span-2 lg:bottom-4">
          <div className="flex items-center justify-end gap-3 rounded-xl bg-surface px-4 py-3 shadow-overlay">
            <SectionLabel>Há alterações não salvas</SectionLabel>
            <Button variant="ghost" onClick={() => setForm(init())}>
              Descartar
            </Button>
            <Button variant="primary" icon={<Save className="h-4 w-4" />} onClick={save} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}
      <div className="xl:col-span-2">
        <HistoryTab ctx={ctx} />
      </div>
    </div>
  );
}
