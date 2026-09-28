import fs from 'node:fs/promises';
import path from 'node:path';

/* ==========================================================================
   Armazenamento dos PDFs originais
   --------------------------------------------------------------------------
   Os arquivos são guardados pelo hash do conteúdo (`<sha256>.pdf`). O nome
   enviado pelo usuário nunca vira caminho em disco — isso elimina de saída
   qualquer tentativa de escrever fora da pasta (../, C:\, caminhos de ZIP).

   Para usar S3, Azure Blob ou similar, implemente `FileStorage` e troque a
   instância em app.ts. O resto do sistema só conhece a chave.
   ========================================================================== */

export interface FileStorage {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

export class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!/^[a-f0-9]{64}\.pdf$/.test(key)) throw new Error('Chave de armazenamento inválida');
    return path.join(this.root, key.slice(0, 2), key);
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
