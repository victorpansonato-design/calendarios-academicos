/* Sobe a API (:3001) e a interface (:3000) juntas, com saída prefixada.
   Ctrl+C encerra as duas. */
import { spawn, spawnSync } from 'node:child_process';

const procs = [
  { name: 'api', color: '\x1b[36m', args: ['run', 'dev', '-w', '@calendarios/api'] },
  { name: 'web', color: '\x1b[35m', args: ['run', 'dev', '-w', '@calendarios/web'] },
].map(({ name, color, args }) => {
  const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const out = (chunk) => chunk.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`${color}[${name}]\x1b[0m ${l}`));
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  p.on('exit', (code) => console.log(`${color}[${name}]\x1b[0m encerrado (${code})`));
  return p;
});

// No Windows, o npm roda dentro de um shell: matar só o shell deixaria a API e o
// Vite de pé, segurando as portas e o banco. Encerra a árvore inteira.
const stop = () => {
  for (const p of procs) {
    if (process.platform === 'win32' && p.pid) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else p.kill();
  }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);
