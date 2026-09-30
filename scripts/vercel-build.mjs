/* Build da demonstração na Vercel: interface + API no mesmo projeto.
   Roda depois do `vite build` (apps/web/dist) e monta .vercel/output
   (Build Output API): arquivos estáticos + uma função com a API empacotada.
   O banco fica em /tmp: serve para mostrar o sistema, não para guardar dados. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'apps/web/.vercel/output');
const func = path.join(out, 'functions/api.func');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(func, { recursive: true });
fs.cpSync(path.join(root, 'apps/web/dist'), path.join(out, 'static'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'apps/api/server.ts')],
  outfile: path.join(func, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // pdfjs carrega o próprio worker em tempo de execução: vai inteiro, fora do pacote.
  external: ['pdfjs-dist'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
fs.cpSync(path.join(root, 'node_modules/pdfjs-dist'), path.join(func, 'node_modules/pdfjs-dist'), { recursive: true });
// Calendário de exemplo que a demonstração já abre carregado (o mesmo PDF dos testes).
fs.mkdirSync(path.join(func, 'seed'));
fs.copyFileSync(path.join(root, 'apps/api/test/fixtures/calendario_presencial_2026_2.pdf'), path.join(func, 'seed/calendario_presencial_2026_2.pdf'));
fs.writeFileSync(path.join(func, 'package.json'), JSON.stringify({ type: 'module' }));
fs.writeFileSync(
  path.join(func, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }, null, 2),
);

fs.writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(?:/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '/.*', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('vercel-build: .vercel/output pronto (interface + API)');
