# 0007 — Handoff parcial · Fase 2.5 (Etapa 4 — Deploy) · 2026-07-24

> Handoff **parcial** — não é o "Handoff final" da Fase 2.5 (seção 14 de
> `docs/tasks/011_fase_2_5.md`), que só deve ser criado ao final de toda a
> fase. Este documento existe para retomar o trabalho amanhã sem perder
> contexto, conforme pedido ao encerrar a sessão de 2026-07-24.

## Estado geral

- **Data:** 2026-07-24
- **Branch:** `master` (única branch do repositório, local e remota)
- **Último commit local:** ver `git log --oneline -1` no encerramento desta
  sessão — os três commits desta sessão têm as mensagens: `fix: prevent mock
  payment flow in production`, `fix: add terminal states to pending order
  polling`, `docs: document phase 2.5 deployment and pending work`.
- **URL atual da Vercel:** `https://antero-cartas.vercel.app` (temporária —
  domínio customizado ainda não configurado, de propósito, ver pendências)
- **Status do deploy:** produção, `READY`, com a correção do checkout já
  publicada (2º deploy do dia)
- **Testes:** 143 passam / 7 pulados sem banco (150 no total, 21 arquivos);
  com `RUN_DB_TESTS=true`, 150/150 passam (banco local Docker)
- **Fase 3 não foi iniciada** — nenhum pagamento real, webhook ou e-mail real
  foi criado ou habilitado.

## Trabalho concluído

Nesta fase (2.5), até aqui:

- Supabase local via Docker (`npx supabase start`), separado do projeto
  remoto — ver `docs/0006_Runbook_Producao.md`, seção 2.
- Separação explícita dev/produção por `APP_ENV` (`src/lib/appEnv.ts`, D49) —
  impede uso acidental de credenciais de produção num `next dev`.
- Guard `assertPrismaCliAllowed` — Prisma CLI recusa rodar contra produção
  sem confirmação explícita (`ALLOW_PRISMA_CLI_PRODUCTION=true` só por
  comando, nunca persistido).
- `.env.example` completo e documentado; `.env.production.reference`
  (gitignored) como referência manual para colar na Vercel.
- Projeto `antero-cartas` criado e vinculado na Vercel (CLI), repositório Git
  conectado (`github.com/DavidEdsonDoNascimento/antero-cartas`), branch de
  produção confirmada como `master` (via API, `link.productionBranch`).
- 18 variáveis de Production configuradas na Vercel; Preview e Development
  confirmados **vazios** (`vercel env ls`) — nenhuma credencial de produção
  fora do ambiente Production.
- Estratégia de migrations: nunca automática no Build Command; passo manual
  documentado (`docs/0006_Runbook_Producao.md`, seção 6).
- URL pública consolidada em `NEXT_PUBLIC_SITE_URL` + guard de validação em
  build (`src/config/site.ts`, D54) — bloqueia `localhost`/URL vazia/malformada
  em produção.
- Testes sintéticos de upload (5/9,99/10/10+1/15 MB) documentados em
  `docs/0006_Runbook_Producao.md`, seção 7.
- **Correção do incidente de pagamento mock em produção** (detalhes na seção
  seguinte) — painel de simulação agora é gated por
  `NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION` (fail-closed).
- **Correção do loading infinito** na tela `/pedido/[orderId]/sucesso` — novo
  estado terminal `pending_timeout`.
- **Estados terminais completos do polling**: 400/401/403/404/409/429/500,
  falha de rede, timeout (novo `AbortController` em `src/lib/api.ts`) e
  resposta inválida — cada um decide se faz sentido oferecer retry.
- Testes novos: `src/config/flags.test.ts` (4), `src/lib/orderPolling.test.ts`
  (10), `src/server/payment/index.test.ts` (6).
- Documentação atualizada: `docs/0005_ChangeLog.md`,
  `docs/0006_Runbook_Producao.md`, `docs/tasks/012_cont_fase_2_5.md`, este
  handoff.

## Incidente encontrado em produção

**O que aconteceu:** no smoke test manual do primeiro deploy, ao clicar em
"Simular pagamento aprovado" no checkout, a tela ficava presa
indefinidamente em "Confirmando seu pagamento…".

**Diagnóstico:**
- O painel de simulação (`MockPaymentPanel`) era renderizado
  incondicionalmente em `CheckoutClient.tsx`, sem checar nenhuma variável de
  ambiente — o botão sempre aparecia, mesmo em produção.
- O backend **bloqueava corretamente**: `POST /api/orders/[id]/mock-confirm`
  sempre respondia `403 mock_disabled` quando `ALLOW_MOCK_PAYMENT_CONFIRMATION`
  não está habilitada (confirmado ao vivo contra produção, antes e depois da
  correção).
