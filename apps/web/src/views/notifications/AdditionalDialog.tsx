import { useEffect, useState } from 'react';
import { Mail, Send, Smartphone, Users } from 'lucide-react';
import type { CalendarSummary, Channel } from '@calendarios/core';
import { addDays, wallTimeToInstant } from '@calendarios/core';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Callout, DataList } from '../../components/ui/Surfaces';
import { Chip, Field, Segmented, Select, TextArea, TextInput } from '../../components/ui/Fields';
import { Pill } from '../../components/ui/Badges';
import { useToast } from '../../components/ui/Toast';
import { api, type CalendarDetail } from '../../lib/api';
import { AUDIENCE_GROUPS } from '../../lib/labels';
import { todayISO } from '../../lib/calendarGrid';
import { whenLong } from '../../lib/format';

/* ==========================================================================
   Nova comunicação (envio adicional)
   --------------------------------------------------------------------------
   Diferente de propósito dos avisos automáticos: é uma decisão de alguém,
   então tem duas etapas — escrever e confirmar. A confirmação mostra canal,
   público e horário, e só envia com a caixa marcada.
   ========================================================================== */

type When = 'now' | 'schedule';

export function AdditionalDialog({
  open,
  onClose,
  onCreated,
  calendars,
  initialCalendarId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  calendars: CalendarSummary[];
  initialCalendarId: string | null;
}) {
  const toast = useToast();
  const [step, setStep] = useState<'compose' | 'confirm'>('compose');
  const [calendarId, setCalendarId] = useState('');
  const [detail, setDetail] = useState<CalendarDetail | null>(null);
  const [eventUid, setEventUid] = useState('');
  const [channel, setChannel] = useState<Channel>('push');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [whenMode, setWhenMode] = useState<When>('schedule');
  // padrão: amanhã às 09h00 — "hoje às 09h00" costuma já ter passado
  const [date, setDate] = useState(() => addDays(todayISO(), 1));
  const [time, setTime] = useState('09:00');
  const [audience, setAudience] = useState<{ label: string; note: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('compose');
    setCalendarId(initialCalendarId && calendars.some((c) => c.id === initialCalendarId) ? initialCalendarId : calendars[0]?.id ?? '');
    setEventUid('');
    setChannel('push');
    setTitle('');
    setBody('');
    setGroups([]);
    setWhenMode('schedule');
    setDate(addDays(todayISO(), 1));
    setTime('09:00');
    setChecked(false);
    setError(null);
  }, [open, initialCalendarId, calendars]);

  useEffect(() => {
    if (!calendarId) return setDetail(null);
    api.calendars.get(calendarId).then(setDetail).catch(() => setDetail(null));
  }, [calendarId]);

  useEffect(() => {
    if (!calendarId) return;
    api.notifications
      .audience(calendarId, groups)
      .then((r) => setAudience({ label: r.audience.label, note: r.note }))
      .catch(() => setAudience(null));
  }, [calendarId, groups]);

  const pickEvent = (uid: string) => {
    setEventUid(uid);
    const ev = detail?.events.find((e) => e.uid === uid);
    if (ev) {
      if (!title) setTitle(ev.title.slice(0, 120));
      if (!groups.length && ev.audience.groups.length) setGroups(ev.audience.groups);
    }
  };

  const sendAt = whenMode === 'now' ? null : wallTimeToInstant(date, time);
  const maxTitle = channel === 'push' ? 120 : 200;
  const maxBody = channel === 'push' ? 500 : 5000;

  const next = () => {
    setError(null);
    if (!calendarId) return setError('Escolha o calendário.');
    if (!title.trim() || !body.trim()) return setError(channel === 'push' ? 'Preencha o título e a mensagem.' : 'Preencha o assunto e a mensagem.');
    if (sendAt && new Date(sendAt).getTime() < Date.now()) return setError('O horário escolhido já passou.');
    setStep('confirm');
  };

  const send = async () => {
    setBusy(true);
    try {
      const { job } = await api.notifications.additional({ calendarId, eventUid: eventUid || null, channel, title, body, sendAt, groups });
      toast.ok(sendAt ? `Envio agendado para ${whenLong(job.sendAt)}.` : job.status === 'demo_sent' ? 'Envio simulado (modo demonstração).' : job.status === 'blocked' ? 'Registrado, mas o serviço de envio aguarda configuração.' : 'Envio feito.');
      onCreated();
    } catch (e) {
      setError((e as Error).message);
      setStep('compose');
    } finally {
      setBusy(false);
    }
  };

  const cal = calendars.find((c) => c.id === calendarId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enviar uma mensagem"
      eyebrow={
        <Pill dot={false} solid icon={<Send className="h-3 w-3" />} className="bg-surface-3">
          Envio adicional — não é um aviso automático
        </Pill>
      }
      icon={<Send className="h-4 w-4" />}
      size="lg"
      footer={
        step === 'compose' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={next}>
              Revisar e confirmar
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('compose')}>
              Voltar e editar
            </Button>
            <Button variant="primary" onClick={send} disabled={!checked || busy}>
              {busy ? 'Enviando…' : sendAt ? 'Agendar envio' : 'Enviar agora'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 px-5 py-5">
        {error && (
          <p role="alert" className="text-[12px] font-medium text-crit-ink">
            {error}
          </p>
        )}
        {calendars.length === 0 && <Callout tone="warn" title="Nenhum calendário publicado">Comunicações adicionais são sobre calendários publicados.</Callout>}

        {step === 'compose' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Calendário" required>
                {(id) => (
                  <Select id={id} value={calendarId} onChange={(e) => (setCalendarId(e.target.value), setEventUid(''))}>
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Sobre o evento (opcional)">
                {(id) => (
                  <Select id={id} value={eventUid} onChange={(e) => pickEvent(e.target.value)}>
                    <option value="">Nenhum evento específico</option>
                    {detail?.events.map((e) => (
                      <option key={e.uid} value={e.uid}>
                        {e.dates.label} · {e.title.slice(0, 70)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-ink">Canal</p>
              <Segmented<Channel>
                layoutId="additional-channel"
                value={channel}
                onChange={setChannel}
                options={[
                  { value: 'push', label: 'Push', icon: <Smartphone className="h-3.5 w-3.5" /> },
                  { value: 'email', label: 'E-mail', icon: <Mail className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>
            <Field label={channel === 'push' ? 'Título' : 'Assunto'} required hint={`${title.length}/${maxTitle}`}>
              {(id) => <TextInput id={id} value={title} maxLength={maxTitle} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field label="Mensagem" required hint={`${body.length}/${maxBody}`}>
              {(id) => <TextArea id={id} rows={channel === 'push' ? 3 : 6} value={body} maxLength={maxBody} onChange={(e) => setBody(e.target.value)} />}
            </Field>
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-ink">Público</p>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_GROUPS.map((g) => (
                  <Chip key={g} active={groups.includes(g)} onClick={() => setGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g])}>
                    {g}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-ink-3">
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {audience?.label ?? '…'}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-ink">Quando</p>
              <Segmented<When>
                layoutId="additional-when"
                value={whenMode}
                onChange={setWhenMode}
                options={[
                  { value: 'schedule', label: 'Agendar' },
                  { value: 'now', label: 'Enviar agora' },
                ]}
              />
              {whenMode === 'schedule' && (
                <div className="flex flex-wrap items-center gap-2">
                  <TextInput type="date" aria-label="Data do envio" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} className="w-44" />
                  <TextInput type="time" aria-label="Horário do envio" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
                  <span className="text-[12px] text-ink-4">horário de Brasília</span>
                </div>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-ink-3">Prévia</p>
              <div className="max-w-sm rounded-xl bg-surface-2 p-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-4">
                  {channel === 'push' ? <Smartphone className="h-3 w-3" /> : <Mail className="h-3 w-3" />} {channel === 'push' ? 'App Grupo Anchieta' : 'E-mail'}
                </p>
                <p className="mt-1 text-[13px] font-semibold text-ink">{title || 'Título'}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed whitespace-pre-line text-ink-2">{body || 'Mensagem'}</p>
              </div>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <Callout tone="warn" title={sendAt ? 'Confira antes de agendar' : 'Confira antes de enviar'}>
              Este envio é adicional e vai para o público abaixo. Ele não substitui nem altera os avisos automáticos dos eventos.
            </Callout>
            <DataList
              columns={1}
              items={[
                { label: 'Canal', value: channel === 'push' ? 'Push no app' : 'E-mail' },
                { label: 'Calendário', value: cal?.title ?? '' },
                { label: 'Para quem', value: audience?.label ?? '' },
                { label: 'Quantos alunos', value: <span className="text-ink-3">{audience?.note}</span> },
                { label: 'Quando', value: sendAt ? `${whenLong(sendAt)} (horário de Brasília)` : 'Agora' },
              ]}
            />
            <div className="rounded-xl bg-surface-2 p-3.5">
              <p className="text-[13px] font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed whitespace-pre-line text-ink-2">{body}</p>
            </div>
            <label className="flex items-start gap-2.5 rounded-lg bg-surface-2 p-3.5 text-[13px] text-ink">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-autofocus />
              <span>Confirmo o público, o canal e o horário deste envio.</span>
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
