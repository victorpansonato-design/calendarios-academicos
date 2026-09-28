# Arquitetura

## Visão geral

```
 Navegador (apps/web)                      API (apps/api)                         Fora do sistema
 ─────────────────────                     ─────────────────────                  ─────────────────
 Login ─────────────── POST /api/auth ───▶ sessões (dev | Entra ID*)
 Adicionar calendários ─ multipart ──────▶ inventário (PDF/ZIP/pasta) ──▶ data/files/<sha256>.pdf
                                           fila de importação ──▶ extrator de PDF ──▶ (OCR/IA*)
 Conferência / edição ── REST ───────────▶ calendários, eventos, versões, auditoria (SQLite)
 Publicar ──────────────────────────────▶ versão publicada + replanejamento dos avisos
                                           agendador ──▶ gateway de push* / e-mail*  ──▶ alunos
 Portal / app* ◀──── GET /api/public ─────  só versões publicadas
 Lyceum e outros* ── POST /api/integrations/student-events ──▶ regras de acontecimento ──▶ agenda
                                                                         * = a TI liga
```

## Decisões

| Decisão | Por quê |
|---|---|
| **TypeScript de ponta a ponta**, com `packages/core` compartilhado | As regras que não podem divergir (datas, agenda de avisos, validação, rótulo de público) são o mesmo código na tela e no servidor. |
| **Fastify** na API | Maduro, rápido, multipart oficial, sem mágica. |
| **SQLite embutido do Node (`node:sqlite`)** | Zero dependência nativa, um arquivo, transações reais, implantação trivial. Suficiente para o volume de uma instituição. |
| **Repositórios isolados** (`apps/api/src/repositories`) | Único lugar que fala SQL. Trocar por PostgreSQL = reescrever esses arquivos e `db/database.ts`; serviços e rotas não mudam. |
| **Armazenamento por hash** (`storage.ts`) | O nome enviado nunca vira caminho em disco. Trocar por S3/Blob = implementar `FileStorage`. |
| **pdf.js (pdfjs-dist 4.10)** no servidor e no navegador | Texto com posição, anotações de link e operadores de desenho (cores). Versão fixada: a v5 muda o formato de caminhos. |
| **Fila e agendador no banco** | Itens e envios são "reivindicados" com UPDATE condicional — seguro com vários processos. Sobrevive a reinício. |
| **Gateway HTTP para push e e-mail** | O sistema não fala com Firebase/SMTP: entrega a mensagem montada a um endpoint da TI, que resolve público e contato. Assim nenhum dado de contato de aluno mora aqui. |

## Modelo de dados

Definido em [packages/core/src/types.ts](../packages/core/src/types.ts) e [apps/api/src/db/migrations.ts](../apps/api/src/db/migrations.ts).

| Tabela | Conteúdo |
|---|---|
| `files` | PDFs originais (hash único, nome, páginas, metadados). Nunca alterados. |
| `import_batches`, `import_items` | Envios, itens por arquivo, status (Na fila → Lendo → Precisa de revisão / Pronto / Erro), repetidos. |
| `calendars` | **Rascunho de trabalho** + ponteiro para a versão publicada (`published_version_id`) e hash do conteúdo publicado. |
| `events` | Eventos do rascunho, um registro por evento (JSON completo em `data_json`). `uid` é a identidade estável entre versões. |
| `calendar_versions` | Fotografias imutáveis (dados gerais + eventos). A publicada é a que o portal lê. |
| `notification_jobs`, `job_attempts` | Agenda de envios (chave de idempotência única) e registro de cada tentativa. |
| `lifecycle_rules`, `student_events`, `student_preferences` | Regras de acontecimento, acontecimentos recebidos (idempotentes) e preferências de canal. |
| `audit_log` | Quem fez o quê, quando — só cresce. |
| `users`, `sessions` | Pessoas e sessões. |

## Ciclo de vida do calendário

```
Em preparação ──publicar──▶ Publicado ──tirar do ar──▶ Fora do ar
      ▲                          │                        │
      └── editar (nova versão; a publicada continua no ar) ◀──┘ colocar no ar de novo
```