- O frontend não tratava esse bloqueio: o erro 403 era capturado num `catch`
  vazio em `MockPaymentPanel.confirm()` e a navegação para a tela de sucesso
  acontecia de qualquer forma.
- O polling de `/api/orders/[id]` em `OrderSuccessClient.tsx` já tinha um
  teto de 20s, mas ao esgotar o prazo com o pedido ainda `PENDING`, nenhum
  novo estado era definido — sem estado terminal, o render ficava preso na
  regra fixa "`PENDING` → Confirmando seu pagamento…" para sempre.

**Solução implementada:**
1. Nova flag `NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION` (espelho público
   de `ALLOW_MOCK_PAYMENT_CONFIRMATION`, padrão `false`/fail-closed) —
   `src/config/flags.ts`.
2. `CheckoutClient.tsx`: painel de simulação só aparece com a flag ligada;
   caso contrário, `PaymentUnavailablePanel` com mensagem clara e "Voltar"
   (retorna ao formulário; pedido e rascunho preservados — `createOrder` já
   é idempotente por carta+plano).
3. `OrderSuccessClient.tsx`: novo estado terminal `pending_timeout` +
   classificação de erro (`retryable`) para todas as respostas de erro
   possíveis, com "Tentar novamente" só quando faz sentido e "Voltar" sempre
   disponível.
4. `src/lib/api.ts`: timeout via `AbortController` (8s no polling do pedido);
   corpo 200 inválido agora também é tratado como erro.
5. Lógica extraída para `src/lib/orderPolling.ts` (`reduceOrderPoll`,
   `classifyOrderError`) — testável sem DOM (o projeto não tem
   `jsdom`/`testing-library`).

**Testes adicionados:** 20 novos (`flags.test.ts`, `orderPolling.test.ts`,
`server/payment/index.test.ts`) — ver seção anterior.

**Resultado da validação manual informada por você:** **PENDENTE.** A
mensagem de validação recebida trouxe o modelo com os campos ainda em
branco (`[SIM/NÃO]`, `[PREENCHER]`), não as respostas reais. Não registro
"sim" em nenhum item sem confirmação sua — quando você preencher, atualizo
esta seção com os resultados reais:

- Tela de sucesso saiu do loading infinito: **PENDENTE**
- Tempo aproximado até o estado terminal: **PENDENTE**
- Painel de simulação não aparece mais em produção: **PENDENTE**
- Mensagem de pagamento indisponível aparece: **PENDENTE**
- Botão de voltar funciona: **PENDENTE**
- Dados da carta foram preservados: **PENDENTE**
- Problemas adicionais encontrados: **PENDENTE**

O que eu *pude* confirmar, sem navegador (via `curl` direto contra produção
e testes automatizados — não é o mesmo que seu teste manual):
`mock-confirm` responde 403 antes e depois da correção; `NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION`
nunca foi definida na Vercel (confirmado via `vercel env ls production`), o
que faz `flags.MOCK_PAYMENT_CONFIRMATION_ENABLED` resolver para `false` em
build-time; a URL `/pedido/cmrzbq6fp000204l2vjhtgvzv/sucesso` (pedido de
teste real, `PENDING`) é o jeito mais direto de ver o novo `pending_timeout`
ao vivo, sem precisar recriar sessão de navegador.

## Configuração atual de produção

Nomes e valores não secretos (sem credenciais, URLs de banco completas,
chaves ou service role):

```env
APP_ENV=production
ALLOW_MOCK_PAYMENT_CONFIRMATION=false
NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION=ausente (equivale a false)
DEV_EMAILS_ENABLED=false
PAYMENT_MODE=mock
EMAIL_MODE=mock
STORAGE_PROVIDER=supabase
NEXT_PUBLIC_PAYMENT_MODE=mock
NEXT_PUBLIC_SITE_URL=https://antero-cartas.vercel.app
```

(demais variáveis de Production — `DATABASE_URL`, `DIRECT_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`,
`YOUTUBE_*` — configuradas e criptografadas na Vercel, não repetidas aqui;
lista completa de nomes em `docs/0006_Runbook_Producao.md`, seção 3)

**O que isso significa na prática:**
- Pagamento real ainda não existe (Fase 3) — `PAYMENT_MODE=mock` é o único
  modo suportado hoje.
- Produção **permite** criar um pedido no estado `PENDING` (checkout até a
  etapa de pagamento funciona normalmente).
- Produção **não confirma** pagamento mock — `mock-confirm` sempre responde
  403.
- Produção **não publica cartas gratuitamente** — sem confirmação de
  pagamento, a carta nunca sai de `DRAFT`/`AWAITING_PAYMENT`.
- O visualizador de e-mail mock (`/api/dev/emails`) está bloqueado em
  produção independentemente de qualquer flag (checa `NODE_ENV`).

## Pendências exatas para amanhã

