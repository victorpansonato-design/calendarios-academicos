# Calendários acadêmicos · UniAnchieta

Sistema para a equipe acadêmica **adicionar calendários em PDF → escolher os avisos → publicar**, e para gerir as comunicações com os alunos (avisos dos calendários, envios adicionais e mensagens por acontecimento na vida acadêmica).

- Leitura real dos PDFs (texto, posição, links, cores da grade e da legenda), sem publicação automática.
- Calendário em 4 abas: Calendário (igual à página 1 do PDF), Mês a mês, Eventos (edição e aviso em lote) e Informações (dados, cores e histórico restaurável).
- Avisos por importância (baixa / média / alta), agenda com idempotência e registro de execução.
- Contratos prontos para a TI ligar SSO, portal/app, Lyceum, push e e-mail.

## Como rodar

Requisitos: **Node.js 22.13+** (usa o SQLite embutido do Node; nada para compilar).

```bash
npm install
cp .env.example .env      # opcional; sem .env tudo funciona em modo local
npm run dev               # API em :3001 e interface em :3000
```

Abra http://localhost:3000 e clique em **Entrar com a conta Microsoft** (em `AUTH_MODE=dev` entra direto, sem Outlook).

Para testar o fluxo de envios sem mandar nada a ninguém, use `DEMO_MODE=true` no `.env`: os envios ficam registrados como **Simulado (demonstração)**.

| Comando | O que faz |
|---|---|
| `npm run dev` | API + interface com recarga automática |
| `npm test` | 87 testes (núcleo, extração com o PDF real, uploads, fluxo ponta a ponta, acontecimentos) |
| `npm run lint` | checagem de tipos dos três pacotes |
| `npm run build` | lint + build de produção da interface (`apps/web/dist`) |
| `npm start` | API em produção; serve também a interface compilada na mesma porta |
| `npm run worker -w @calendarios/api` | fila de importação + agendador num processo separado (com `RUN_WORKERS=false` na API) |
| `npx tsx apps/api/scripts/extract.ts arquivo.pdf` | mostra o que o extrator entende de um PDF, sem banco |
| `npx tsx apps/api/scripts/extract-all.ts pasta/` | resume a leitura de todos os PDFs de uma pasta |

Dados locais ficam em `data/` (banco `calendarios.sqlite` e PDFs originais em `data/files/`). Para zerar, pare os servidores e apague a pasta.

## Variáveis de ambiente

Todas estão comentadas em [.env.example](.env.example). Sem uma credencial, a função aparece na interface como **aguardando configuração** — nada é simulado em silêncio.

| Variável | Para quê | Sem ela |
|---|---|---|
| `AUTH_MODE` | `dev` (entra direto) ou `entra` (Microsoft Entra ID, a implementar pela TI) | `dev` |
| `DEMO_MODE` | envios simulados e marcados como demonstração | envios sem gateway ficam "Aguardando configuração" |
| `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MODEL` | OCR/leitura visual de páginas digitalizadas | página sem texto vira pendência bloqueante; PDFs com texto são lidos normalmente |
| `PUSH_WEBHOOK_URL`, `PUSH_WEBHOOK_TOKEN` | gateway de push da TI | envios de push ficam "Aguardando configuração" |
| `EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_TOKEN` | gateway de e-mail da TI | idem, para e-mail |
| `INTEGRATION_API_KEY` | chave dos sistemas institucionais (acontecimentos, preferências) | endpoint de integração responde 503 |
| `PUBLIC_API_KEY` | protege a leitura pública (portal/app) | leitura pública aberta |
| `MAX_FILE_MB`, `MAX_BATCH_MB`, `MAX_ZIP_ENTRIES`, `MAX_UNZIPPED_MB` | limites de upload | 25 / 300 / 500 / 600 |

## Estrutura

```
packages/core     Domínio puro, sem I/O: tipos e contratos, datas, campos, validação,
                  agenda de avisos, modelos de mensagem, permissões, acontecimentos.
apps/api          Fastify + SQLite (node:sqlite). Leitura de PDF, fila de importação,
                  agendador, rotas HTTP, integrações.
apps/web          React 19 + Vite 6 + Tailwind 4 + motion + lucide (design system UniAnchieta).
docs/             Arquitetura, contratos de API, integração com a TI, extração.
```

Leia na ordem: [docs/ARQUITETURA.md](docs/ARQUITETURA.md) → [docs/API.md](docs/API.md) → [docs/INTEGRACAO_TI.md](docs/INTEGRACAO_TI.md) → [docs/EXTRACAO.md](docs/EXTRACAO.md).
