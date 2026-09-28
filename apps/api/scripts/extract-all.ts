/* Uso: npx tsx scripts/extract-all.ts pasta/
   Roda a leitura em todos os PDFs de uma pasta e resume o resultado. */
import fs from 'node:fs';
import path from 'node:path';
import { extractCalendar } from '../src/pdf/pipeline';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.toLowerCase().endsWith('.pdf') ? [path.join(dir, d.name)] : []));
}
const root = process.argv[2];
for (const file of walk(root)) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  try {
    const out = await extractCalendar({ data: new Uint8Array(fs.readFileSync(file)), fileId: 'x', relativePath: rel, ocr: null });
    const codes = new Map<string, number>();
    for (const e of out.events) for (const i of e.issues) codes.set(i.code, (codes.get(i.code) ?? 0) + 1);
    for (const i of out.calendarIssues) codes.set('cal:' + i.code, (codes.get('cal:' + i.code) ?? 0) + 1);
    const r = out.report;
    console.log(`${rel.slice(-60).padEnd(60)} | ${out.year}/${out.semester} ${out.scope.modality.padEnd(10)} | ev ${r.eventsFound} rows ${r.rowsFound} merged ${r.mergedAcrossPages} pend.datas ${r.datesPending} notas ${out.notes.length} leg ${out.legend.length} | ${[...codes].map(([k, v]) => `${k}:${v}`).join(' ')}`);
    console.log(`   "${out.title}" ${JSON.stringify(out.scope.courses)} ${JSON.stringify(out.scope.exceptions)} strategies=${[...new Set(r.pages.map((p) => p.rowStrategy))].join(',')}`);
  } catch (err) {
    console.log(`${rel} ERRO ${(err as Error).stack}`);
  }
}
