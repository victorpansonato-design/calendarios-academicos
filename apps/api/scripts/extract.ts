/* Uso: npx tsx scripts/extract.ts caminho/do.pdf [--json]
   Roda a cadeia de leitura sem banco e imprime o que foi entendido. Útil para
   depurar um PDF novo antes de importar pela interface. */
import fs from 'node:fs';
import { extractCalendar } from '../src/pdf/pipeline';

const file = process.argv[2];
if (!file) {
  console.error('Uso: npx tsx scripts/extract.ts arquivo.pdf [--json]');
  process.exit(1);
}
const out = await extractCalendar({ data: new Uint8Array(fs.readFileSync(file)), fileId: 'local', relativePath: file.replace(/\\/g, '/'), ocr: null });
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`${out.title} · ${out.year} · ${out.semester}º semestre`, JSON.stringify(out.scope));
  console.log('Legenda:', out.legend.map((l) => `${l.color} ${l.label}`).join('\n         '));
  for (const e of out.events) {
    const d = e.dates ? `${e.dates.kind}:${e.dates.start}${e.dates.kind !== 'single' ? '..' + e.dates.end : ''}${e.dates.kind === 'list' ? ' [' + e.dates.dates.join(',') + ']' : ''}` : 'PENDENTE';
    console.log(`\n[${e.label}] ${d} p.${e.sources.map((s) => s.page).join('+')} ${e.category ?? '-'}`);
    console.log(`  título: ${e.fields.title}`);
    if (e.fields.times.length) console.log(`  horários: ${e.fields.times.map((t) => `${t.shift ?? ''} ${t.time}`).join(' | ')}`);
    if (e.fields.location) console.log(`  local: ${e.fields.location}`);
    if (e.fields.urls.length) console.log(`  links: ${e.fields.urls.join(' ')}`);
    if (e.fields.notes.length) console.log(`  ressalvas: ${e.fields.notes.join(' / ')}`);
    if (e.issues.length) console.log(`  pendências: ${e.issues.map((i) => i.code).join(', ')}`);
  }
  console.log('\nObservações:', out.notes.map((n) => n.text));
  console.log('Pendências do calendário:', out.calendarIssues.map((i) => `${i.code}: ${i.message}`));
  const { gridDays, pages, pdfMetadata, ...r } = out.report;
  console.log('Relatório:', r);
}
