import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, ChevronDown, Copy, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import type { Calendar, CalendarEvent, DateKind, EventInput, EventTime, Importance, ReminderOffset, Shift } from '@calendarios/core';
import {
  EVENT_TYPE_LABEL,
  applyImportance,
  defaultNotificationRule,
  openEventIssues,
  planEventReminders,
  reminderBlockReason,
  scopeLabel,
  suggestAnchor,
} from '@calendarios/core';
import { Drawer, Confirm } from '../ui/Overlay';
import { Button } from '../ui/Button';
import { Callout, SectionLabel } from '../ui/Surfaces';
import { Chip, Field, Segmented, Select, TextArea, TextInput } from '../ui/Fields';
import { Swatch } from './Legend';
import { api, pdfUrl, type CalendarDetail } from '../../lib/api';
import { useToast } from '../ui/Toast';
import { AUDIENCE_GROUPS, IMPORTANCE } from '../../lib/labels';
import { when } from '../../lib/format';
import { collapseVariants } from '../../lib/motion';

/* ==========================================================================
   Editor de evento
   --------------------------------------------------------------------------
   À vista, só o que se muda no dia a dia: título, data, descrição e aviso.
   Todo o resto (horários, local, links, cor, público, texto do push, redação
   original do PDF) fica em "Mais detalhes", fechado por padrão.
   ========================================================================== */

const SHIFTS: Shift[] = ['Diurno', 'Noturno', 'Matutino', 'Vespertino', 'Integral'];

function toInput(e: CalendarEvent): EventInput {
  const { title, description, dates, times, location, urls, notes, audience, type, category, color, importance, notification } = e;
  return structuredClone({ title, description, dates, times, location, urls, notes, audience, type, category, color, importance, notification });
}

