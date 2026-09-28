import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';

/* ==========================================================================
   OCR e interpretação visual (páginas digitalizadas)
   --------------------------------------------------------------------------
   Só entra em ação para páginas SEM camada de texto (imagem escaneada). As
   páginas com texto selecionável são sempre lidas pela camada de texto, que é
   exata; a IA nunca "corrige" uma leitura exata.

   Contrato de fidelidade enviado ao modelo: transcrever, não resumir; data
   exatamente como impressa; nada inventado. Mesmo assim, TODO evento vindo
   daqui entra com a pendência `ocr_extracted` e só é publicado depois que uma
   pessoa confere contra o PDF.

   Configuração (variáveis de ambiente):
     AI_PROVIDER=anthropic
     ANTHROPIC_API_KEY=…
     AI_MODEL=claude-opus-5        (opcional)

   Sem configuração, a página é marcada como "aguardando OCR" e a revisão
   mostra isso — nenhuma simulação é apresentada como leitura.
   ========================================================================== */

export interface OcrRow {
  dateLabel: string;
  lines: string[];
}

export interface OcrProvider {
  name: string;
  readPage(pdf: Uint8Array, pageNumber: number): Promise<OcrRow[]>;
}

const ROW_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dateLabel: { type: 'string', description: 'A data exatamente como impressa na célula, ex.: "13, 14, 27 e 28/11".' },
          lines: { type: 'array', items: { type: 'string' }, description: 'As linhas da descrição, na ordem, transcritas literalmente.' },
        },
        required: ['dateLabel', 'lines'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = `Esta é uma página de um calendário acadêmico universitário em português.
Transcreva a tabela de datas e descrições da página.

Regras:
- Uma linha da tabela = um item em "rows". Não junte nem divida linhas da tabela.
- "dateLabel": a data exatamente como impressa (ex.: "25/08", "04 a 31/08", "28/09 a 09/10", "12 e 13/10", "13, 14, 27 e 28/11"). Não converta, não complete o ano, não transforme lista em período.
- "lines": o texto da descrição, linha por linha, literalmente. Inclua horários, locais, links, observações com asterisco e ressalvas. Não resuma, não reescreva, não traduza.
- Se um trecho estiver ilegível, escreva [ilegível] no lugar dele. Nunca invente.
- Ignore a grade de mini-calendário e o logotipo.`;

async function singlePage(pdf: Uint8Array, pageNumber: number): Promise<string> {
  const src = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(src, [pageNumber - 1]);
  out.addPage(page);
  return Buffer.from(await out.save()).toString('base64');
}

export function anthropicOcr(apiKey: string, model: string): OcrProvider {
  const client = new Anthropic({ apiKey });
  return {
    name: `anthropic:${model}`,
    async readPage(pdf, pageNumber) {
      const data = await singlePage(pdf, pageNumber);
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { format: { type: 'json_schema', schema: ROW_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
              { type: 'text', text: INSTRUCTIONS },
            ],
          },
        ],
      });
      if (response.stop_reason === 'refusal') throw new Error('O serviço de IA recusou a leitura desta página.');
      if (response.stop_reason === 'max_tokens') throw new Error('A leitura da página foi interrompida (texto longo demais).');
      const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const parsed = JSON.parse(text) as { rows: OcrRow[] };
      return parsed.rows.filter((r) => r.dateLabel.trim() || r.lines.some((l) => l.trim()));
    },
  };
}
