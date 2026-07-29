# 0009 — Handoff completo de continuidade · Fase 3 (Venda Real) · 2026-07-29

> Handoff **parcial** da Fase 3 (task `docs/tasks/013_fase_3.md`) — não é o
> handoff final da fase, que só deve ser criado depois da validação em
> sandbox e da ativação de produção. Escrito para que qualquer nova sessão
> do Claude Code retome o trabalho **sem depender do histórico desta
> conversa** — todo fato abaixo foi reconfirmado diretamente no Git, na
> Vercel e rodando os comandos, não copiado de memória.

---

## 1. Estado atual do projeto

| Item | Valor |
|---|---|
| Branch atual | `master` (única branch do repositório) |
| Último commit | `750f8a6` — `docs: add phase 3 partial handoff at the first human checkpoint` |
| Último push | `750f8a6`, já em `origin/master` (`git diff master origin/master` vazio) |
| Estado do Git | working tree limpo, sem divergência com o remoto |
| Estado da Vercel | projeto `antero-cartas` (`prj_0ABNrkawuQGILAUJ3VsRweCpLfim`), deploy automático a partir de `master` |
| Último deployment | `Ready`, servindo `cartas.anterosistemas.com.br` (a Vercel gera um deployment novo a cada push, inclusive de documentação — o id exato muda a cada push; confirme com `npx vercel inspect https://cartas.anterosistemas.com.br`) |
| Ambiente atual | Production com `PAYMENT_MODE=mock`, `EMAIL_MODE=mock`, `ALLOW_MOCK_PAYMENT_CONFIRMATION` ausente, `DEV_EMAILS_ENABLED=false` — mocks bloqueados, nada real ativado |
| Domínio oficial | `https://cartas.anterosistemas.com.br` (definitivo, Fase 2.5) |
| Status da Fase 2.5 | **Encerrada.** Handoff final em `docs/0008_Handoff_Fase2_5_Final.md`; validações manuais (checklist físico e evento do Sentry) aprovadas por você antes do início da Fase 3 |
| Status da Fase 3 | **Código, testes e documentação concluídos.** Nada foi ativado — aguardando contas/credenciais externas (Mercado Pago e Resend) |

---

## 2. O que foi implementado nesta sessão

Faixa de commits: `90873b7` até `750f8a6` (12 commits, 47 arquivos, +3494/-105
linhas). Lista completa por categoria:

### Migrations
- `prisma/migrations/20260729212231_phase3_payment_events_and_charged_back/migration.sql`
  — aditiva: `ALTER TYPE "OrderStatus" ADD VALUE 'CHARGED_BACK'` + `CREATE TABLE "PaymentEvent"`.
- `prisma/schema.prisma` — `OrderStatus.CHARGED_BACK`; novo modelo `PaymentEvent`
  (`provider`, `providerEventId` únicos, `providerPaymentId`, `rawStatus`, `orderId` opcional).

### Rotas (App Router)
- `src/app/api/webhooks/mercadopago/route.ts` (+ `route.test.ts`) — único
  endpoint que aprova pagamento.
- `src/app/api/orders/[id]/payments/pix/route.ts` — cria cobrança Pix.
- `src/app/api/orders/[id]/payments/card/route.ts` (+ `route.test.ts`) — cria
  pagamento de cartão a partir do token do Payment Brick.
- `src/app/api/orders/route.ts` — rate limit adicionado (sem mudar o contrato).
- `src/app/api/youtube/search/route.ts` — `clientKey` extraído para `lib/rateLimit.ts` (refactor, sem mudança de comportamento).

### Componentes (frontend)
- `src/components/checkout/PixPaymentPanel.tsx` — QR Code, copia-e-cola,
  validade, polling limitado (reusa `reduceOrderPoll`).
- `src/components/checkout/CardPaymentPanel.tsx` — Payment Brick do Mercado
  Pago via `<script>` (`sdk.mercadopago.com/js/v2`), token nunca passa pelo
  servidor.
- `src/components/checkout/CheckoutClient.tsx` — novo `RealPaymentPanel`
  (seletor Pix/cartão), ativado quando `flags.PAYMENT_MODE === "real"`.
