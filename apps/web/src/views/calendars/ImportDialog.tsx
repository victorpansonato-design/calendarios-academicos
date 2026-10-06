import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { AlertTriangle, CheckCircle2, FileArchive, FileText, FolderOpen, Loader2, RotateCcw, UploadCloud } from 'lucide-react';
import type { ImportBatch, SystemStatus } from '@calendarios/core';
import { Modal } from '../../components/ui/Overlay';
import { Button, LinkButton } from '../../components/ui/button';
import { Callout, SectionLabel } from '../../components/ui/Surfaces';
import { Pill } from '../../components/ui/Badges';
import { api, type UploadProgress } from '../../lib/api';
import { useInterval } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';
import { IMPORT_STATUS } from '../../lib/labels';
import { bytes, plural, shortPath } from '../../lib/format';
import { useToast } from '../../components/ui/Toast';

/* ==========================================================================
   Adicionar calendários
   --------------------------------------------------------------------------
   1. Escolher   — PDFs soltos, uma pasta (com subpastas) ou ZIP; ou arrastar.
   2. Conferir   — quantos PDFs foram encontrados, o que foi ignorado e por
                   quê, e o que é repetido. Nada foi lido ainda.
   3. Leitura    — começa na hora; cada arquivo mostra seu estado assim que
                   muda. Pode fechar: a leitura continua no servidor.
   ========================================================================== */

type Picked = { file: File; path: string };
type Step = 'pick' | 'uploading' | 'review' | 'running';

/** Lê pastas arrastadas, preservando o caminho relativo. */
async function entriesToFiles(items: DataTransferItemList): Promise<Picked[]> {
  const out: Picked[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, path: `${prefix}${file.name}` });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries devolve em lotes; lê até esvaziar
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
    }
  };
  const roots = [...items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => Boolean(e));
  for (const r of roots) await walk(r, '');
  return out;
}

