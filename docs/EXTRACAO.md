# Leitura dos PDFs

Código em [apps/api/src/pdf](../apps/api/src/pdf). Regra geral: **nunca inventar**. O que não é certo vira pendência, e a publicação fica bloqueada até alguém conferir.

## Cadeia

1. **Leitor** (`reader.ts`) — pdf.js: texto com posição e fonte (negrito), anotações de link, metadados e as **formas preenchidas com a cor** (operadores de desenho, com a matriz de transformação aplicada). Coordenadas em pontos, origem no topo.
2. **Classificação de página** — visão geral (≥ 2 nomes de mês + cabeçalhos DOM…SÁB), mensal (`JULHO / 2026`), sem texto (menos de 8 itens → OCR).
3. **Cabeçalho** (`header.ts`) — ano (título), semestre (`2º SEMESTRE`, remontado a partir do texto com letras espaçadas), público do painel lateral ("Cursos Presenciais (exceto Direito)"), modalidade, exceções, curso e ingressantes/veteranos. Sugestões vindas do **caminho do arquivo** são sempre sinalizadas.
4. **Visão geral** (`overview.ts`) — a grade de seis meses: cor de cada dia, triângulos de canto e pontinhos (mais de um evento), a legenda (amostra de cor ↔ texto, agrupada por seção) e a nota de rodapé. Também confere se cada dia está na coluna certa da semana para o ano.
5. **Páginas mensais** (`monthly.ts`) — a tabela data ↔ descrição. As linhas são delimitadas pela **célula colorida da data** (a data é centralizada na vertical; ligar cada linha de texto à data mais próxima erraria em descrições longas). Alternativas: traços separadores; em último caso, data mais próxima com pendência de "associação incerta". Texto fora de qualquer linha vira observação geral + pendência — nunca é descartado.
6. **Campos** (`packages/core/src/fields.ts`) — título (primeira frase), descrição (a mesma redação, sem as quebras de layout), redação integral linha a linha, horários por turno (`Horário de início - Diurno: 07h30`), horário simples, local, links (texto e anotações), observações com asterisco, público citado, tipo.
7. **Datas** (`packages/core/src/dates.ts`) — `25/08`, `04 a 31/08`, `28/09 a 09/10`, `12 e 13/10`, `13, 14, 27 e 28/11`. O mês vem do último número de cada grupo. Lista nunca vira intervalo; dia inexistente é erro; mistura de período com lista fica pendente; ano sem justificativa é suposição sinalizada.
8. **Um evento por período** (`merge.ts`) — mesma data + mesmo texto em páginas diferentes = um evento com várias origens (P1 em setembro e outubro). Texto quase igual = um evento com pendência "texto diferente entre páginas" e as duas versões. Mesma data e textos diferentes continuam separados (os três eventos de 25/08).
9. **Cruzamento com a grade** (`pipeline.ts`) — categoria/cor pela legenda (texto do evento × rótulo da legenda, com a cor do dia como reforço — mas cor sozinha não decide); dias coloridos na grade sem evento correspondente viram aviso.
10. **Relatório** — páginas lidas, linhas, eventos, datas reconhecidas, pendentes, duplicidades, trechos sem data, uso de OCR.

## Resultado nos 33 PDFs reais do 2º semestre de 2026

Todos lidos sem erro, **nenhuma data pendente**, estratégia de célula colorida em todas as páginas mensais. Sinais levantados para conferência humana (não são erros do extrator, são decisões ou divergências dos próprios PDFs):

- **Público citado no texto** (ex.: "(Dependência e Adaptação)", "apenas aos alunos monitores", "Calouros"): o recorte é sugerido, não aplicado — "Aplicação da Prova Substitutiva da P2 das Disciplinas Presenciais, Remotas e do Estudo Dirigido (Dependência e Adaptação)" cita DP mas vale para todos.
- **"Fique atento!…"** nas páginas dos cursos híbridos: fora da tabela, guardado como observação geral.
- **Divergências grade × lista**, por exemplo: Terças e Quintas lista `01, 10, 17 e 24/09` mas a grade pinta 03/09; EAD pinta "Aula Inaugural" em 03/08 sem linha correspondente; Direito pinta 14/08 como feriado.

## Limitações conhecidas

- O formato é o da série de calendários do PowerPoint institucional. Um layout muito diferente cai na estratégia "data mais próxima" e fica todo pendente de conferência — correto, mas trabalhoso.
- O semestre só é lido do texto; se não aparecer, fica pendente (não é deduzido pelos meses).
- PDFs protegidos por senha: erro claro por arquivo.
- OCR depende de configuração e sempre exige conferência.

## Depurar um PDF novo

```bash
npx tsx apps/api/scripts/extract.ts caminho/arquivo.pdf          # resumo legível
npx tsx apps/api/scripts/extract.ts caminho/arquivo.pdf --json   # tudo
npx tsx apps/api/scripts/extract-all.ts pasta/                   # lote
```
