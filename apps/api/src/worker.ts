/* Worker isolado: fila de importação + agendador, sem servidor HTTP.
   Use com a API rodando em RUN_WORKERS=false. */
import { loadConfig } from './config';
import { createContext } from './app';
import { startWorkers } from './workers';

const ctx = createContext(loadConfig());
startWorkers(ctx);
console.log('worker: fila de importação e agendador de envios em execução');

// A fila é acordada pela API via banco: aqui, um varredor periódico procura itens novos.
setInterval(() => ctx.kickImports(), 5000);