export function ImportDialog({ open, onClose, resumeBatchId, status }: { open: boolean; onClose: () => void; resumeBatchId: string | null; status: SystemStatus | null }) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('pick');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (resumeBatchId) {
      api.imports
        .get(resumeBatchId)
        .then((b) => {
          setBatch(b);
          setStep(b.status === 'staged' ? 'review' : 'running');
        })
        .catch((e) => setError((e as Error).message));
    } else {
      setStep('pick');
      setPicked([]);
      setBatch(null);
      setProgress(null);
    }
  }, [open, resumeBatchId]);

  const active = step === 'running' && batch?.items.some((i) => i.status === 'queued' || i.status === 'reading');
  useInterval(async () => {
    if (!batch) return;
    try {
      setBatch(await api.imports.get(batch.id));
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }, 1200, open && Boolean(active));

  const add = (list: Picked[]) => {
    setError(null);
    setPicked((prev) => {
      const seen = new Set(prev.map((p) => p.path));
      return [...prev, ...list.filter((p) => !seen.has(p.path))];
    });
  };

  const fromInput = (files: FileList | null) => add([...(files ?? [])].map((f) => ({ file: f, path: f.webkitRelativePath || f.name })));

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    try {
      const list = e.dataTransfer.items?.length ? await entriesToFiles(e.dataTransfer.items) : [...e.dataTransfer.files].map((f) => ({ file: f, path: f.name }));
      add(list);
    } catch {
      add([...e.dataTransfer.files].map((f) => ({ file: f, path: f.name })));
    }
  };

  const upload = async () => {
    setStep('uploading');
    setError(null);
    try {
      const b = await api.imports.upload(picked, setProgress);
      if (!b.items.length) {
        setBatch(b);
        setStep('review');
        return;
      }
      // sem etapa intermediária: arquivos iguais viram um calendário só, e o que já existe não é importado de novo
      setBatch(await api.imports.start(b.id, { mergeIdentical: true, forceItemIds: [] }));
      setStep('running');
    } catch (e) {
      setError((e as Error).message);
      setStep('pick');
    }
  };

  const retry = async () => {
    if (!batch) return;
    try {
      setBatch(await api.imports.retry(batch.id));
      toast.ok('Os arquivos com erro voltaram para a fila.');
    } catch (e) {
      toast.error(e);
    }
  };

  const totalSize = picked.reduce((n, p) => n + p.file.size, 0);
  const title = step === 'running' ? 'Lendo os calendários' : 'Adicionar calendários';

  /* -- Rodapé por etapa -------------------------------------------------- */
  let footer = null;
  if (step === 'pick' || step === 'uploading')
    footer = (
      <>
        {picked.length > 0 && step === 'pick' && (
          <Button variant="ghost" onClick={() => setPicked([])}>
            Limpar seleção
          </Button>
        )}
        <Button variant="primary" onClick={upload} disabled={!picked.length || step === 'uploading'}>
          {step === 'uploading' ? 'Enviando…' : picked.length ? `Adicionar ${plural(picked.length, 'arquivo', 'arquivos')}` : 'Adicionar'}
        </Button>
      </>
    );
  if (step === 'review' && batch)
    footer = (
      <Button variant="primary" onClick={() => (setStep('pick'), setPicked([]))}>
        Escolher outros arquivos
      </Button>
    );
  if (step === 'running' && batch) {
    const errors = batch.items.filter((i) => i.status === 'error' && !i.groupLeaderId).length;
    footer = (
      <>
        {errors > 0 && !active && (
          <Button icon={<RotateCcw className="h-4 w-4" />} onClick={retry}>
            Tentar de novo os {plural(errors, 'arquivo com erro', 'arquivos com erro')}
          </Button>
        )}
        <Button variant={active ? 'secondary' : 'primary'} onClick={onClose}>
          {active ? 'Fechar (a leitura continua)' : 'Concluir'}
        </Button>
      </>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg" icon={<UploadCloud className="h-4 w-4" />} footer={footer}>
      <div className="space-y-5 px-5 py-5">
        {error && (
          <Callout tone="crit" icon={<AlertTriangle className="h-4 w-4" />} title="Não foi possível continuar">
            {error}
          </Callout>
        )}

        {(step === 'pick' || step === 'uploading') && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center gap-3 rounded-xl px-6 py-8 text-center transition-colors border border-dashed ${dragging ? 'border-primary/50 bg-primary-soft' : 'border-border bg-surface'}`}
            >
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="text-[13px] font-semibold text-foreground">Arraste aqui os PDFs, uma pasta ou um ZIP</p>
                <p className="mt-1 text-[12px] text-muted-foreground">ou escolha abaixo. As subpastas são mantidas.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={<FileText className="h-4 w-4" />} onClick={() => filesInput.current?.click()}>
                  Escolher PDFs
                </Button>
                <Button icon={<FolderOpen className="h-4 w-4" />} onClick={() => folderInput.current?.click()}>
                  Escolher pasta
                </Button>
                <Button icon={<FileArchive className="h-4 w-4" />} onClick={() => zipInput.current?.click()}>
                  Escolher ZIP
                </Button>
              </div>
              <input ref={filesInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => (fromInput(e.target.files), (e.target.value = ''))} />
              <input ref={zipInput} type="file" accept=".zip,application/zip" multiple hidden onChange={(e) => (fromInput(e.target.files), (e.target.value = ''))} />
              <input
                ref={folderInput}
                type="file"
                hidden
                multiple
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                onChange={(e) => (fromInput(e.target.files), (e.target.value = ''))}
              />
              <p className="text-[11.5px] text-muted-foreground">
                Até {status?.limits.maxFileMb ?? 25} MB por PDF e {status?.limits.maxBatchMb ?? 300} MB por envio. Arquivos que não forem PDF são ignorados e listados.
              </p>
            </div>

            {picked.length > 0 && (
              <div>
                <SectionLabel>
                  {plural(picked.length, 'arquivo escolhido', 'arquivos escolhidos')} · {bytes(totalSize)}
                </SectionLabel>
                <ul className="scroll-slim mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {picked.slice(0, 200).map((p) => (
                    <li key={p.path} className="flex items-center gap-2 text-[12px] text-foreground/80">
                      {/\.zip$/i.test(p.path) ? <FileArchive className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />}
                      <span className="min-w-0 flex-1 truncate" title={p.path}>
                        {shortPath(p.path)}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{bytes(p.file.size)}</span>
                    </li>
                  ))}
                  {picked.length > 200 && <li className="text-[12px] text-muted-foreground">… e mais {picked.length - 200}</li>}
                </ul>
              </div>
            )}

            {step === 'uploading' && progress && (
              <div className="space-y-1.5" aria-live="polite">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${Math.round((progress.loaded / progress.total) * 100)}%` }} />
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Enviando {bytes(progress.loaded)} de {bytes(progress.total)}…
                </p>
              </div>
            )}
          </>
        )}

        {step === 'review' && batch && <NothingFound batch={batch} />}
        {step === 'running' && batch && <RunningStep batch={batch} onOpen={(id) => (onClose(), navigate(paths.calendar(id)))} />}
      </div>
    </Modal>
  );
}