1. Confirmar (ou executar) o push dos commits desta sessão para
   `origin/master` — ver "Ações que dependem de mim/comando exato" no
   encerramento desta sessão.
2. Decidir e executar a limpeza dos registros de teste por ID (dry run já
   mostrado; aguardando autorização) — ver seção "Dados de teste remotos"
   abaixo.
3. Adicionar `cartas.anterosistemas.com.br` à Vercel.
4. Obter da Vercel o registro DNS exato (tipo, host, destino, TTL).
5. Aguardar configuração manual do DNS.
6. Validar propagação e HTTPS.
7. Trocar `NEXT_PUBLIC_SITE_URL` para `https://cartas.anterosistemas.com.br`.
8. Novo deploy.
9. Validar canonical, sitemap, metadata, compartilhamento e QR Code — não
   considerar QR Codes gerados antes desta troca como definitivos.
10. Configurar ou finalizar Sentry.
11. Configurar ou finalizar analytics.
12. Validar imagem Open Graph.
13. Validar headers de segurança.
14. Checklist em Android, iPhone, Wi-Fi e rede móvel.
15. Concluir o handoff **definitivo** da Fase 2.5 (seção 14 de
    `docs/tasks/011_fase_2_5.md`) — só ao final de toda a fase, não amanhã
    necessariamente.
16. Completar os itens 2.1–2.9 (automatizáveis) e o checklist manual do
    smoke test de produção que ainda não foram percorridos formalmente
    (`docs/tasks/012_cont_fase_2_5.md`, seção 2).

## Dados de teste remotos (produção)

Criados durante o diagnóstico/validação de hoje, **nenhum removido**:

| ID | Tipo | Status | Relacionamentos | Storage |
|---|---|---|---|---|
| `cmrzbpfxa000004l211cblj62` | Cart órfão | `DRAFT`, sem slug | 0 pedidos, 0 mídia | nenhum |
| `cmrzbpt5c000104l2f1nt0n1f` | Cart | `AWAITING_PAYMENT`, sem slug | 1 pedido (`cmrzbq6fp000204l2vjhtgvzv`, `PENDING`), 0 mídia | nenhum |
| `cmrzbq6fp000204l2vjhtgvzv` | Order | `PENDING` | e-mail `diagnostico.etapa4@seed.local`, 0 `EmailDelivery` (nunca confirmado) | — |

Dry run confirmado com `scripts/cleanupTestData.ts` (já existente,
seguro por padrão) contra produção:

```bash
npx tsx scripts/cleanupTestData.ts \
  --env-file .env.production.reference \
  --cart-ids cmrzbpt5c000104l2f1nt0n1f,cmrzbpfxa000004l211cblj62
```

Saída confirma 0 mídia/0 e-mail em ambos — remoção seria só `Order` (cascata
de `EmailDelivery`, que está vazio) e depois `Cart`, sem nenhum objeto de
Storage a apagar. Comando de execução real, **só com autorização**:

```bash
npx tsx scripts/cleanupTestData.ts \
  --env-file .env.production.reference \
  --cart-ids cmrzbpt5c000104l2f1nt0n1f,cmrzbpfxa000004l211cblj62 \
  --confirm
```

## Ações que dependem de você

- Acesso e alteração do DNS (`cartas.anterosistemas.com.br`).
- Criação/configuração de contas externas quando necessário (Sentry,
  analytics).
- DSN do Sentry.
- Testes físicos em celulares (Android/iPhone, Wi-Fi/rede móvel).
- Autorização para apagar os dados de teste remotos listados acima.
- Autorização de push dos commits, caso as regras do projeto exijam
  confirmação explícita (ver encerramento desta sessão para o comando exato).

## Riscos conhecidos

- Supabase plano gratuito: sem backup automático, só dump manual (`pg_dump`)
  — ver `docs/0006_Runbook_Producao.md`, seção 4.
- Sem ambiente de staging remoto — Preview cobre só páginas estáticas.
- Upload passa pela função serverless da Vercel — limite de payload (~4,5 MB)
  ainda não validado com upload real em produção.
- Pagamento e e-mail seguem em modo mock — produção não conclui uma compra
  de verdade antes da Fase 3.
- Possível divergência entre produção (já com a correção) e o Git até os
  commits desta sessão serem enviados ao remoto.

## Como retomar amanhã

Prompt pronto para copiar:

```text
Leia docs/0007_Handoff_Fase2_5_Parcial.md e docs/tasks/012_cont_fase_2_5.md.
Confirme a branch atual, o git status, e se os commits de 2026-07-24 já
estão no remoto (git log origin/master..master). Confirme o deploy atual na
Vercel (URL, último deploy, variáveis de Production). Continue exatamente
pelo próximo item pendente da lista "Pendências exatas para amanhã" do
handoff — não repita trabalho já feito. Não inicie a Fase 3.
```
