# Contratos da API

Base: `/api`. JSON em UTF-8. Tipos completos em [packages/core/src/types.ts](../packages/core/src/types.ts) — é a fonte da verdade dos formatos abaixo.

Convenções:
- datas de calendário: `AAAA-MM-DD`; instantes: ISO 8601 UTC; horários de parede: `HH:mm` em America/Sao_Paulo;
- erros: `{ "error": "mensagem em português", "detail": … }` com status HTTP adequado (400 entrada inválida, 401 sem sessão, 403 sem permissão, 404, 409 conflito de estado/versão, 413 arquivo grande, 503 integração não configurada);
- rotas internas exigem `Authorization: Bearer <token>` (obtido no login).

## Autenticação

| Método | Rota | Corpo / resposta |
|---|---|---|
| POST | `/auth/login` | `{ provider: "microsoft" }` → `{ token, user }`. Em `AUTH_MODE=entra` responde 501 até a TI implementar. |
| POST | `/auth/logout` | encerra a sessão |
| GET | `/auth/me` | `{ user }` |
| GET | `/system/status` | `SystemStatus`: modo demonstração e estado de IA, push, e-mail e integrações |
| GET | `/health` | `{ ok, time }` |

## Importação

| Método | Rota | Descrição |
|---|---|---|
| POST | `/imports` | multipart: campo `manifest` = `[{ field, path }]` **antes** dos arquivos; cada arquivo no campo `field` (`f0`, `f1`…). `path` é o caminho relativo (pasta/ZIP preservados). → `ImportBatch` em `staged`, com `items` (PDFs), `ignored` (com motivo), `sameContentAs` e `alreadyImportedAs`. Nada é lido ainda. |
| POST | `/imports/:id/start` | `{ mergeIdentical: boolean, forceItemIds: string[] }` → inicia a leitura |
| GET | `/imports/:id` | progresso por item: `queued` · `reading` · `needs_review` · `ready` · `error` · `skipped` |
| POST | `/imports/:id/retry` | `{ itemIds? }` → só os itens com erro voltam para a fila |
| GET | `/imports` | últimos envios |

## Calendários

| Método | Rota | Descrição |
|---|---|---|
| GET | `/calendars?q&status&year&semester&modality` | lista (`CalendarSummary[]`) |
| GET | `/calendars/:id` | `{ calendar, events, publishCheck }` |
| PATCH | `/calendars/:id` | dados gerais: `{ title?, year?, semester?, scope?, legend?, notes?, expectedVersion? }` |
| POST | `/calendars/:id/events` | cria (`EventInput`) |
| PATCH | `/calendars/:id/events/:eventId` | edita (`EventInput` + `expectedVersion?` → 409 se outra pessoa alterou) |
| DELETE | `/calendars/:id/events/:eventId` | exclui (fica no histórico) |
| POST | `/calendars/:id/events/:eventId/duplicate` | duplica |
| POST | `/calendars/:id/events/bulk-importance` | `{ eventIds, importance }` |
| POST | `/calendars/:id/review/ack` | `{ eventId \| null, code, undo? }` — marca pendência como conferida |
| POST | `/calendars/:id/submit` | Rascunho → Em revisão |
| POST | `/calendars/:id/return` | Em revisão → Rascunho |
| GET | `/calendars/:id/publish-preview` | `{ publishCheck, diff }` — impacto nos avisos (`create`, `update`, `cancel`) |
| POST | `/calendars/:id/publish` | `{ confirm: true }` — só de Em revisão, sem pendências |
| POST | `/calendars/:id/archive` · `/unarchive` | arquivar (cancela envios futuros) · reativar como rascunho |
| GET | `/calendars/:id/versions` · `/versions/:vid` | histórico · fotografia |
| POST | `/calendars/:id/versions/:vid/restore` | restaura como nova versão |
| GET | `/calendars/:id/audit` | auditoria |
| GET | `/calendars/:id/reminders` | `{ draftPlan, jobs }` |
| GET | `/files/:id/content` | PDF original (inline). Também aceita `?token=` para abrir em nova aba (`#page=N`). |

## Notificações

