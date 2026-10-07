import { useState } from 'react';
import { BellRing, Palette, Smartphone } from 'lucide-react';
import { instantToWall, OUTROS } from '@calendarios/core';
import { Button } from '../../components/ui/button';
import { Card, EmptyState, PageHeader, Skeleton } from '../../components/ui/Surfaces';
import { IPhone } from '../../components/device/IPhone';
import { pdfUrl } from '../../lib/api';
import { navigate, paths } from '../../lib/router';
import { useStudentPreview } from '../../lib/studentPreview';
import { useTheme } from '../../lib/theme';
import { legendStyle, PreviewToolbar } from '../student/shared';
import { PhoneApp } from '../student/app/PhoneApp';
import type { PushPreview } from '../student/app/phoneKit';

/* ==========================================================================
   Visão do aluno · App Grupo Anchieta
   --------------------------------------------------------------------------
   O calendário acadêmico dentro do app, num iPhone de verdade (tamanho
   real, clicável), com a mesma lógica que o app vai usar. Ao lado, o que a
   equipe precisa saber enquanto mexe: quantas datas o aluno vê, as cores e
   o lembrete que a estrela agenda.
   ========================================================================== */

export function AppPreview({ calendarId }: { calendarId: string | null }) {
  const p = useStudentPreview(calendarId);
  const { resolved } = useTheme();
  const [pushes, setPushes] = useState<PushPreview[]>([]);
  const [whenByUid, setWhenByUid] = useState<Record<string, string>>({});
  const pdfHref = p.cal?.sourceFileId ? pdfUrl(p.cal.sourceFileId) : null;

  const reminderWhen = (uid: string) => {
    if (whenByUid[uid]) return whenByUid[uid];
    const r = p.reminders.find((x) => x.eventUid === uid);
    if (!r) return null;
    const w = instantToWall(r.sendAt);
    return `${w.date.slice(8, 10)}/${w.date.slice(5, 7)} às ${w.time.replace(':', 'h')}`;
  };

  const toggleStar = async (uid: string) => {
    const r = await p.toggleStar(uid);
    if (r.push) setWhenByUid((m) => ({ ...m, [uid]: r.push!.when }));
    return r;
  };

  const last = pushes[0];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Visão do aluno" title="App Grupo Anchieta" description="Como o aluno vê o calendário acadêmico no app — com a mesma lógica que o app vai usar. O celular é clicável." />
      <PreviewToolbar p={p} />

      {p.calendars && p.calendars.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Smartphone className="h-5 w-5" />}
            title="Nenhum calendário para mostrar"
            message="Adicione e confira um calendário para ver como ele aparece no app."
            action={<Button onClick={() => navigate(paths.calendars())}>Ir para Calendários</Button>}
          />
        </Card>
      ) : p.error ? (
        <Card>
          <EmptyState icon={<Smartphone className="h-5 w-5" />} title="Não foi possível montar a prévia" message={p.error} action={<Button onClick={() => void p.reload()}>Tentar de novo</Button>} />
        </Card>
      ) : !p.view || !p.fullView ? (
        <Skeleton className="h-[760px] w-full rounded-xl" />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex justify-center rounded-2xl bg-[radial-gradient(120%_80%_at_50%_0%,var(--muted)_0%,transparent_70%)] py-6">
            <IPhone label="Prévia do app Grupo Anchieta" island={<span className="ios-island block rounded-full" style={{ width: 125, height: 36 }} />}>
              <PhoneApp
                view={p.view}
                full={p.fullView}
                category={p.category}
                setCategory={p.setCategory}
                query={p.query}
                setQuery={p.setQuery}
                toggleStar={toggleStar}
                toggleHide={p.toggleHide}
                onIcs={(item) => p.downloadIcs([item.uid], item.title)}
                reminderWhen={reminderWhen}
                pdfHref={pdfHref}
                pushes={pushes}
                onPush={(push) => setPushes((list) => [push, ...list])}
              />
            </IPhone>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4">
            <Card>
              <h3 className="font-display text-[15px] font-medium text-foreground">O que o aluno vê</h3>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ['Importantes', p.fullView.counts.importantes],
                    ['Favoritos', p.fullView.counts.starred],
                    ['Ocultos', p.fullView.counts.hidden],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label} className="rounded-lg bg-muted px-2 py-2.5">
                    <dt className="text-[11px] text-muted-foreground">{label}</dt>
                    <dd className="font-display text-[22px] text-foreground">{n}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                De {p.fullView.counts.total} datas do calendário. Alta e Média entram sozinhas; o aluno pode ocultar uma Média e marcar qualquer data com ★.
              </p>
            </Card>

            <Card>
              <h3 className="flex items-center gap-2 font-display text-[15px] font-medium text-foreground">
                <BellRing className="size-4 text-muted-foreground" /> Lembrete de favorito
              </h3>
              {last ? (
                <div className="mt-3 rounded-lg border border-border bg-surface p-3">
                  <p className="flex justify-between text-[11.5px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{last.title}</span> chega {last.when}
                  </p>
                  <p className="mt-1 text-[13px] text-foreground">{last.body}</p>
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">Toque na ★ de uma data no celular para ver o push que só aquele aluno recebe — com o mesmo texto do aviso do evento.</p>
              )}
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                1 dia antes, às 9h. Se o calendário já avisa todos sobre a data, a estrela não duplica o push.
              </p>
            </Card>

            <Card>
              <h3 className="flex items-center gap-2 font-display text-[15px] font-medium text-foreground">
                <Palette className="size-4 text-muted-foreground" /> Cores = legenda do PDF
              </h3>
              <ul className="scroll-slim mt-3 max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                {p.fullView.legend.map((l) => {
                  const ls = legendStyle(l.color, resolved);
                  return (
                    <li key={l.key} className="flex items-center gap-2.5 text-[12.5px] text-foreground/85">
                      <span className="size-3 shrink-0 rounded-[3px]" style={{ background: ls.fill, boxShadow: `inset 0 0 0 1px ${ls.ink}` }} />
                      <span className="min-w-0 flex-1 leading-snug">{l.key === OUTROS ? 'Sem cor na legenda (cinza)' : l.label}</span>
                      <span className="text-[11px] text-muted-foreground tabular">{l.count}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
