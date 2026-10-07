# Integração com a TI — o que falta ligar

Tudo abaixo já tem contrato e ponto de troca definidos. Nenhuma dessas integrações é simulada: sem configuração, a interface mostra "aguardando configuração".

## 1. Login com a conta Microsoft (Entra ID)

**Hoje:** `AUTH_MODE=dev` — o botão "Entrar com a conta Microsoft" cria uma sessão para `DEV_USER_EMAIL` com papel `admin`.

**Para ligar:**
1. Registrar o app no Entra ID (OIDC, *authorization code + PKCE*), redirect `https://<host>/api/auth/callback`.
2. Em [apps/api/src/http/auth.ts](../apps/api/src/http/auth.ts), com `AUTH_MODE=entra`:
   - `POST /api/auth/login` passa a devolver `{ redirectUrl }` para a Microsoft (a interface já trata o botão; basta redirecionar);
   - criar `GET /api/auth/callback`: validar o `id_token`, restringir ao tenant/domínio `@anchieta.br`, `upsertUser(email, nome, papel)` e `createSession` — as funções já existem em `repositories/users.ts`;
   - o **papel** vem de grupos do diretório (ex.: `GG-Calendarios-Publicadores` → `publicador`).
3. O resto do sistema já usa sessão + papel; nada mais muda. Considere trocar o token em `localStorage` por cookie `HttpOnly; Secure; SameSite=Strict` nesse momento.

## 2. Gateway de push e de e-mail

Implementar um endpoint HTTP que recebe o envio montado (contrato em [API.md → Gateway de envio](API.md#gateway-de-envio-a-ti-implementa)) e:
- resolve o público (recorte do calendário → alunos; ou o aluno do acontecimento);
- resolve dispositivos e e-mails (este sistema não guarda contato de aluno);
- respeita `Idempotency-Key`.

Configurar `PUSH_WEBHOOK_URL`/`PUSH_WEBHOOK_TOKEN` e `EMAIL_WEBHOOK_URL`/`EMAIL_WEBHOOK_TOKEN`. Envios que estavam "Aguardando configuração" podem ser reenviados pela agenda ("Tentar de novo").

**Contagem do público:** `POST /api/notifications/audience-preview` devolve `estimate: null`. Para mostrar a quantidade de alunos antes do envio, implemente a consulta em `services/notifications.ts → audiencePreview`.

## 3. Acontecimentos do aluno (Lyceum, Secretaria Virtual…)

As 8 regras já existem, com etapas sugeridas e modelos de mensagem editáveis. **Os status oficiais não foram presumidos.** Para cada etapa, a TI preenche na tela (Notificações → Acontecimentos do aluno):
- **Sistema de origem** (ex.: `lyceum`) e **Código do status** exatamente como o sistema envia;
- observações técnicas.

Depois, cada sistema faz `POST /api/integrations/student-events` com `X-Integration-Key` (contrato em API.md). Preferências e consentimentos por canal: `PUT /api/integrations/student-preferences/:studentId`.

Regras de privacidade garantidas pelo código:
- um envio de acontecimento tem exatamente um destinatário (`audience.type = "student"`);
- o modelo só lê o `student` e o `data` daquele acontecimento;
- `eventId` repetido é ignorado (idempotência);
- preferência de canal checada no recebimento e de novo no disparo.

## 4. Portal do aluno e app

Leitura em `GET /api/public/calendars` e `GET /api/public/calendars/:id` — só versões publicadas. Proteja com `PUBLIC_API_KEY` (cabeçalho `X-Integration-Key`) ou por rede interna. O `uid` de cada evento é estável entre versões: use-o como chave no app.

**Como montar a tela do aluno.** Dois calendários, os dois a partir da mesma leitura:

- **Importantes** = eventos de importância Alta + Média (menos as Médias que o aluno ocultou) + os que ele marcou com estrela;
- **Calendário completo** = tudo o que vale para o aluno, mês a mês.

A importância é decidida pela equipe no sistema (Alta / Média / Baixa; "não definida" conta como Baixa). As **cores são as da legenda do PDF** (`legend` + `color` de cada evento); evento sem cor aparece em cinza. A referência pronta é `buildStudentView` em [packages/core/src/student.ts](../packages/core/src/student.ts) — o portal/app pode chamar `GET /api/public/students/:studentId/calendars/:id/view` e receber a visão montada, ou montar com o mesmo pacote. As prévias "Portal do aluno" e "App Grupo Anchieta" do sistema usam exatamente essa função.

- **"Hoje"** é o dia em America/Sao_Paulo (nunca `toISOString().slice(0, 10)`: às 21h de São Paulo já é o dia seguinte).
- **Coorte e turno:** passe `cohort` (`ingressantes`/`veteranos`) e `shift` (`Diurno`, `Noturno`…) para esconder eventos só da outra coorte e mostrar o horário do turno do aluno.
- **Estrela / ocultar:** o backend do portal/app chama as rotas de marcação com `STUDENT_API_KEY` (veja [API.md](API.md#marcações-do-aluno-x-integration-key-student_api_key-obrigatória)). A estrela agenda um push **só para aquele aluno**, com o mesmo texto do aviso do evento, que chega pelo mesmo gateway (`kind: "favorite_reminder"`, `audience.type: "student"`). Não há push imediato: a confirmação é na tela (`note`).
- **Adicionar à agenda:** `…/events/:uid/evento.ics` (um evento) e `…/students/:studentId/calendars/:id/importantes.ics` (todos os importantes do aluno).
- **LGPD:** as marcações (quem favoritou o quê) são dado pessoal do aluno. Ficam na tabela `student_event_marks`, não entram na auditoria (só contagens) e não aparecem na agenda da equipe (só o resumo).

## 5. OCR / leitura visual

Para PDFs digitalizados (sem texto selecionável): `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MODEL` (padrão `claude-opus-5`). Só as páginas sem texto são enviadas, uma a uma. Todo evento lido assim entra com a pendência "Lido por OCR" e exige conferência. Para outro provedor, implemente `OcrProvider` em [apps/api/src/pdf/ocr.ts](../apps/api/src/pdf/ocr.ts).

## 6. Banco e arquivos em produção

- **Banco:** SQLite em `DATA_DIR`. Faça backup do arquivo `.sqlite` (e `-wal`) com o processo parado ou via `sqlite3 .backup`. Para PostgreSQL, reescreva `db/database.ts` e `repositories/*` — o SQL é padrão e os JSON viram `jsonb`.
- **PDFs:** `DATA_DIR/files/<2 primeiros do hash>/<sha256>.pdf`. Para S3/Blob, implemente `FileStorage` ([storage.ts](../apps/api/src/storage.ts)).
- **Processos:** por padrão a API roda também a fila e o agendador (`RUN_WORKERS=true`). Com várias instâncias, pode deixar ligado em todas (a reivindicação é atômica) ou rodar um worker dedicado (`npm run worker -w @calendarios/api`, com `RUN_WORKERS=false` nas APIs).
- **Implantação:** `npm ci && npm run build && npm start` — a API serve a interface compilada em `apps/web/dist` na mesma porta.