| Método | Rota | Descrição |
|---|---|---|
| GET | `/notifications/jobs?status=a,b&kind&channel&calendarId&q&from&to` | agenda + contagem por status |
| GET | `/notifications/jobs/:id` | `{ job, attempts }` |
| POST | `/notifications/jobs/:id/cancel` · `/retry` | cancelar o que não saiu · tentar de novo falha/aguardando |
| POST | `/notifications/audience-preview` | `{ calendarId, groups }` → rótulo do público; `estimate` é `null` até a TI ligar a contagem |
| POST | `/notifications/additional` | `{ calendarId, eventUid?, channel, title, body, sendAt \| null, groups, confirm: true }` |

## Acontecimentos do aluno

| Método | Rota | Descrição |
|---|---|---|
| GET | `/lifecycle/rules` | as regras e suas etapas |
| PUT | `/lifecycle/rules/:id` | `{ steps: LifecycleStep[] }` — etapa só liga com `trigger.sourceSystem` e `trigger.statusCode` preenchidos |
| POST | `/lifecycle/rules/:id/preview` | prévia com dados fictícios |
| GET | `/lifecycle/events?ruleId` | acontecimentos recebidos e o que foi feito |

## Integrações (chave `X-Integration-Key: <INTEGRATION_API_KEY>`)

### POST `/integrations/student-events`

Enviado pelos sistemas institucionais a cada mudança de status.

```json
{
  "eventId": "lyceum-2026-000123-DEFERIDA",
  "sourceSystem": "lyceum",
  "statusCode": "HC_DEFERIDA",
  "occurredAt": "2026-09-28T14:00:00Z",
  "student": { "id": "12345", "ra": "1234567", "firstName": "Ana" },
  "data": { "solicitacao.horas": 20, "solicitacao.protocolo": "2026-000123" }
}
```

- `202 { id, outcome: "scheduled", jobIds }` · `200 { duplicate: true }` para `eventId` repetido (idempotente) · outros `outcome`: `unmapped`, `disabled`, `opted_out`.
- O envio é endereçado **somente** a `student.id`. A mensagem usa só `student` e `data` deste acontecimento. Chaves de `data` no formato `grupo.campo` viram variáveis do modelo (`{{solicitacao.horas}}`).

### PUT `/integrations/student-preferences/:studentId`

`{ "pushOptIn": true, "emailOptIn": false }` — consentimento por canal, checado de novo no disparo.

## Leitura pública para portal e app (`X-Integration-Key: <PUBLIC_API_KEY>` se configurada)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/public/calendars` | calendários **publicados** (não arquivados): id, título, período, público, versão |
| GET | `/public/calendars/:id` | a versão publicada: eventos (`uid`, título, descrição, datas, horários, local, links, observações, público, tipo, categoria, cor, importância), legenda e observações. Nunca expõe o rascunho, pendências ou autoria. |

## Gateway de envio (a TI implementa)

O agendador faz `POST` em `PUSH_WEBHOOK_URL` / `EMAIL_WEBHOOK_URL` com `Authorization: Bearer <TOKEN>` e `Idempotency-Key: <deliveryKey>`:

```json
{
  "deliveryKey": "rem:…:d1:main@2026-09-27T12:00:00.000Z",
  "idempotencyKey": "rem:<calendário>:<uid do evento>:d1:main",
  "channel": "push",
  "kind": "event_reminder",
  "audience": {
    "type": "calendar",
    "calendarId": "…",
    "scope": { "modality": "Presencial", "courses": [], "exceptions": ["Direito"], "cohorts": [], "audienceLabel": "Cursos Presenciais (exceto Direito)" },
    "groups": [],
    "label": "Cursos Presenciais (exceto Direito)"
  },
  "message": { "title": "Calendário acadêmico", "body": "Período de aplicação da P1 começa amanhã (28/09 a 09/10)." },
  "context": { "jobId": "…", "calendarId": "…", "eventUid": "…", "lifecycleRuleId": null },
  "scheduledFor": "2026-09-27T12:00:00.000Z"
}
```

- Para acontecimentos, `audience = { "type": "student", "studentId": "12345", "label": "Aluno RA 1234567" }`.
- Resposta `2xx` (opcional `{ "messageId": "…" }`) = enviado. `429`/`5xx`/rede = nova tentativa com espera crescente (até `SCHEDULER_MAX_ATTEMPTS`). Outros `4xx` = falha definitiva, visível na agenda.
- O gateway deve descartar uma `Idempotency-Key` já processada.
- `groups` são recortes do evento (`Ingressantes`, `Veteranos`, `Monitores`, `Dependência e Adaptação` ou outro texto que a equipe criou) — a TI mapeia para os filtros da base acadêmica.
