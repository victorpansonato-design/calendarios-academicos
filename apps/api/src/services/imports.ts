import crypto from 'node:crypto';
import type { ImportBatch, ImportItem, ImportStartOptions, ReviewIssue, User } from '@calendarios/core';
import { openCalendarIssues, openEventIssues } from '@calendarios/core';
import type { AppContext } from './context';
import { badRequest, conflict, notFound } from './errors';
import { buildInventory, type IncomingFile } from '../uploads/inventory';
import * as files from '../repositories/files';
import * as imports from '../repositories/imports';
import * as calendars from '../repositories/calendars';
import { findCalendarsBySourceFile } from '../repositories/calendars';
import { recordAudit } from '../repositories/audit';
import { extractCalendar } from '../pdf/pipeline';
import { createFromExtraction } from './calendars';

/* ==========================================================================
   Importação em lote
   --------------------------------------------------------------------------
   1. `stage`   — recebe os arquivos, faz o inventário (PDFs, ignorados,
                  repetidos), guarda os PDFs e devolve a contagem ANTES de ler.
   2. `start`   — a pessoa decide o que fazer com os repetidos e confirma.
   3. worker    — processa a fila, poucos por vez; cada arquivo vira um
                  calendário em Rascunho. Os primeiros resultados aparecem
                  assim que ficam prontos. Uma falha não derruba os outros.
   4. `retry`   — só os itens com erro voltam para a fila.

   Arquivos idênticos (mesmo hash) em pastas diferentes: com
   `mergeIdentical`, viram UM calendário, com os cursos sugeridos pelas
   pastas; sem, cada um vira o seu. Arquivo que já existia no sistema não é
   reimportado, a menos que a pessoa peça — e mesmo assim nunca sobrescreve.
   ========================================================================== */

export async function stage(ctx: AppContext, incoming: IncomingFile[], actor: User): Promise<ImportBatch> {
  const limits = ctx.config.uploads;
  const inventory = buildInventory(incoming, {
    maxFileBytes: limits.maxFileMb * 1048576,
    maxZipEntries: limits.maxZipEntries,
    maxUnzippedBytes: limits.maxUnzippedMb * 1048576,
  });

  const batchId = crypto.randomUUID();
  const byHash = new Map<string, string[]>();
  for (const p of inventory.pdfs) byHash.set(p.sha256, [...(byHash.get(p.sha256) ?? []), p.path]);

  // grava os arquivos primeiro (fora da transação: I/O de disco)
  const stored = new Map<string, files.StoredFile>();
  for (const p of inventory.pdfs) {
    if (stored.has(p.sha256)) continue;
    let f = files.findFileByHash(ctx.db, p.sha256);
    const key = `${p.sha256}.pdf`;
    if (!(await ctx.storage.exists(key))) await ctx.storage.put(key, p.data);
    if (!f) f = files.insertFile(ctx.db, { sha256: p.sha256, size: p.size, originalName: p.path.split('/').pop()!, storageKey: key, createdBy: actor.name });
    stored.set(p.sha256, f);
  }

  ctx.db.tx(() => {
    imports.insertBatch(ctx.db, batchId, actor.name, inventory.ignored);
    inventory.pdfs.forEach((p, i) => {
      const file = stored.get(p.sha256)!;
      const existing = findCalendarsBySourceFile(ctx.db, file.id)[0] ?? null;
      imports.insertItem(ctx.db, {
        id: crypto.randomUUID(),
        batchId,
        relativePath: p.path,
        fileId: file.id,
        sha256: p.sha256,
        size: p.size,
        sameContentAs: byHash.get(p.sha256)!.filter((x) => x !== p.path),
        alreadyImportedAs: existing ? { calendarId: existing.id, title: existing.title } : null,
        sort: i,
      });
    });
    recordAudit(ctx.db, {
      actor: actor.name,
      action: 'import.stage',
      entity: 'import',
      entityId: batchId,
      summary: `${inventory.pdfs.length} PDF(s) recebidos, ${inventory.ignored.length} ignorado(s).`,
    });
  });
  return getBatch(ctx, batchId);
}

function enrich(ctx: AppContext) {
  return (item: ImportItem): ImportItem => {
    if (!item.calendarId) return item;
    const cal = calendars.getCalendar(ctx.db, item.calendarId);
    if (!cal) return item;
    return { ...item, eventCount: cal.eventCount, pendingCount: cal.pendingCount };
  };
}

