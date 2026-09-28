import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildInventory, fixZipName, safeRelativePath } from '../src/uploads/inventory';

const limits = { maxFileBytes: 1024 * 1024, maxZipEntries: 50, maxUnzippedBytes: 5 * 1024 * 1024 };
const pdf = (text: string) => Buffer.from(`%PDF-1.7\n${text}\n%%EOF`);

describe('inventário do envio', () => {
  it('decide o tipo pela assinatura, não pela extensão', () => {
    const inv = buildInventory(
      [
        { path: 'a.pdf', data: pdf('a') },
        { path: 'falso.pdf', data: Buffer.from('MZ executável') },
        { path: 'foto.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      ],
      limits,
    );
    expect(inv.pdfs.map((p) => p.path)).toEqual(['a.pdf']);
    expect(inv.ignored).toEqual([
      { path: 'falso.pdf', reason: 'Tem extensão .pdf, mas o conteúdo não é um PDF.' },
      { path: 'foto.png', reason: 'Não é um PDF.' },
    ]);
  });

  it('preserva caminhos relativos de pasta e de ZIP com subpastas', () => {
    const zip = Buffer.from(
      zipSync({
        'Calendários/Presenciais/Presencial.pdf': pdf('p'),
        'Calendários/Híbridos/Direito/Direito Veteranos.pdf': pdf('d'),
        'Calendários/leia-me.txt': strToU8('texto'),
      }),
    );
    const inv = buildInventory([{ path: 'lote.zip', data: zip }, { path: 'Pasta/Sub/x.pdf', data: pdf('x') }], limits);
    expect(inv.pdfs.map((p) => p.path).sort()).toEqual(['Pasta/Sub/x.pdf', 'lote/Calendários/Híbridos/Direito/Direito Veteranos.pdf', 'lote/Calendários/Presenciais/Presencial.pdf']);
    expect(inv.ignored).toEqual([{ path: 'lote.zip › Calendários/leia-me.txt', reason: 'Não é um PDF.' }]);
  });

  it('detecta conteúdo idêntico pelo hash', () => {
    const inv = buildInventory([{ path: 'A/v.pdf', data: pdf('igual') }, { path: 'B/v.pdf', data: pdf('igual') }, { path: 'C/w.pdf', data: pdf('outro') }], limits);
    expect(inv.pdfs[0].sha256).toBe(inv.pdfs[1].sha256);
    expect(inv.pdfs[0].sha256).not.toBe(inv.pdfs[2].sha256);
  });

  it('recusa caminhos perigosos', () => {
    expect(safeRelativePath('../../etc/passwd')).toBeNull();
    expect(safeRelativePath('/abs/file.pdf')).toBeNull();
    expect(safeRelativePath('C:\\Windows\\x.pdf')).toBeNull();
    expect(safeRelativePath('a/./b\\c.pdf')).toBe('a/b/c.pdf');
    const evil = Buffer.from(zipSync({ '../fora.pdf': pdf('x'), 'ok/dentro.pdf': pdf('y') }));
    const inv = buildInventory([{ path: 'x.zip', data: evil }], limits);
    expect(inv.pdfs.map((p) => p.path)).toEqual(['x/ok/dentro.pdf']);
    expect(inv.ignored[0].reason).toMatch(/Caminho perigoso/);
  });

  it('ZIP inválido vira item ignorado, não erro', () => {
    const inv = buildInventory([{ path: 'quebrado.zip', data: Buffer.from('PK\u0003\u0004 lixo lixo lixo') }], limits);
    expect(inv.pdfs).toEqual([]);
    expect(inv.ignored[0]).toMatchObject({ path: 'quebrado.zip' });
    expect(inv.ignored[0].reason).toMatch(/ZIP inválido/);
  });

  it('ZIP-bomba é barrado pelo tamanho declarado, antes de descompactar', () => {
    const big = new Uint8Array(6 * 1024 * 1024); // comprime para quase nada
    const zip = Buffer.from(zipSync({ 'a.pdf': big }));
    const inv = buildInventory([{ path: 'bomba.zip', data: zip }], { ...limits, maxFileBytes: 10 * 1024 * 1024 });
    expect(inv.pdfs).toEqual([]);
    expect(inv.ignored[0].reason).toMatch(/descompactado passaria/);
  });

  it('não abre ZIP dentro de ZIP', () => {
    const inner = zipSync({ 'x.pdf': pdf('x') });
    const outer = Buffer.from(zipSync({ 'dentro.zip': inner }));
    const inv = buildInventory([{ path: 'fora.zip', data: outer }], limits);
    expect(inv.ignored[0].reason).toMatch(/ZIP dentro de ZIP/);
  });

  it('recupera nomes com acento de ZIPs sem a marca UTF-8', () => {
    expect(fixZipName(Buffer.from('Calendários', 'utf8').toString('latin1'))).toBe('Calendários');
    expect(fixZipName(Buffer.from([0x48, 0xa1, 0x62]).toString('latin1'))).toBe('Híb'); // CP437 0xA1 = í
  });
});
