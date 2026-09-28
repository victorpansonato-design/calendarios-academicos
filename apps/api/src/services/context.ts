import type { Channel } from '@calendarios/core';
import type { Config } from '../config';
import type { Database } from '../db/database';
import type { FileStorage } from '../storage';
import type { OcrProvider } from '../pdf/ocr';
import type { ChannelProvider } from './providers';

/** Tudo o que um serviço precisa. Montado uma vez em app.ts; nos testes, com banco em memória. */
export interface AppContext {
  config: Config;
  db: Database;
  storage: FileStorage;
  ocr: OcrProvider | null;
  providers: Record<Channel, ChannelProvider>;
  /** Relógio injetável — os testes de agenda controlam o "agora". */
  now: () => Date;
  /** Acorda a fila de importação (definido pelo worker). */
  kickImports: () => void;
}