- `src/components/order/OrderSuccessClient.tsx` — trata `CANCELLED` (tentar
  de novo) e `REFUNDED`/`CHARGED_BACK` (aponta para suporte via WhatsApp);
  dispara `letter_published`.

### Providers e domínio (backend)
- `src/server/payment/PaymentProvider.ts` — interface estendida (payer, token
  de cartão, dados de Pix, `InternalOrderStatus`) preservando o contrato.
- `src/server/payment/mercadoPagoStatus.ts` (+ teste) — mapeamento de status
  + `shouldApplyTransition` (regra de "fora de ordem").
- `src/server/payment/mercadoPagoWebhookSignature.ts` (+ teste) — validação
  HMAC-SHA256 da assinatura do webhook.
- `src/server/payment/mercadopago.ts` (+ teste) — `PaymentProvider` real via
  `fetch`, sem SDK.
- `src/server/payment/index.ts` — `getPaymentProvider()` agora alterna
  mock/real por `PAYMENT_MODE` (antes lançava erro em modo "real").
- `src/server/orderService.ts` — `finalizeOrderAsPaid` extraído e reusado por
  `mockConfirmOrder` e por `applyMercadoPagoWebhook` (novo);
  `createPixPaymentAttempt`/`createCardPaymentAttempt` (novos).
- `src/server/email/render.ts` (+ teste) — template do e-mail extraído para
  módulo puro, compartilhado entre mock e Resend.
- `src/server/email/resend.ts` (+ teste) — `EmailProvider` real via Resend,
  sem SDK.
- `src/server/email/mock.ts`, `index.ts` (+ teste) — reusam `render.ts`;
  `getEmailProvider()` alterna mock/real por `EMAIL_MODE`.
- `src/server/errors.ts` — novo código `rate_limited` (HTTP 429).
- `src/server/schemas.ts` — `cardPaymentSchema` (só token/installments/
  paymentMethodId/issuerId — nunca dado de cartão bruto).
- `src/lib/api.ts` — `createPixPayment`, `createCardPayment` (cliente).
- `src/lib/analytics.ts` — eventos `payment_method_selected`,
  `payment_pending`, `payment_failed`, `letter_published` (substitui
  `cart_published`, que nunca era chamado).
- `src/lib/rateLimit.ts` — `clientKey()` extraído (reuso).
- `src/config/securityHeaders.ts` (+ teste) — CSP libera
  `*.mercadopago.com`/`*.mlstatic.com` só quando `paymentMode: "real"`.
- `next.config.ts` — passa `PAYMENT_MODE` para `buildSecurityHeaders`.

### Scripts
- `scripts/reprocessFailedEmails.ts` — reprocessamento de `EmailDelivery`
  `FAILED`, dry run por padrão, até 5 tentativas.

### Testes
- Novos arquivos: `mercadoPagoStatus.test.ts`, `mercadoPagoWebhookSignature.test.ts`,
  `mercadopago.test.ts`, `payment/index.test.ts` (atualizado),
  `webhooks/mercadopago/route.test.ts`, `payments/card/route.test.ts`,
  `email/render.test.ts`, `email/resend.test.ts`, `email/index.test.ts`,
  `securityHeaders.test.ts` (ampliado), `phase3.integration.test.ts` (banco
  local, opt-in `RUN_DB_TESTS=true`).
- Total: **72 testes novos** (211 → 283).

### Documentação
- `docs/tasks/013_fase_3.md` — task da fase.
- `docs/0004_Decisions.md` — decisões D60–D66.
- `docs/0005_ChangeLog.md` — entrada completa da Fase 3.
- `docs/0006_Runbook_Producao.md` — seções 14 (Mercado Pago), 15 (Resend),
  16 (checklist de ativação de produção), 17 (rollback).
- `.env.example` — variáveis novas (sem valores).
- `README.md` — status atualizado (estava desatualizado, ainda dizia "Fase 2").
- `docs/0009_Handoff_Fase3_Parcial.md` — este arquivo.

