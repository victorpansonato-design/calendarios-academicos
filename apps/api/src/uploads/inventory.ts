import crypto from 'node:crypto';
import { unzipSync } from 'fflate';
import type { IgnoredEntry } from '@calendarios/core';
import { isPdfSignature } from '../pdf/reader';

/* ==========================================================================
   Inventário de um envio
   --------------------------------------------------------------------------
   Recebe o que a pessoa escolheu (PDFs soltos, uma pasta, ZIPs) e devolve a
   lista de PDFs encontrados, com caminho relativo e hash — e a lista do que
   foi ignorado, com o motivo. Nada é importado aqui.

   Proteções:
     · o tipo é decidido pela ASSINATURA do arquivo (%PDF-, PK), nunca pela
       extensão: um .exe renomeado para .pdf é recusado;
     · caminhos dentro do ZIP são normalizados; absolutos, com "..", com letra
       de unidade ou com caracteres de controle são recusados. E, de qualquer
       forma, nenhum caminho vira caminho em disco (ver storage.ts);
     · limite de entradas e de tamanho descompactado (ZIP-bomba), checado
       ANTES de descompactar, pelos tamanhos declarados no índice do ZIP;
     · ZIP dentro de ZIP não é aberto;
     · ZIP corrompido ou criptografado vira um item ignorado, não um erro 500.
   ========================================================================== */

export interface IncomingFile {
  /** Caminho relativo como o navegador informou ("Pasta/Sub/arquivo.pdf"). */
  path: string;
  data: Buffer;
}

export interface InventoryEntry {
  path: string;
  data: Buffer;
  sha256: string;
  size: number;
}

export interface Inventory {
  pdfs: InventoryEntry[];
  ignored: IgnoredEntry[];
}

export interface InventoryLimits {
  maxFileBytes: number;
  maxZipEntries: number;
  maxUnzippedBytes: number;
}

const CP437 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

function decodeCp437(bytes: Uint8Array): string {
  return [...bytes].map((b) => (b < 128 ? String.fromCharCode(b) : CP437[b - 128])).join('');
}

/** Nome sem a marca UTF-8: muitos compactadores gravam UTF-8 mesmo assim; o resto é CP437 (padrão do ZIP). */
export function decodeLegacyName(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return decodeCp437(bytes);
  }
}

/** Compatibilidade: recupera um nome que foi lido como latin1. */
export function fixZipName(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  return decodeLegacyName(Buffer.from(name, 'latin1'));
}

/**
 * Lê o índice central do ZIP para saber, entrada por entrada, se o nome está
 * marcado como UTF-8 (bit 11). O fflate decodifica nomes sem a marca como
 * latin1; aqui cada nome do fflate é mapeado para o nome correto.
 */
export function zipNameMap(buf: Uint8Array): Map<string, string> {
  const map = new Map<string, string>();
  const u16 = (o: number) => buf[o] | (buf[o + 1] << 8);
  const u32 = (o: number) => (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return map;
  let off = u32(eocd + 16);
  const count = u16(eocd + 10);
  if (off === 0xffffffff) return map; // ZIP64: mantém os nomes do fflate
  const latin1 = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8');
  for (let n = 0; n < count && off + 46 <= buf.length && u32(off) === 0x02014b50; n += 1) {
    const flags = u16(off + 8);
    const nameLen = u16(off + 28);
    const bytes = buf.subarray(off + 46, off + 46 + nameLen);
    const isUtf8 = (flags & 0x800) !== 0;
    const fflateName = isUtf8 ? utf8.decode(bytes) : latin1.decode(bytes);
    map.set(fflateName, isUtf8 ? fflateName : decodeLegacyName(bytes));
    off += 46 + nameLen + u16(off + 30) + u16(off + 32);
  }
  return map;
}

/** Normaliza um caminho relativo. Devolve null se ele for perigoso. */
export function safeRelativePath(raw: string): string | null {
  if (/[\u0000-\u001f]/.test(raw)) return null;
  const unified = raw.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[a-zA-Z]:/.test(unified)) return null;
  const parts = unified.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.some((p) => p === '..')) return null;
  if (!parts.length) return null;
  return parts.join('/');
}

function isZip(buf: Uint8Array): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 3 || buf[2] === 5) && (buf[3] === 4 || buf[3] === 6);
}