function blank(date: string | null): EventInput {
  const d = date ?? '';
  return {
    title: '',
    description: '',
    dates: { kind: 'single', start: d, end: d, dates: [], label: '' },
    times: [],
    location: null,
    urls: [],
    notes: [],
    audience: { groups: [], evidence: null },
    type: 'academic',
    category: null,
    color: null,
    importance: 'unset',
    notification: defaultNotificationRule('start'),
  };
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

export function EventEditor({
  open,
  onClose,
  calendar,
  event,
  newDate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  calendar: Calendar;
  event: CalendarEvent | null;
  newDate?: string | null;
  onSaved: (detail: CalendarDetail, message: string) => void;
}) {
  const toast = useToast();
  const initial = useMemo(() => (event ? toInput(event) : blank(newDate ?? null)), [event, newDate]);
  const [draft, setDraft] = useState<EventInput>(initial);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'discard' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
    setError(null);
    setMore(false);
  }, [initial, open]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setNotif = (patch: Partial<EventInput['notification']>) => setDraft((d) => ({ ...d, notification: { ...d.notification, ...patch } }));
  const requestClose = () => (dirty ? setConfirm('discard') : onClose());
  const archived = calendar.status === 'archived';

  /* -- Datas ------------------------------------------------------------- */
  const setKind = (kind: DateKind) => {
    const s = draft.dates.start;
    setDraft((d) => ({
      ...d,
      dates: kind === 'list' ? { kind, start: s, end: s, dates: s ? [s, ''] : ['', ''], label: '' } : { kind, start: s, end: kind === 'range' ? d.dates.end : s, dates: [], label: '' },
      notification: { ...d.notification, anchor: kind === 'list' ? 'each' : suggestAnchor(kind, d.type, d.description), anchorConfirmed: false },
    }));
  };

  const datesValid = (() => {
    const d = draft.dates;
    if (d.kind === 'single') return Boolean(d.start);
    if (d.kind === 'range') return Boolean(d.start && d.end && d.start < d.end);
    return d.dates.filter(Boolean).length >= 2;
  })();

  const normalizedDates = (): EventInput['dates'] => {
    const d = draft.dates;
    if (d.kind === 'list') {
      const list = [...new Set(d.dates.filter(Boolean))].sort();
      return { ...d, dates: list, start: list[0], end: list[list.length - 1] };
    }
    if (d.kind === 'single') return { ...d, end: d.start };
    return d;
  };

  /* -- Aviso ------------------------------------------------------------- */
  const chooseImportance = (v: Importance) =>
    setDraft((d) => {
      const n = applyImportance(d.notification, v);
      // período: a sugestão (início/fim) já vem marcada; escolher o aviso aqui, vendo a pergunta, conta como conferido
      return { ...d, importance: v, notification: d.dates.kind === 'range' ? { ...n, anchorConfirmed: true } : n };
    });
  const avisa = draft.importance === 'medium' || draft.importance === 'high';

  const previewEvent = useMemo(() => {
    if (!datesValid) return null;
    return { ...(event ?? {}), ...draft, uid: event?.uid ?? 'novo', id: event?.id ?? 'novo', dates: normalizedDates(), datesResolved: true } as CalendarEvent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, event, datesValid]);
  const preview = previewEvent ? planEventReminders(previewEvent, { calendarId: calendar.id, calendarTitle: calendar.title, now: new Date() }) : [];
  const blockReason = previewEvent ? reminderBlockReason(previewEvent) : null;

  /* -- Ações ------------------------------------------------------------- */
  const save = async () => {
    setError(null);
    if (!draft.title.trim()) return setError('Escreva o título do evento.');
    if (!datesValid) return setError('Confira a data: um período precisa terminar depois de começar.');
    setSaving(true);
    try {
      const input = { ...draft, dates: normalizedDates() };
      const res = event ? await api.calendars.updateEvent(calendar.id, event.id, input, calendar.version) : await api.calendars.createEvent(calendar.id, input);
      onSaved(res, event ? 'Evento salvo.' : 'Evento incluído.');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setSaving(true);
    try {
      onSaved(await api.calendars.deleteEvent(calendar.id, event.id), 'Evento excluído.');
      setConfirm(null);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!event) return;
    try {
      onSaved(await api.calendars.duplicateEvent(calendar.id, event.id), 'Evento duplicado.');
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  const hard = event ? openEventIssues({ ...event, ...draft, datesResolved: event.datesResolved || JSON.stringify(draft.dates) !== JSON.stringify(event.dates) } as CalendarEvent).filter((i) => i.severity === 'blocker') : [];
  const legendEntry = calendar.legend.find((l) => l.key === draft.category);
  const pages = event ? [...new Set(event.sources.map((s) => s.page))] : [];

  return (
    <>
      <Drawer open={open} onClose={requestClose} label={event ? `Editar ${event.title}` : 'Novo evento'} width="lg">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <p className="mb-1 text-[12px] font-medium text-ink-3">{event ? 'Editar evento' : 'Novo evento'}</p>
            <h2 className="text-[15px] leading-tight font-semibold text-ink">{draft.title || 'Sem título'}</h2>
          </div>
          <button type="button" onClick={requestClose} aria-label="Fechar" className="-mt-0.5 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="scroll-slim min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {hard.map((i) => (
            <Callout key={i.code} tone="warn" title="Precisa de ajuste">
              {i.message}
            </Callout>
          ))}

          <Field label="Título" required>
            {(id) => <TextInput id={id} value={draft.title} onChange={(e) => set('title', e.target.value)} disabled={archived} />}
          </Field>

          <Block title="Data">
            <div>
            <Segmented<DateKind>
              layoutId="editor-date-kind"
              value={draft.dates.kind}
              onChange={setKind}
              options={[
                { value: 'single', label: 'Um dia' },
                { value: 'range', label: 'Período' },
                { value: 'list', label: 'Dias separados' },
              ]}
            />
            </div>
            {draft.dates.kind === 'single' && <TextInput type="date" aria-label="Data" value={draft.dates.start} onChange={(e) => set('dates', { ...draft.dates, start: e.target.value, end: e.target.value })} className="max-w-[200px]" />}
            {draft.dates.kind === 'range' && (
              <div className="grid max-w-md grid-cols-2 gap-3">
                <Field label="De">{(id) => <TextInput id={id} type="date" value={draft.dates.start} onChange={(e) => set('dates', { ...draft.dates, start: e.target.value })} />}</Field>
                <Field label="Até">{(id) => <TextInput id={id} type="date" value={draft.dates.end} onChange={(e) => set('dates', { ...draft.dates, end: e.target.value })} />}</Field>
              </div>
            )}
            {draft.dates.kind === 'list' && (
              <div className="space-y-2">
                <p className="text-[12px] text-ink-3">Só estes dias — os dias no meio não contam.</p>
                {draft.dates.dates.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TextInput type="date" aria-label={`Dia ${i + 1}`} value={d} onChange={(e) => set('dates', { ...draft.dates, dates: draft.dates.dates.map((x, j) => (j === i ? e.target.value : x)) })} className="max-w-[200px]" />
                    {draft.dates.dates.length > 2 && (
                      <Button size="sm" variant="ghost" square aria-label={`Remover dia ${i + 1}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => set('dates', { ...draft.dates, dates: draft.dates.dates.filter((_, j) => j !== i) })} />
                    )}
                  </div>
                ))}
                <Button size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set('dates', { ...draft.dates, dates: [...draft.dates.dates, ''] })}>
                  Adicionar dia
                </Button>
              </div>
            )}
          </Block>

          <Field label="Descrição" help="O texto que os alunos leem no portal e no app.">
            {(id) => <TextArea id={id} rows={4} value={draft.description} onChange={(e) => set('description', e.target.value)} disabled={archived} />}
          </Field>

          <Block title="Avisar os alunos?">
            <div>
            <Segmented<Importance>
              layoutId="editor-importance"
              value={draft.importance}
              onChange={chooseImportance}
              options={(['low', 'medium', 'high'] as Importance[]).map((v) => ({ value: v, label: v === 'low' ? 'Não avisar' : IMPORTANCE[v].short }))}
            />
            </div>
            <p className="text-[12px] text-ink-3">{IMPORTANCE[draft.importance].help}</p>

            {avisa && draft.dates.kind === 'range' && (
              <div className="space-y-2">
                <p className="text-[12px] font-medium text-ink">O aviso é sobre…</p>
                <Segmented
                  layoutId="editor-anchor"
                  value={draft.notification.anchorConfirmed ? (draft.notification.anchor === 'end' ? 'end' : 'start') : ('' as 'start')}
                  onChange={(v) => setNotif({ anchor: v, anchorConfirmed: true })}
                  options={[
                    { value: 'start', label: 'o começo do período' },
                    { value: 'end', label: 'o fim do prazo' },
                  ]}
                />
              </div>
            )}

            {avisa && (
              <div className="rounded-lg bg-surface-2 p-3.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                  <BellRing className="h-3.5 w-3.5 text-ink-3" /> Os alunos vão receber
                </p>
                {preview.length ? (
                  <ul className="space-y-1.5">
                    {preview.map((p) => (
                      <li key={p.idempotencyKey} className="text-[12px] text-ink-2">
                        <span className="font-mono">{when(p.sendAt)}</span> — {p.body}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-ink-3">{blockReason ?? 'A data de aviso já passou — não há aviso atrasado.'}</p>
                )}
              </div>
            )}
          </Block>

          <div>
            <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex w-full items-center justify-between rounded-md py-2 text-left text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink">
              Mais detalhes
              <ChevronDown className={`h-4 w-4 text-ink-4 transition-transform ${more ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {more && (
                <motion.div variants={collapseVariants} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                  <div className="space-y-6 pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Tipo">
                        {(id) => (
                          <Select id={id} value={draft.type} onChange={(e) => set('type', e.target.value as EventInput['type'])}>
                            {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <Field label="Cor no calendário">
                        {(id) => (
                          <div className="flex items-center gap-2">
                            {legendEntry && <Swatch entry={legendEntry} size={18} />}
                            <div className="min-w-0 flex-1">
                              <Select
                                id={id}
                                value={draft.category ?? ''}
                                onChange={(e) => {
                                  const l = calendar.legend.find((x) => x.key === e.target.value);
                                  setDraft((d) => ({ ...d, category: l?.key ?? null, color: l?.color ?? null }));
                                }}
                              >
                                <option value="">Sem cor</option>
                                {calendar.legend.map((l) => (
                                  <option key={l.key} value={l.key}>
                                    {l.label}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>
                        )}
                      </Field>
                    </div>

                    <Block title="Horários">
                      {draft.times.map((t, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <div className="w-40">
                            <Select aria-label={`Turno do horário ${i + 1}`} value={t.shift ?? ''} onChange={(e) => set('times', draft.times.map((x, j) => (j === i ? { ...x, shift: (e.target.value || null) as EventTime['shift'] } : x)))}>
                              <option value="">Sem turno</option>
                              {SHIFTS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <TextInput type="time" aria-label={`Horário ${i + 1}`} value={t.time} onChange={(e) => set('times', draft.times.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} className="w-32" />
                          <Button size="sm" variant="ghost" square aria-label={`Remover horário ${i + 1}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => set('times', draft.times.filter((_, j) => j !== i))} />
                        </div>
                      ))}
                      <Button size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set('times', [...draft.times, { shift: null, time: '19:30', raw: '' }])}>
                        Adicionar horário
                      </Button>
                    </Block>

                    <Field label="Local">{(id) => <TextInput id={id} value={draft.location ?? ''} onChange={(e) => set('location', e.target.value || null)} />}</Field>

                    <Block title="Links">
                      {draft.urls.map((u, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <TextInput aria-label={`Link ${i + 1}`} value={u} onChange={(e) => set('urls', draft.urls.map((x, j) => (j === i ? e.target.value : x)))} placeholder="https://" />
                          <Button size="sm" variant="ghost" square aria-label={`Remover link ${i + 1}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => set('urls', draft.urls.filter((_, j) => j !== i))} />
                        </div>
                      ))}
                      <Button size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set('urls', [...draft.urls, ''])}>
                        Adicionar link
                      </Button>
                    </Block>

                    <Block title="Observações">
                      {draft.notes.map((n, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <TextArea aria-label={`Observação ${i + 1}`} rows={2} value={n} onChange={(e) => set('notes', draft.notes.map((x, j) => (j === i ? e.target.value : x)))} />
                          <Button size="sm" variant="ghost" square aria-label={`Remover observação ${i + 1}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => set('notes', draft.notes.filter((_, j) => j !== i))} />
                        </div>
                      ))}
                      <Button size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set('notes', [...draft.notes, ''])}>
                        Adicionar observação
                      </Button>
                    </Block>

                    <Block title="Para quem">
                      <p className="text-[12px] leading-relaxed text-ink-3">
                        Sem nada marcado, vale para todos: <span className="font-medium text-ink-2">{scopeLabel(calendar.scope)}</span>.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {[...new Set([...AUDIENCE_GROUPS, ...draft.audience.groups])].map((g) => (
                          <Chip
                            key={g}
                            active={draft.audience.groups.includes(g)}
                            onClick={() => set('audience', { ...draft.audience, groups: draft.audience.groups.includes(g) ? draft.audience.groups.filter((x) => x !== g) : [...draft.audience.groups, g] })}
                          >
                            Só {g.toLowerCase()}
                          </Chip>
                        ))}
                      </div>
                      {draft.audience.evidence && <p className="text-[11.5px] text-ink-4">No PDF: “{draft.audience.evidence}”</p>}
                    </Block>

                    {avisa && (
                      <Block title="Ajustar o aviso">
                        {draft.notification.offsets.map((o, i) => (
                          <div key={o.id} className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                            <TextInput
                              type="number"
                              min={0}
                              max={60}
                              aria-label={`Dias antes, aviso ${i + 1}`}
                              value={o.daysBefore}
                              onChange={(e) => setNotif({ customized: true, offsets: draft.notification.offsets.map((x, j) => (j === i ? { ...x, daysBefore: Math.max(0, Math.min(60, Number(e.target.value))) } : x)) })}
                              className="w-20"
                            />
                            dia(s) antes, às
                            <TextInput type="time" aria-label={`Horário, aviso ${i + 1}`} value={o.time} onChange={(e) => setNotif({ customized: true, offsets: draft.notification.offsets.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)) })} className="w-32" />
                            <Button size="sm" variant="ghost" square aria-label={`Remover aviso ${i + 1}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setNotif({ customized: true, offsets: draft.notification.offsets.filter((_, j) => j !== i) })} />
                          </div>
                        ))}
                        {draft.notification.offsets.length < 6 && (
                          <Button size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNotif({ customized: true, offsets: [...draft.notification.offsets, { id: `c${Date.now().toString(36)}`, daysBefore: 2, time: '09:00' } as ReminderOffset] })}>
                            Adicionar outro aviso
                          </Button>
                        )}
                        <Field label="Título do aviso">{(id) => <TextInput id={id} maxLength={120} value={draft.notification.pushTitle} onChange={(e) => setNotif({ pushTitle: e.target.value })} />}</Field>
                        <Field label="Texto do aviso" help="As partes entre {{ }} são preenchidas sozinhas (título, data, 'amanhã'…).">
                          {(id) => <TextArea id={id} rows={2} maxLength={500} value={draft.notification.pushBody} onChange={(e) => setNotif({ pushBody: e.target.value })} />}
                        </Field>
                      </Block>
                    )}

                    {event?.rawText && (
                      <Block title="Como está escrito no PDF">
                        <pre className="rounded-lg bg-surface-2 p-3.5 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">{event.rawText}</pre>
                        {event.sources[0] && (
                          <div className="flex flex-wrap gap-2">
                            {pages.map((p) => (
                              <a key={p} href={pdfUrl(event.sources[0].fileId, p)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink">
                                Abrir o PDF na página {p} <ExternalLink className="h-3 w-3" />
                              </a>
                            ))}
                          </div>
                        )}
                      </Block>
                    )}

                    {event && !archived && (
                      <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
                        <Button variant="ghost" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={duplicate}>
                          Duplicar evento
                        </Button>
                        <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirm('delete')}>
                          Excluir evento
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-hairline bg-surface-2/60 px-5 py-3.5">
          {error && (
            <p role="alert" className="mr-auto max-w-xs text-[12px] font-medium text-crit">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={requestClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={save} disabled={saving || archived || (!dirty && Boolean(event))}>
            {saving ? 'Salvando…' : event ? 'Salvar' : 'Incluir evento'}
          </Button>
        </footer>
      </Drawer>

      <Confirm
        open={confirm === 'discard'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          onClose();
        }}
        title="Sair sem salvar?"
        message="Você mudou este evento e ainda não salvou."
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        tone="danger"
      />
      <Confirm
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={saving}
        title="Excluir este evento?"
        message={
          <>
            <strong className="text-ink">{event?.title}</strong> sai do calendário. Se foi sem querer, dá para desfazer em Informações → Histórico.
          </>
        }
        confirmLabel="Excluir"
        tone="danger"
      />
    </>
  );
}