### Commits realizados (ordem cronológica)
```
90873b7 feat: add phase 3 task doc and payment event schema
7cf17bc feat: add mercado pago status mapping, webhook signature and payment provider
553d0d9 feat: extract idempotent payment finalization and add mercado pago webhook
ffaa212 feat: add pix/card payment endpoints and mercado pago webhook route
9e04899 test: cover the mercado pago webhook route and card payment validation
2d0cd7b feat: add Pix/card checkout UI and open CSP for the Payment Brick
243a761 feat: handle all payment states in the success screen (task 013, section 10)
f22040f feat: add basic rate limiting to order/payment routes (task 013, section 14)
9f48b2f feat: add resend email provider and failed-delivery reprocessing script
5f9fc26 test: confirm email delivery failure never undoes publication
7bf7953 docs: document phase 3 architecture, env vars, and production activation
750f8a6 docs: add phase 3 partial handoff at the first human checkpoint
```
Todos já em `origin/master`. Nenhum `--force`, nenhum segredo versionado.

---

## 3. O que foi validado

Confirmado **agora**, rodando os comandos diretamente (não é relato de
memória de sessão anterior):

| Item | Resultado |
|---|---|
| `npm run lint` | limpo |
| `npm run typecheck` | limpo |
| `npm run build` | limpo (12 rotas novas registradas corretamente) |
| `RUN_DB_TESTS=true npm test` | **283/283 passando**, 35 arquivos de teste, banco local (Supabase/Docker) |
| Landing (`/`) em produção | HTTP 200 |
| `/criar` em produção | HTTP 200 |
| Webhook `/api/webhooks/mercadopago` sem assinatura | HTTP 401 (fail-closed, confirmado ao vivo) |
| `mock-confirm` em produção | HTTP 403 `mock_disabled` (mocks continuam bloqueados, confirmado ao vivo) |
| CSP em produção | Não cita `mercadopago.com`/`mlstatic.com` (consistente com `PAYMENT_MODE=mock` — nada do Brick é carregado) |
| Variáveis em Production | Nenhuma variável do Mercado Pago ou Resend existe na Vercel (confirmado por `vercel env ls production`, só nomes, sem valores) |

**Não validado** (depende de credencial que não existe ainda):
- Criação real de pagamento Pix ou cartão contra a API do Mercado Pago.
- Recebimento real de um webhook do Mercado Pago (a rota existe e rejeita
  corretamente sem assinatura, mas nunca recebeu uma notificação de verdade).
- Envio real de e-mail pelo Resend.
- Comportamento do Payment Brick num navegador real (carregamento do SDK,
  tokenização, envio do formulário) — só revisado por código e por exemplos
  oficiais do Mercado Pago, nunca clicado numa página real.

**Sentry e Analytics**: inalterados nesta sessão — continuam como
encerrados na Fase 2.5 (`docs/0008_Handoff_Fase2_5_Final.md`). Os eventos
novos de analytics (`payment_method_selected` etc.) existem no código mas
nunca dispararam de verdade em produção, porque a UI real de pagamento não
aparece enquanto `PAYMENT_MODE=mock`.

---

## 4. Ponto exato da interrupção

**Toda a implementação da Fase 3 que independia de serviços externos foi
concluída.** Não há código pendente, teste pendente, nem documentação
pendente que dependa só de mim. O trabalho parou exatamente na fronteira
entre "o que o Claude pode fazer sozinho" e "o que exige uma conta/serviço
de terceiro":

**O primeiro (e único) checkpoint humano restante é a configuração dos
serviços externos** — Mercado Pago (conta, aplicação, credenciais de teste,
webhook) e Resend (conta, domínio verificado, API key). Nenhum deles pode
ser criado ou obtido por mim.

---

## 5. Próximas ações (ordem obrigatória)