- A importação **sempre** cria "Em preparação" (`draft`). Nada é publicado automaticamente.
- Publicar é um passo só, com um resumo do que acontece com os avisos. O estado `in_review` continua na API (`POST /submit`) para quem quiser uma segunda pessoa conferindo, mas não é obrigatório.
- Editar um calendário publicado não muda o que alunos/portal/app veem até "Publicar alterações".
- Toda gravação cria uma versão restaurável (Informações → Histórico).

## O que impede publicar

Em [packages/core/src/validation.ts](../packages/core/src/validation.ts) (`HARD_BLOCKERS`). Os calendários da instituição são bem definidos, então **só trava o que poria informação errada no ar**:

- data que o sistema não entendeu, inválida ou ambígua;
- evento sem título;
- página do PDF sem texto (digitalizada) sem OCR configurado;
- evento de período com aviso, sem saber se o aviso conta do início ou do fim;
- calendário sem ano, semestre ou modalidade.

Os demais sinais da leitura (público citado no texto, curso sugerido pela pasta, calendário parecido já existente, dia colorido sem evento…) continuam gravados e aparecem como observação, mas não travam. "Aviso não escolhido" também não trava: o evento simplesmente não gera aviso.

## Agenda de avisos

Em [packages/core/src/schedule.ts](../packages/core/src/schedule.ts). Cada evento responde duas perguntas:

- **Quando** — "No dia", "1 dia antes", "3 dias antes" (qualquer combinação; nenhuma = "Não avisar");
- **A que horas** — um horário de envio para todos os momentos. Começa **vazio** e é **obrigatório**: evento com aviso e sem horário trava a publicação (`reminder_time_missing`), e o lote (`POST /events/bulk-reminders`) recusa aplicar sem horário.

Se o evento tem horário e o aviso "no dia" sai depois dele, aparece o alerta `reminder_after_start` (não trava). O campo `importance` continua existindo para compatibilidade e é derivado: sem momentos = `low`, 1 momento = `medium`, 2 ou mais = `high`.

- Fuso **America/Sao_Paulo**, resolvido pelo `Intl` (continua certo se houver horário de verão).
- Períodos: a antecedência conta do início ou do fim. O sistema sugere (fim para prazos e "último dia"); no editor a pessoa escolhe, e na classificação em lote a sugestão é aplicada com aviso explícito na confirmação. Listas de datas: antes de cada data ou só antes da primeira.
- Nada no passado é criado (sem aviso retroativo).
- Os avisos só entram na agenda **na publicação**. Republicar calcula o impacto (novos, remarcados, cancelados), mostra antes de confirmar e aplica numa transação. Envios já feitos nunca mudam.
- Idempotência: `idempotency_key` única no banco (`rem:<calendário>:<uid do evento>:<lembrete>:<ocorrência>`); o gateway recebe `Idempotency-Key` = chave de entrega (muda só se o horário mudar). O disparo reivindica cada envio (`scheduled → sending`) de forma atômica.

## Permissões

Em [packages/core/src/permissions.ts](../packages/core/src/permissions.ts). Checadas em cada rota da API.

| Papel | Pode |
|---|---|
| `leitor` | ver calendários e agenda |
| `editor` | + importar PDFs, editar rascunhos, enviar para revisão |
| `revisor` | + conferir pendências, devolver para rascunho |
| `publicador` | + publicar, arquivar |
| `comunicador` | ver + enviar comunicações adicionais e configurar acontecimentos |
| `admin` | tudo, inclusive auditoria |

Em `AUTH_MODE=dev` o usuário de desenvolvimento é `admin`. Com Entra ID, o papel deve vir de um grupo do diretório (ver INTEGRACAO_TI.md).

## Segurança dos uploads

Em [apps/api/src/uploads/inventory.ts](../apps/api/src/uploads/inventory.ts):

- tipo decidido pela assinatura (`%PDF-`, `PK`), não pela extensão;
- limites por arquivo, por envio, por quantidade de entradas e por tamanho descompactado (checado no índice do ZIP **antes** de descompactar);
- caminhos absolutos, com `..`, letra de unidade ou caracteres de controle são recusados; ZIP dentro de ZIP não é aberto;
- nomes com acento: lê a marca UTF-8 de cada entrada no índice central; sem ela, tenta UTF-8 e depois CP437;
- ZIP inválido ou criptografado vira item ignorado com motivo, nunca erro 500;
- arquivos são gravados por hash; o nome do usuário é só metadado.