export function getBatch(ctx: AppContext, id: string): ImportBatch {
  const b = imports.getBatch(ctx.db, id, enrich(ctx));
  if (!b) throw notFound('Importação');
  return b;
}

export function start(ctx: AppContext, batchId: string, options: ImportStartOptions, actor: User): ImportBatch {
  ctx.db.tx(() => {
    const batch = imports.getBatch(ctx.db, batchId);
    if (!batch) throw notFound('Importação');
    if (batch.status !== 'staged') throw conflict('Esta importação já foi iniciada.');
    const force = new Set(options.forceItemIds ?? []);
    const leaders = new Map<string, string>(); // hash → id do item líder

    for (const item of batch.items) {
      if (item.alreadyImportedAs && !force.has(item.id)) {
        imports.updateItem(ctx.db, item.id, { status: 'skipped', error: `Este arquivo já foi importado como "${item.alreadyImportedAs.title}". Nada foi alterado.` });
        continue;
      }
      if (options.mergeIdentical && item.sha256) {
        const leader = leaders.get(item.sha256);
        if (leader) {
          imports.updateItem(ctx.db, item.id, { status: 'queued', groupLeaderId: leader });
          continue;
        }
        leaders.set(item.sha256, item.id);
      }
      imports.updateItem(ctx.db, item.id, { status: 'queued' });
    }
    ctx.db.run("UPDATE import_batches SET status = 'running', options_json = ? WHERE id = ?", [JSON.stringify(options), batchId]);
    recordAudit(ctx.db, { actor: actor.name, action: 'import.start', entity: 'import', entityId: batchId, summary: 'Importação iniciada.', detail: options });
  });
  ctx.kickImports();
  return getBatch(ctx, batchId);
}

export function retry(ctx: AppContext, batchId: string, itemIds: string[] | undefined, actor: User): ImportBatch {
  ctx.db.tx(() => {
    const rows = imports.itemsOfBatch(ctx.db, batchId);
    if (!rows.length) throw notFound('Importação');
    const wanted = itemIds?.length ? new Set(itemIds) : null;
    const failed = rows.filter((r) => r.status === 'error' && !r.group_leader_id && (!wanted || wanted.has(r.id)));
    if (!failed.length) throw badRequest('Não há arquivos com erro para tentar de novo.');
    for (const r of failed) {
      imports.updateItem(ctx.db, r.id, { status: 'queued', error: null });
      for (const f of rows.filter((x) => x.group_leader_id === r.id)) imports.updateItem(ctx.db, f.id, { status: 'queued', error: null });
    }
    imports.setBatchStatus(ctx.db, batchId, 'running');
    recordAudit(ctx.db, { actor: actor.name, action: 'import.retry', entity: 'import', entityId: batchId, summary: `${failed.length} arquivo(s) com erro voltaram para a fila.` });
  });
  ctx.kickImports();
  return getBatch(ctx, batchId);
}

/** Pasta do arquivo como sugestão de curso ("…/Administração/Administração Veteranos.pdf"). */
function courseFromPath(path: string): string | null {
  const parts = path.split('/');
  if (parts.length < 2) return null;
  const folder = parts[parts.length - 2];
  return /calend[áa]rio|semestre|cursos|^\d{2}\s/i.test(folder) ? null : folder;
}

