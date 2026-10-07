import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { SystemStatus } from '@calendarios/core';
import { Shell } from './components/layout/Shell';
import { ToastProvider } from './components/ui/Toast';
import { LoginView } from './views/LoginView';
import { CalendarsView } from './views/calendars/CalendarsView';
import { CalendarDetailView } from './views/calendar/CalendarDetailView';
import { NotificationsView } from './views/notifications/NotificationsView';
import { PortalPreview } from './views/preview/PortalPreview';
import { AppPreview } from './views/preview/AppPreview';
import { api } from './lib/api';
import { clearSession, useSession } from './lib/session';
import { useRoute } from './lib/router';
import { pageVariants } from './lib/motion';
import { ServerUnavailable } from './views/ServerUnavailable';

export default function App() {
  const session = useSession();
  return <ToastProvider>{session ? <Authenticated /> : <LoginView />}</ToastProvider>;
}

function Authenticated() {
  const session = useSession()!;
  const route = useRoute();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [serverDown, setServerDown] = useState(false);

  const check = () =>
    api
      .status()
      .then((s) => {
        setStatus(s);
        setServerDown(false);
      })
      .catch(() => setServerDown(true));

  useEffect(() => {
    void check();
  }, []);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    clearSession();
  };

  const section = route.name === 'calendar' ? 'calendars' : route.name;
  const key = route.name === 'calendar' ? `cal-${route.id}` : route.name;

  return (
    <Shell section={section} user={session.user} status={status} onLogout={logout}>
      {serverDown ? (
        <ServerUnavailable onRetry={check} />
      ) : (
      <AnimatePresence mode="wait">
        <motion.div key={key} variants={pageVariants} initial="initial" animate="animate" exit="exit">
          {route.name === 'calendars' && <CalendarsView status={status} />}
          {route.name === 'calendar' && <CalendarDetailView id={route.id} tab={route.tab} focusEventId={route.focus} />}
          {route.name === 'notifications' && <NotificationsView tab={route.tab} status={status} />}
          {route.name === 'student-portal' && <PortalPreview calendarId={route.calendarId} />}
          {route.name === 'student-app' && <AppPreview calendarId={route.calendarId} />}
        </motion.div>
      </AnimatePresence>
      )}
    </Shell>
  );
}