1. Acessar o Mercado Pago Developers (<https://www.mercadopago.com.br/developers/panel>).
2. Criar uma aplicação (menu "Suas integrações").
3. Obter as credenciais **sandbox** (Access Token de teste + Public Key de teste).
4. Configurar as variáveis na Vercel (Production): `MERCADOPAGO_ACCESS_TOKEN`,
   `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`.
5. Configurar o webhook no painel do Mercado Pago (URL
   `https://cartas.anterosistemas.com.br/api/webhooks/mercadopago`, evento
   `payment`) e colar a assinatura secreta em `MERCADOPAGO_WEBHOOK_SECRET`.
6. Criar conta no Resend (<https://resend.com>).
7. Verificar um domínio de e-mail no Resend (sugestão: `cartas@anterosistemas.com.br`).
8. Configurar os registros DNS que o Resend fornecer na Cloudflare (ver
   seção 7 abaixo).
9. Criar a API Key no Resend.
10. Adicionar `RESEND_API_KEY` e `EMAIL_FROM` na Vercel (Production).
11. Trocar `PAYMENT_MODE=real` e `EMAIL_MODE=real` e fazer um novo deploy.
12. Rodar o smoke test sandbox completo (`docs/0006_Runbook_Producao.md`,
    seção 14: Pix e cartão de teste, webhook chegando, publicação única,
    e-mail entregue).
13. Validação completa (checklist da seção 9 abaixo).
14. **Só depois disso**, e só com autorização explícita, considerar
    credenciais reais (produção) — decisão separada, não automática.

---

## 6. Variáveis de ambiente

Só nome, finalidade e ambiente esperado — nenhum valor.

| Nome | Finalidade | Ambiente esperado |
|---|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Autentica as chamadas ao Mercado Pago (criar/consultar pagamento) | Production (sandbox primeiro, depois produção — nunca as duas ao mesmo tempo) |
| `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` | Inicializa o Payment Brick no navegador (tokenização de cartão) | Production (pública por natureza, vai ao bundle do cliente) |
| `MERCADOPAGO_WEBHOOK_SECRET` | Valida a assinatura das notificações de webhook | Production |
| `RESEND_API_KEY` | Autentica o envio de e-mail pela API do Resend | Production |
| `EMAIL_FROM` | Remetente completo do e-mail transacional (precisa de domínio verificado) | Production |
| `PAYMENT_MODE` | Alterna mock/real no servidor (já existe; hoje `mock`) | Production |
| `NEXT_PUBLIC_PAYMENT_MODE` | Espelho de UI de `PAYMENT_MODE` (já existe) | Production |
| `EMAIL_MODE` | Alterna mock/real no servidor (já existe; hoje `mock`) | Production |

Preview e Development continuam sem nenhuma dessas variáveis, mesmo padrão
já validado na Fase 2.5 — não copiar nenhuma credencial real para lá.

---

## 7. DNS

**Ainda depende do painel do Resend** — os registros exatos (nome, tipo,
valor, TTL) só existem depois de você adicionar o domínio lá. Não altero
DNS automaticamente; aguardo você aplicar na Cloudflare e confirmar.

Registros que **provavelmente** serão necessários (padrão do Resend,
conforme `docs/0006_Runbook_Producao.md`, seção 15):

| Tipo provável | Finalidade | Confirmação |
|---|---|---|
| `MX` | Recebimento de bounce/retorno no subdomínio de envio | painel do Resend |
| `TXT` (SPF) | Autoriza o Resend a enviar em nome do domínio | painel do Resend |
| `TXT` (DKIM) ou `CNAME` | Assinatura DKIM dos e-mails enviados | painel do Resend |
| `TXT` (DMARC), opcional | Política de DMARC | painel do Resend, se configurado |

O Mercado Pago **não exige** nenhuma alteração de DNS — o webhook é uma URL
já pública no próprio domínio (`/api/webhooks/mercadopago`), sem
configuração de zona DNS adicional.

---

## 8. Riscos conhecidos

- **Campos exatos da API do Mercado Pago não confirmados contra o sandbox
  real.** Foram conferidos contra documentação e código-fonte oficiais
  (não memória), mas só o primeiro teste sandbox confirma de verdade — é
  esperado precisar ajustar algum detalhe fino.
- **Payment Brick nunca rodou num navegador real.** Carregamento do script,
  inicialização, tokenização e `onSubmit` foram implementados a partir de
  exemplo oficial, mas sem execução ao vivo — primeira validação deve
  acontecer no smoke test sandbox.
- **Pix sem proteção contra duplo clique** (D63, risco aceito e documentado)
  — janela de corrida é de milissegundos, mitigada no front (botão
  desabilitado durante a criação), não à prova de todo cenário.
- **Rate limit por instância, não compartilhado** — mesma limitação já
  existente na busca do YouTube; Redis está fora do escopo desta fase.
- **Webhook nunca recebeu notificação real** — a validação de assinatura e
  a lógica de idempotência foram testadas com fixtures, não com uma
  notificação genuína do Mercado Pago.
- **Domínio de e-mail ainda não verificado** — até SPF/DKIM estarem
  corretos, qualquer envio real cairia em spam ou seria rejeitado.
- **Cartão de teste x cartão real**: use sempre cartões de teste do Mercado
  Pago em sandbox — nunca um cartão real, mesmo em ambiente de teste.

---

## 9. Critérios para considerar a Fase 3 concluída

### Sandbox (obrigatório antes de qualquer credencial real)

- [ ] Conta e aplicação do Mercado Pago criadas
- [ ] Credenciais sandbox configuradas na Vercel
- [ ] Webhook configurado e testado (evento real chega e é aceito)
- [ ] Pix de teste: QR Code gerado, aprovado via simulador, publicação única
- [ ] Cartão de teste: aprovado e recusado, ambos tratados corretamente
- [ ] Evento duplicado de webhook confirmado como no-op em sandbox real
- [ ] Conta Resend criada, domínio verificado (SPF/DKIM/DMARC)
- [ ] E-mail de teste entregue (fora da caixa de spam)
- [ ] Reprocessamento de e-mail testado (`scripts/reprocessFailedEmails.ts`)
- [ ] `RUN_DB_TESTS=true npm test` passando após qualquer ajuste de sandbox

### Produção (só depois do sandbox aprovado e com autorização explícita)

- [ ] Conta do Mercado Pago aprovada/homologada para produção
- [ ] Credenciais de produção configuradas (substituindo as de teste)
- [ ] `PAYMENT_MODE=real` e `EMAIL_MODE=real` em Production
- [ ] Mocks continuam bloqueados (`ALLOW_MOCK_PAYMENT_CONFIRMATION` ausente, `DEV_EMAILS_ENABLED=false`)
- [ ] Sentry ativo (já validado na Fase 2.5)
- [ ] Analytics ativo (já validado na Fase 2.5)
- [ ] Canal de suporte real definido (WhatsApp real, não `5599999999999`)
- [ ] Termos e privacidade revisados para venda real
- [ ] Valor dos planos confirmado com a Antero
- [ ] Uma compra real de valor baixo, feita por você, ponta a ponta, aprovada
- [ ] Handoff final da Fase 3 criado (novo documento, não este)

Só depois de todos os itens marcados: anunciar o produto como disponível.

---

## 10. Prompt de retomada

```text
Quero retomar a Fase 3 (Venda Real) do Antero Cartas exatamente de onde
paramos. Leia docs/0009_Handoff_Fase3_Parcial.md, docs/tasks/013_fase_3.md
e docs/0004_Decisions.md (seção Fase 3) antes de qualquer ação. Confirme o
estado atual no Git (branch, último commit, divergência com origin) e na
Vercel (último deployment, variáveis de Production — só nomes) antes de
prosseguir. Não repita trabalho já concluído.

Se eu já tiver configurado credenciais sandbox do Mercado Pago e/ou do
Resend na Vercel, confirme quais existem (sem exibir valores) e continue
pelo smoke test em sandbox (docs/0006_Runbook_Producao.md, seções 14 e 15).
Se ainda não configurei nada, apresente resumidamente o checkpoint pendente
e aguarde.

Não ative PAYMENT_MODE=real nem EMAIL_MODE=real em produção sem minha
autorização explícita. Não use credenciais de produção do Mercado Pago ou
do Resend sem autorização explícita separada da autorização de sandbox.
Não amplie o escopo da Fase 3. Continue fazendo commits pequenos, testes e
push normal a cada etapa concluída.
```
