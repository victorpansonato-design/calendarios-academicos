import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, FileUp, FolderOpen, Loader2 } from 'lucide-react';
import type { CalendarStatus, CalendarSummary, SystemStatus } from '@calendarios/core';
import { normalizeForCompare } from '@calendarios/core';
import { Button, LinkButton } from '../../components/ui/Button';
import { Card, EmptyState, PageHeader, Row, Skeleton } from '../../components/ui/Surfaces';
import { SearchInput, Segmented } from '../../components/ui/Fields';
import { Pill } from '../../components/ui/Badges';
import { api } from '../../lib/api';
import { useInterval, useResource } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';
import { CALENDAR_STATUS, COHORT_LABEL } from '../../lib/labels';
import { relative } from '../../lib/format';
import { staggerContainer, staggerItem } from '../../lib/motion';
import { ImportDialog } from './ImportDialog';

/* ==========================================================================
   Calendários
   --------------------------------------------------------------------------
   Estado vazio: uma ação só, "Adicionar calendários". Com dados: uma lista
   simples — nome, período, modalidade, público, eventos, status, última
   alteração e quem fez. Busca e filtros, e nenhum painel de métricas.
   ========================================================================== */

type StatusFilter = 'all' | CalendarStatus;

export function CalendarsView({ status }: { status: SystemStatus | null }) {
  const list = useResource(() => api.calendars.list(), []);
  const recent = useResource(() => api.imports.recent(), []);
  const [importOpen, setImportOpen] = useState(false);
  const [resumeBatch, setResumeBatch] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const running = recent.data?.items.find((b) => b.status === 'running');
  useInterval(() => {
    void recent.reload();
    void list.reload();
  }, 2500, Boolean(running));

  const items = list.data?.items ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const s of ['draft', 'in_review', 'published', 'archived'] as CalendarStatus[])
      c[s] = items.filter((i) => (s === 'published' ? i.publishedVersion !== null && i.status !== 'archived' : i.status === s)).length;
    return c;
  }, [items]);

  const filtered = items.filter((c) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'published' ? c.publishedVersion === null || c.status === 'archived' : statusFilter === 'draft' ? c.status !== 'draft' && c.status !== 'in_review' : c.status !== statusFilter) return false;
    }
    if (statusFilter === 'all' && c.status === 'archived') return false;
    if (q) {
      const hay = normalizeForCompare([c.title, c.scope.audienceLabel, c.scope.modality, ...c.scope.courses, c.sourceFileName ?? ''].join(' '));
      if (!hay.includes(normalizeForCompare(q))) return false;
    }
    return true;
  });

  const openImport = (batchId: string | null = null) => {
    setResumeBatch(batchId);
    setImportOpen(true);
  };

  const onImportClose = () => {
    setImportOpen(false);
    void list.reload();
    void recent.reload();
  };

  const loading = list.loading && !list.data;
  const empty = !loading && items.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendários"
        description="Adicione os PDFs, escolha os avisos e publique para os alunos."
        actions={
          !empty && (
            <Button variant="primary" size="md" icon={<FileUp className="h-4 w-4" />} onClick={() => openImport()}>
              Adicionar calendários
            </Button>
          )
        }
      />

      {running && (
        <Card tone="inset" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Loader2 className="spin h-4 w-4 text-ink-3" />
            <p className="text-[13px] font-medium text-ink">
              Leitura em andamento: <span className="font-mono">{running.done}</span> de <span className="font-mono">{running.total}</span> arquivos concluídos
            </p>
          </div>
          <LinkButton onClick={() => openImport(running.id)}>Ver progresso</LinkButton>
        </Card>
      )}

      {loading && (
        <Card padded={false} className="divide-y divide-hairline">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="ml-auto h-4 w-24" />
            </div>
          ))}
        </Card>
      )}

      {list.error && !list.data && (
        <Card>
          <EmptyState title="Não foi possível carregar os calendários" message={list.error.message} action={<Button onClick={() => list.reload()}>Tentar de novo</Button>} />
        </Card>
      )}

      {empty && (
        <Card className="py-6">
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            title="Nenhum calendário por aqui ainda"
            message="Comece adicionando os calendários em PDF — um de cada vez ou vários juntos. Nada vai para os alunos antes da sua conferência."
            action={
              <div className="mt-2 flex flex-col items-center gap-5">
                <Button variant="primary" size="md" icon={<FileUp className="h-4 w-4" />} onClick={() => openImport()}>
                  Adicionar calendários
                </Button>
                <ol className="grid max-w-xl gap-3 text-left sm:grid-cols-3">
                  {[
                    ['1', 'Adicione', 'Escolha um PDF, vários, uma pasta ou um ZIP.'],
                    ['2', 'Confira', 'Veja o que o sistema entendeu, lado a lado com o PDF.'],
                    ['3', 'Publique', 'Defina os avisos e publique para os alunos.'],
                  ].map(([n, t, d]) => (
                    <li key={n} className="rounded-lg bg-surface-2 p-3.5">
                      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface font-mono text-[12px] text-ink-2">{n}</span>
                        {t}
                      </p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{d}</p>
                    </li>
                  ))}
                </ol>
                <span className="flex items-center gap-1.5 text-[12px] text-ink-4">
                  <FolderOpen className="h-3.5 w-3.5" /> Até {status?.limits.maxFileMb ?? 25} MB por arquivo
                </span>
              </div>
            }
          />
        </Card>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput value={q} onValueChange={setQ} placeholder="Procurar calendário…" className="lg:w-80" />
          </div>
          <div className="scroll-slim -mx-1 overflow-x-auto px-1 pb-0.5">
            <Segmented<StatusFilter>
              layoutId="calendar-status-filter"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'Todos', count: counts.all - counts.archived },
                { value: 'draft', label: 'Em preparação', count: counts.draft + counts.in_review },
                { value: 'published', label: 'Publicados', count: counts.published },
                { value: 'archived', label: 'Fora do ar', count: counts.archived },
              ]}
            />
          </div>
          <Card padded={false}>
            <div className="hidden grid-cols-[minmax(0,2.4fr)_90px_110px_70px_150px_minmax(0,1fr)] gap-4 border-b border-hairline px-5 py-2.5 text-[12px] font-medium text-ink-3 lg:grid">
              <span>Calendário</span>
              <span>Período</span>
              <span>Modalidade</span>
              <span className="text-right">Eventos</span>
              <span>Status</span>
              <span>Última alteração</span>
            </div>
            {filtered.length === 0 ? (
              <EmptyState compact title="Nenhum calendário com esses filtros" message="Limpe a busca ou escolha outro status." />
            ) : (
              <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="divide-y divide-hairline">
                {filtered.map((c) => (
                  <motion.li key={c.id} variants={staggerItem}>
                    <CalendarRow c={c} />
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </Card>
        </div>
      )}

      <ImportDialog open={importOpen} onClose={onImportClose} resumeBatchId={resumeBatch} status={status} />
    </div>
  );
}

function CalendarRow({ c }: { c: CalendarSummary }) {
  const st = CALENDAR_STATUS[c.status];
  const audience = [c.scope.courses.length ? c.scope.courses.join(', ') : 'Todos os cursos', c.scope.cohorts.map((x) => COHORT_LABEL[x]).join(', ') || null, c.scope.exceptions.length ? `exceto ${c.scope.exceptions.join(', ')}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Row onClick={() => navigate(paths.calendar(c.id))} className="px-5 py-3.5">
      <div className="grid gap-x-4 gap-y-1.5 lg:grid-cols-[minmax(0,2.4fr)_90px_110px_70px_150px_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{c.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-ink-3">{audience || c.scope.audienceLabel || 'Público a definir'}</p>
        </div>
        <span className="font-mono text-[12px] text-ink-2">
          {c.year ?? '—'}/{c.semester ?? '—'}
          <span className="font-sans text-ink-4 lg:hidden"> · {c.scope.modality || 'modalidade a definir'} · {c.eventCount} eventos</span>
        </span>
        <span className="hidden lg:block">{c.scope.modality ? <Pill dot={false}>{c.scope.modality}</Pill> : <span className="text-[12px] text-ink-4">A definir</span>}</span>
        <span className="hidden text-right font-mono text-[12px] text-ink-2 lg:block">{c.eventCount}</span>
        <div className="flex flex-col gap-0.5">
          <Pill tone={st.tone} solid={c.status === 'in_review'}>
            {st.label}
            {c.publishedVersion && c.status !== 'published' && c.status !== 'archived' ? ' · alterações não publicadas' : ''}
          </Pill>

        </div>
        <span className="text-[12px] leading-snug text-ink-3">
          <span className="block text-ink-2">{relative(c.updatedAt)}</span>
          <span className="block truncate">{c.updatedBy}</span>
        </span>
      </div>
    </Row>
  );
}