/** Ruído de sistema que nem vale listar como ignorado. */
function isSystemJunk(path: string): boolean {
  const base = path.split('/').pop() ?? '';
  return path.includes('__MACOSX/') || base === '.DS_Store' || base === 'Thumbs.db' || base === 'desktop.ini' || base.startsWith('._');
}

export function sha256(data: Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function buildInventory(files: IncomingFile[], limits: InventoryLimits): Inventory {
  const pdfs: InventoryEntry[] = [];
  const ignored: IgnoredEntry[] = [];

  const acceptPdf = (path: string, data: Buffer) => {
    if (data.length > limits.maxFileBytes) {
      ignored.push({ path, reason: `Maior que o limite de ${Math.round(limits.maxFileBytes / 1048576)} MB por arquivo.` });
      return;
    }
    if (data.length === 0) {
      ignored.push({ path, reason: 'Arquivo vazio.' });
      return;
    }
    pdfs.push({ path, data, sha256: sha256(data), size: data.length });
  };

  for (const file of files) {
    const path = safeRelativePath(file.path);
    if (!path) {
      ignored.push({ path: file.path, reason: 'Caminho inválido.' });
      continue;
    }
    if (isSystemJunk(path)) continue;

    if (isPdfSignature(file.data)) {
      acceptPdf(path, file.data);
      continue;
    }

    if (isZip(file.data)) {
      expandZip(path, file.data, limits, acceptPdf, ignored);
      continue;
    }

    ignored.push({
      path,
      reason: /\.pdf$/i.test(path) ? 'Tem extensão .pdf, mas o conteúdo não é um PDF.' : 'Não é um PDF.',
    });
  }

  return { pdfs, ignored };
}

function expandZip(
  zipPath: string,
  data: Buffer,
  limits: InventoryLimits,
  acceptPdf: (path: string, data: Buffer) => void,
  ignored: IgnoredEntry[],
) {
  let entries = 0;
  let declared = 0;
  let overLimit: string | null = null;
  const wanted = new Map<string, string>(); // nome original → caminho seguro
  const names = zipNameMap(data);

  try {
    // 1ª passada: só lê o índice e decide, sem descompactar nada
    unzipSync(data, {
      filter: (f) => {
        if (f.name.endsWith('/')) return false;
        entries += 1;
        declared += f.originalSize;
        if (entries > limits.maxZipEntries) overLimit = `O ZIP tem mais de ${limits.maxZipEntries} arquivos.`;
        if (declared > limits.maxUnzippedBytes) overLimit = `O ZIP descompactado passaria de ${Math.round(limits.maxUnzippedBytes / 1048576)} MB.`;
        const fixed = names.get(f.name) ?? f.name;
        const safe = safeRelativePath(fixed);
        const shown = `${zipPath} › ${fixed}`;
        if (!safe) ignored.push({ path: shown, reason: 'Caminho perigoso dentro do ZIP (absoluto ou com "..").' });
        else if (isSystemJunk(safe)) {
          /* ruído do sistema operacional */
        } else if (/\.zip$/i.test(safe)) ignored.push({ path: shown, reason: 'ZIP dentro de ZIP não é aberto. Envie-o separadamente.' });
        else if (f.originalSize > limits.maxFileBytes)
          ignored.push({ path: shown, reason: `Maior que o limite de ${Math.round(limits.maxFileBytes / 1048576)} MB por arquivo.` });
        else wanted.set(f.name, safe);
        return false;
      },
    });
  } catch (err) {
    ignored.push({ path: zipPath, reason: `ZIP inválido ou corrompido (${(err as Error).message}).` });
    return;
  }

  if (overLimit) {
    ignored.push({ path: zipPath, reason: overLimit });
    return;
  }

  let out: Record<string, Uint8Array>;
  try {
    out = unzipSync(data, { filter: (f) => wanted.has(f.name) });
  } catch (err) {
    ignored.push({ path: zipPath, reason: `Não foi possível descompactar o ZIP (${(err as Error).message}).` });
    return;
  }

  const zipBase = zipPath.replace(/\.zip$/i, '');
  for (const [name, bytes] of Object.entries(out)) {
    const safe = wanted.get(name)!;
    const full = `${zipBase}/${safe}`;
    const buf = Buffer.from(bytes);
    if (isPdfSignature(buf)) acceptPdf(full, buf);
    else ignored.push({ path: `${zipPath} › ${safe}`, reason: /\.pdf$/i.test(safe) ? 'Tem extensão .pdf, mas o conteúdo não é um PDF.' : 'Não é um PDF.' });
  }
}