function NothingFound({ batch }: { batch: ImportBatch }) {
  return (
    <>
      <Callout tone="warn" title="Nenhum PDF encontrado">
        Nada do que foi escolhido é um PDF. Confira os arquivos e tente de novo.
      </Callout>
      <ul className="space-y-1.5">
        {batch.ignored.map((i, n) => (
          <li key={n} className="text-[12px]">
            <span className="block truncate text-foreground/80">{shortPath(i.path)}</span>
            <span className="text-muted-foreground">{i.reason}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function RunningStep({ batch, onOpen }: { batch: ImportBatch; onOpen: (calendarId: string) => void }) {
  const items = batch.items;
  const done = items.filter((i) => ['needs_review', 'ready', 'error', 'skipped'].includes(i.status)).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const repeated = items.filter((i) => i.groupLeaderId).length;
  const already = items.filter((i) => i.status === 'skipped').length;
  return (
    <>
      {(repeated > 0 || already > 0 || batch.ignored.length > 0) && (
        <p className="rounded-lg bg-muted p-3.5 text-[12px] leading-relaxed text-foreground/80">
          {[
            repeated > 0 && `${plural(repeated, 'arquivo era cópia de outro e foi juntado', 'arquivos eram cópias de outros e foram juntados')}`,
            already > 0 && `${plural(already, 'arquivo já estava no sistema e não foi importado de novo', 'arquivos já estavam no sistema e não foram importados de novo')}`,
            batch.ignored.length > 0 && `${plural(batch.ignored.length, 'arquivo não era PDF e foi deixado de lado', 'arquivos não eram PDF e foram deixados de lado')}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          .
        </p>
      )}
      <div className="space-y-1.5" aria-live="polite">
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="font-medium text-foreground">
            <span className="font-mono">{done}</span> de <span className="font-mono">{items.length}</span> concluídos
          </span>
          <span className="font-mono text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[12px] text-muted-foreground">Cada calendário aparece assim que termina de ser lido. Pode fechar esta janela: a leitura continua.</p>
      </div>

      <ul className="divide-y divide-border">
        {items.map((i) => {
          const st = IMPORT_STATUS[i.status];
          return (
            <li key={i.id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-foreground" title={i.relativePath}>
                  {shortPath(i.relativePath)}
                </p>
                {i.groupLeaderId && <p className="text-[11px] text-muted-foreground">Cópia de outro arquivo — juntado no mesmo calendário.</p>}
                {i.error && <p className={`text-[12px] ${i.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{i.status === 'skipped' ? 'Já está no sistema — nada foi alterado.' : i.error}</p>}

              </div>
              <div className="flex shrink-0 items-center gap-3">
                {i.calendarId && (i.status === 'needs_review' || i.status === 'ready') && <span className="text-[12px] text-muted-foreground">{plural(i.eventCount, 'evento', 'eventos')}</span>}
                <span className="inline-flex items-center gap-1.5">
                  {i.status === 'reading' && <Loader2 className="spin h-3.5 w-3.5 text-muted-foreground" />}
                  {i.status === 'ready' && <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />}
                  <Pill tone={st.tone} solid={i.status === 'error'} dot={i.status !== 'reading' && i.status !== 'ready'}>
                    {st.label}
                  </Pill>
                </span>
                {i.calendarId && !i.groupLeaderId && (i.status === 'needs_review' || i.status === 'ready') && <LinkButton onClick={() => onOpen(i.calendarId!)}>Abrir</LinkButton>}
                {i.status === 'skipped' && i.alreadyImportedAs && <LinkButton onClick={() => onOpen(i.alreadyImportedAs!.calendarId)}>Abrir</LinkButton>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
