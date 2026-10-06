import { useState } from 'react';
import { Globe } from 'lucide-react';
import type { StudentEventItem } from '@calendarios/core';
import { instantToWall } from '@calendarios/core';
import { Button } from '../../components/ui/button';
import { Card, EmptyState, PageHeader, Skeleton } from '../../components/ui/Surfaces';
import { useToast } from '../../components/ui/Toast';
import { pdfUrl } from '../../lib/api';
import { navigate, paths } from '../../lib/router';
import { useStudentPreview } from '../../lib/studentPreview';
import { useTheme } from '../../lib/theme';
import { PreviewToolbar } from '../student/shared';
import { PortalFrame } from '../student/portal/PortalFrame';
import { PortalCalendarPage } from '../student/portal/PortalCalendarPage';
import { EventPanel } from '../student/portal/EventPanel';
import type { CardActions } from '../student/portal/EventBits';

/* ==========================================================================
   Visão do aluno · Portal do aluno
   --------------------------------------------------------------------------
   A página "Calendário Acadêmico" do Portal do Aluno, dentro da casca do
   portal, montada com a mesma lógica que a API entrega ao portal
   (buildStudentView). Serve para a equipe conferir — antes ou depois de
   publicar — exatamente o que o aluno vai ver.
   ========================================================================== */

export function PortalPreview({ calendarId }: { calendarId: string | null }) {
  const p = useStudentPreview(calendarId);
  const toast = useToast();
  const { resolved } = useTheme();
  const [openUid, setOpenUid] = useState<string | null>(null);
  // quando sai o lembrete de cada favorito marcado nesta prévia
  const [whenByUid, setWhenByUid] = useState<Record<string, string>>({});

  const pdfHref = p.cal?.sourceFileId ? pdfUrl(p.cal.sourceFileId) : null;
  const openItem = openUid ? (p.fullView?.items.find((i) => i.uid === openUid) ?? null) : null;

  const reminderWhen = (uid: string): string | null => {
    if (whenByUid[uid]) return whenByUid[uid];
    const r = p.reminders.find((x) => x.eventUid === uid);
    if (!r) return null;
    const w = instantToWall(r.sendAt);
    return `${w.date.slice(8, 10)}/${w.date.slice(5, 7)} às ${w.time.replace(':', 'h')}`;
  };

  const actions: CardActions = {
    onOpen: setOpenUid,
    onStar: async (uid) => {
      try {
        const r = await p.toggleStar(uid);
        if (r.push) setWhenByUid((m) => ({ ...m, [uid]: r.push!.when }));
        toast.ok(r.note);
      } catch (e) {
        toast.error(e);
      }
    },
    onHide: async (uid) => {
      try {
        toast.ok(await p.toggleHide(uid));
      } catch (e) {
        toast.error(e);
      }
    },
    onIcs: (item: StudentEventItem) => p.downloadIcs([item.uid], item.title),
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Visão do aluno" title="Portal do aluno" description="Como o aluno vê o calendário acadêmico no Portal do Aluno — com a mesma lógica que o portal vai usar." />
      <PreviewToolbar p={p} />

      {p.calendars && p.calendars.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Globe className="h-5 w-5" />}
            title="Nenhum calendário para mostrar"
            message="Adicione e confira um calendário para ver como ele aparece no portal."
            action={<Button onClick={() => navigate(paths.calendars())}>Ir para Calendários</Button>}
          />
        </Card>
      ) : p.error ? (
        <Card>
          <EmptyState icon={<Globe className="h-5 w-5" />} title="Não foi possível montar a prévia" message={p.error} action={<Button onClick={() => void p.reload()}>Tentar de novo</Button>} />
        </Card>
      ) : !p.view || !p.fullView ? (
        <Skeleton className="h-[640px] w-full rounded-xl" />
      ) : (
        <PortalFrame
          overlay={
            <EventPanel
              item={openItem}
              theme={resolved}
              reminderWhen={openItem ? reminderWhen(openItem.uid) : null}
              pdfHref={pdfHref}
              onClose={() => setOpenUid(null)}
              onStar={actions.onStar}
              onHide={actions.onHide}
              onIcs={actions.onIcs}
            />
          }
        >
          <PortalCalendarPage
            view={p.view}
            full={p.fullView}
            theme={resolved}
            category={p.category}
            setCategory={p.setCategory}
            query={p.query}
            setQuery={p.setQuery}
            actions={actions}
            pdfHref={pdfHref}
            onIcsAll={() => p.downloadIcs([...p.fullView!.importantes.map((i) => i.uid)], 'Meus importantes')}
          />
        </PortalFrame>
      )}
    </div>
  );
}