/** Processa um item da fila. Nunca lança: erro vira status do item. */
export async function processItem(ctx: AppContext, item: imports.ItemRow): Promise<void> {
  const actor = imports.getBatch(ctx.db, item.batch_id)?.createdBy ?? 'sistema';
  const followers = imports.itemsOfBatch(ctx.db, item.batch_id).filter((r) => r.group_leader_id === item.id);
  const finish = (patch: Parameters<typeof imports.updateItem>[2]) => {
    const at = new Date().toISOString();
    imports.updateItem(ctx.db, item.id, { ...patch, finishedAt: at });
    for (const f of followers) imports.updateItem(ctx.db, f.id, { ...patch, finishedAt: at, startedAt: item.started_at ?? at });
  };
  for (const f of followers) imports.updateItem(ctx.db, f.id, { status: 'reading', startedAt: new Date().toISOString() });

  try {
    const file = item.file_id ? files.getFile(ctx.db, item.file_id) : undefined;
    if (!file) throw new Error('Arquivo original não encontrado no armazenamento.');
    const data = await ctx.storage.get(file.storageKey);
    const out = await extractCalendar({ data: new Uint8Array(data), fileId: file.id, relativePath: item.relative_path, ocr: ctx.ocr });
    files.updateFileMeta(ctx.db, file.id, out.report.pageCount, out.report.pdfMetadata);

    const extraIssues: ReviewIssue[] = [];
    const extraCourses: string[] = [];
    if (followers.length) {
      const paths = [item.relative_path, ...followers.map((f) => f.relative_path)];
      const courses = paths.map(courseFromPath);
      // Um dos arquivos está numa pasta geral ("01 Cursos Presenciais e EAD"): o
      // calendário vale para a modalidade toda. Sugerir só os cursos das outras
      // pastas restringiria o público sem motivo.
      const general = courses.some((c) => c === null);
      const named = [...new Set(courses.filter((c): c is string => Boolean(c)))];
      if (!general) extraCourses.push(...named);

      // As sugestões por caminho do arquivo líder não valem para o grupo inteiro
      const pathFields = new Set(out.calendarIssues.filter((i) => i.code === 'courses_from_path').map((i) => i.field));
      if (pathFields.has('scope.courses') && general) out.scope.courses = out.scope.courses.filter((c) => c !== courseFromPath(item.relative_path));
      const cohortOf = (p: string) => (/ingressantes|calouros/i.test(p.split('/').pop()!) ? 'i' : /veteranos/i.test(p.split('/').pop()!) ? 'v' : '-');
      const cohortsAgree = new Set(paths.map(cohortOf)).size === 1;
      if (pathFields.has('scope.cohorts') && !cohortsAgree) out.scope.cohorts = [];
      out.calendarIssues = out.calendarIssues.filter((i) => i.code !== 'courses_from_path');
      extraIssues.push({
        code: 'courses_from_path',
        severity: 'blocker',
        field: 'scope.courses',
        message: general
          ? `O mesmo PDF foi enviado em ${paths.length} lugares, inclusive numa pasta geral. Ele virou um calendário só, sem restringir cursos. Pastas de curso onde ele também estava: ${named.join(', ') || 'nenhuma'}. Confirme o público em "Dados gerais".`
          : `O mesmo PDF foi enviado em ${paths.length} pastas. Ele virou um calendário só, com os cursos sugeridos pelos nomes das pastas: ${named.join(', ')}${out.scope.cohorts.length ? ` (público sugerido pelos nomes dos arquivos: ${out.scope.cohorts.join(', ')})` : ''}. Confirme em "Dados gerais".`,
        detail: { paths },
      });
    }

    const calendar = createFromExtraction(ctx, { out, fileId: file.id, actor, extraCourses, extraIssues });
    // "Pronto para publicar" = leitura sem pendências. A importância é decisão editorial.
    const events = calendars.listEvents(ctx.db, calendar.id);
    const readingIssues = events.flatMap((e) => openEventIssues(e)).filter((i) => i.severity === 'blocker' && i.code !== 'importance_unset' && i.code !== 'anchor_unconfirmed');
    const calendarIssues = openCalendarIssues(calendar).filter((i) => i.severity === 'blocker');
    finish({ status: readingIssues.length || calendarIssues.length ? 'needs_review' : 'ready', calendarId: calendar.id, error: null });
  } catch (err) {
    finish({ status: 'error', error: friendlyError(err) });
  }

  const remaining = imports.itemsOfBatch(ctx.db, item.batch_id).filter((r) => r.status === 'queued' || r.status === 'reading');
  if (!remaining.length) imports.setBatchStatus(ctx.db, item.batch_id, 'done');
}

function friendlyError(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err);
  if (/password|encrypt/i.test(msg)) return 'O PDF está protegido por senha e não pôde ser lido.';
  if (/Invalid PDF|FormatError|bad XRef|Missing PDF/i.test(msg)) return 'O arquivo PDF está corrompido ou incompleto.';
  return `Não foi possível ler o PDF: ${msg}`;
}

/* -- Fila ----------------------------------------------------------------- */

export function createImportWorker(ctx: AppContext) {
  let running = 0;
  const pump = () => {
    while (running < ctx.config.uploads.importConcurrency) {
      const next = imports.claimNextItem(ctx.db);
      if (!next) return;
      running += 1;
      processItem(ctx, next)
        .catch(() => undefined)
        .finally(() => {
          running -= 1;
          setImmediate(pump);
        });
    }
  };
  return {
    kick: () => setImmediate(pump),
    recover: () => {
      imports.requeueStuck(ctx.db);
      setImmediate(pump);
    },
  };
}
