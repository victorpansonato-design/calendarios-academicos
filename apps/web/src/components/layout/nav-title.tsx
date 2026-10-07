import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { paths, useRoute, type Route } from '../../lib/router';

/* Breadcrumb da barra superior, montado a partir da rota de hash. Ancestrais
   em cinza e clicáveis; o trecho atual em destaque. */

interface Crumb {
  label: string;
  href?: string;
}

const CALENDAR_TAB: Record<string, string> = {
  calendario: 'Calendário',
  mes: 'Mês a mês',
  eventos: 'Eventos',
  informacoes: 'Informações',
};

function crumbsFor(route: Route): Crumb[] {
  switch (route.name) {
    case 'calendars':
      return [{ label: 'Calendários' }];
    case 'calendar':
      return [
        { label: 'Calendários', href: paths.calendars() },
        { label: 'Calendário', href: paths.calendar(route.id) },
        { label: CALENDAR_TAB[route.tab ?? ''] ?? CALENDAR_TAB.calendario },
      ];
    case 'notifications':
      return [{ label: 'Notificações', href: paths.notifications() }, { label: route.tab === 'acontecimentos' ? 'Acontecimentos' : 'Agenda' }];
    case 'student-portal':
      return [{ label: 'Visão do aluno' }, { label: 'Portal do aluno' }];
    case 'student-app':
      return [{ label: 'Visão do aluno' }, { label: 'App Grupo Anchieta' }];
  }
}

export function NavTitle() {
  const crumbs = crumbsFor(useRoute());

  return (
    <nav aria-label="Você está em" className="flex min-w-0 flex-1 items-center">
      <ol className="flex min-w-0 items-center gap-1.5 truncate text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${c.label}-${i}`}>
              <li className="flex min-w-0 items-center truncate">
                {c.href && !last ? (
                  <a href={c.href} className="truncate rounded-sm px-1 text-muted-foreground transition-colors hover:text-foreground">
                    {c.label}
                  </a>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={last ? 'truncate font-medium text-foreground' : 'truncate px-1 text-muted-foreground'}>
                    {c.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="shrink-0 text-muted-foreground/60">
                  <ChevronRight className="h-3.5 w-3.5" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
