import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../services/context';
import { need } from './auth';
import * as svc from '../services/imports';
import { listRecentBatches } from '../repositories/imports';
import { badRequest, HttpError } from '../services/errors';
import type { IncomingFile } from '../uploads/inventory';

/* ==========================================================================
   Upload e importação
   --------------------------------------------------------------------------
   O navegador envia multipart com:
     · um campo `manifest` (JSON) ANTES dos arquivos: [{ field, path }], onde
       `path` é o caminho relativo (pasta selecionada ou arrastada);
     · cada arquivo no campo indicado por `field` ("f0", "f1"…).
   Assim o caminho relativo chega intacto, sem depender do nome do arquivo
   no multipart (que alguns navegadores cortam na última barra).
   ========================================================================== */

export function registerImportRoutes(app: FastifyInstance, ctx: AppContext) {
  const maxBatch = ctx.config.uploads.maxBatchMb * 1048576;

  app.post('/api/imports', async (req) => {
    const user = need(req, 'calendar.import');
    if (!req.isMultipart()) throw badRequest('Envie os arquivos como multipart/form-data.');

    let manifest: { field: string; path: string }[] = [];
    const files: IncomingFile[] = [];
    let total = 0;

    for await (const part of req.parts({ limits: { fileSize: maxBatch, files: 2000 } })) {
      if (part.type === 'field') {
        if (part.fieldname === 'manifest') {
          try {
            manifest = JSON.parse(String(part.value));
          } catch {
            throw badRequest('Manifesto do envio inválido.');
          }
        }
        continue;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        total += chunk.length;
        if (total > maxBatch) throw new HttpError(413, `O envio passou do limite de ${ctx.config.uploads.maxBatchMb} MB. Envie em partes.`);
        chunks.push(chunk as Buffer);
      }
      if (part.file.truncated) throw new HttpError(413, `Um arquivo passou do limite de ${ctx.config.uploads.maxBatchMb} MB.`);
      const path = manifest.find((m) => m.field === part.fieldname)?.path ?? part.filename ?? part.fieldname;
      files.push({ path, data: Buffer.concat(chunks) });
    }
    if (!files.length) throw badRequest('Nenhum arquivo recebido.');
    return svc.stage(ctx, files, user);
  });

  app.get('/api/imports', async (req) => {
    need(req, 'calendar.read');
    return { items: listRecentBatches(ctx.db, 10) };
  });

  app.get<{ Params: { id: string } }>('/api/imports/:id', async (req) => {
    need(req, 'calendar.read');
    return svc.getBatch(ctx, req.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/imports/:id/start', async (req) => {
    const user = need(req, 'calendar.import');
    const b = (req.body ?? {}) as { mergeIdentical?: boolean; forceItemIds?: string[] };
    return svc.start(ctx, req.params.id, { mergeIdentical: b.mergeIdentical !== false, forceItemIds: Array.isArray(b.forceItemIds) ? b.forceItemIds.map(String) : [] }, user);
  });

  app.post<{ Params: { id: string } }>('/api/imports/:id/retry', async (req) => {
    const user = need(req, 'calendar.import');
    const b = (req.body ?? {}) as { itemIds?: string[] };
    return svc.retry(ctx, req.params.id, Array.isArray(b.itemIds) ? b.itemIds.map(String) : undefined, user);
  });
}
