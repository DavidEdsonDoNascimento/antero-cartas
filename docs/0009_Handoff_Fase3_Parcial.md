# 0009 — Handoff parcial · Fase 3 (Venda Real) · 2026-07-29

> Handoff **parcial** — criado ao chegar no primeiro checkpoint humano real
> da Fase 3 (task `docs/tasks/013_fase_3.md`), conforme pedido na seção 21.
> Não é o handoff final da fase: falta a validação em sandbox e a ativação
> de produção, que dependem de você.

## 1. Resumo

Todo o trabalho de **código, testes e documentação** da Fase 3 que não
depende de conta/credencial externa está concluído. Nada foi ativado:
produção continua em `PAYMENT_MODE=mock`/`EMAIL_MODE=mock`, sem nenhuma
credencial do Mercado Pago ou do Resend configurada.

## 2. Estado atual

| Item | Estado |
|---|---|
| Branch | `master`, sincronizado com `origin/master` |
| Working tree | limpo |
| Último commit | `7bf7953` — `docs: document phase 3 architecture, env vars, and production activation` |
| Deploy de produção | `dpl_79w8es4ruNHwQSc524W1pG4nk4kq`, `Ready`, servindo `cartas.anterosistemas.com.br` |
| Testes | `RUN_DB_TESTS=true npm test`: **283/283 passando** |
| `lint`/`typecheck`/`build` | limpos |
| Mocks em produção | continuam bloqueados (`ALLOW_MOCK_PAYMENT_CONFIRMATION` ausente, `DEV_EMAILS_ENABLED=false`) — confirmado ao vivo |
| Webhook do Mercado Pago | rota existe, responde 401 sem assinatura configurada (fail-closed) — confirmado ao vivo |
| Credenciais reais | nenhuma configurada (Mercado Pago ou Resend) |

## 3. O que foi implementado

- **Schema**: `OrderStatus.CHARGED_BACK` + modelo `PaymentEvent` (migration
  aditiva, aplicada localmente).
- **`RealPaymentProvider`** (Mercado Pago): Pix e cartão, via `fetch`, sem
  SDK no servidor. Preço/plano/moeda sempre calculados no servidor.
- **Webhook** (`POST /api/webhooks/mercadopago`): única fonte de verdade
  para aprovação; assinatura validada (HMAC-SHA256 sobre o manifest
  documentado pelo Mercado Pago); idempotente por `PaymentEvent`; tolera
  duplicado, fora de ordem, tentativa superada e pedido desconhecido.
- **Rotas de tentativa de pagamento**: `POST /api/orders/[id]/payments/pix`
  e `/payments/card`, autorizadas pelo mesmo token de edição do rascunho.
- **Frontend**: seletor Pix/cartão no checkout, painel Pix (QR + copia-e-
  cola + polling limitado), painel de cartão (Payment Brick do Mercado Pago,
  token nunca passa pelo servidor). Tela de sucesso trata todos os estados
  (`PENDING`/`PAID`/`FAILED`/`CANCELLED`/`EXPIRED`/`REFUNDED`/`CHARGED_BACK`).
- **`RealEmailProvider`** (Resend): mesmo template do mock (compartilhado,
  nunca diverge), inclui link de suporte e aviso para guardar o link.
- **Reprocessamento de e-mail**: `scripts/reprocessFailedEmails.ts`, seguro
  por padrão (dry run), até 5 tentativas.
- **Segurança**: rate limit básico nas rotas de pedido/pagamento; CSP libera
  os domínios do Payment Brick só quando `PAYMENT_MODE=real`; nenhum dado
  sensível de pagamento é logado ou enviado ao Sentry/analytics.
- **Testes**: 72 novos (211 → 283), cobrindo especificamente idempotência,
  eventos fora de ordem, tentativa superada, pedido desconhecido, todos os
  estados de pagamento, e que falha de e-mail nunca desfaz publicação.
- **Documentação**: `docs/0004_Decisions.md` (D60–D66), `docs/0005_ChangeLog.md`,
  `docs/0006_Runbook_Producao.md` (seções 14–17: Mercado Pago, Resend,
  checklist de ativação, rollback), `.env.example`, `README.md`.

Detalhes completos de cada decisão estão nos commits individuais (`git log
90873b7..7bf7953`) e em `docs/0004_Decisions.md`.

## 4. O que falta (depende de você)

Nenhum destes bloqueia porque falta código — todos dependem de conta,
credencial ou configuração externa que só você pode prover:

1. **Criar/autenticar a conta do Mercado Pago** e criar uma aplicação no
   painel de desenvolvedores.
2. **Obter as credenciais de TESTE (sandbox)**: `Access Token` e
   `Public Key`. Cole diretamente na Vercel — não preciso ver o valor.
3. **Configurar o webhook** no painel do Mercado Pago apontando para
   `https://cartas.anterosistemas.com.br/api/webhooks/mercadopago`, evento
   `payment`, e copiar a assinatura secreta (`MERCADOPAGO_WEBHOOK_SECRET`).
4. **Criar/autenticar a conta do Resend.**
5. **Verificar um domínio de e-mail** (sugestão: `cartas@anterosistemas.com.br`)
   — o Resend fornece os registros DNS exatos; eu não altero DNS sozinho.
6. **Obter a API key do Resend** (`RESEND_API_KEY`) e definir `EMAIL_FROM`.

Instruções passo a passo de cada um estão em `docs/0006_Runbook_Producao.md`,
seções 14 e 15.

## 5. Depois que as credenciais de teste existirem

1. Configurar as variáveis na Vercel (Production): `MERCADOPAGO_ACCESS_TOKEN`,
   `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`,
   `RESEND_API_KEY`, `EMAIL_FROM`, e trocar `PAYMENT_MODE=real`/`EMAIL_MODE=real`.
2. Novo deploy.
3. Rodar o smoke test sandbox completo (`docs/0006_Runbook_Producao.md`,
   seção 14 — Pix e cartão de teste, webhook chegando, publicação única).
4. Validar o e-mail real chegando (seção 15).
5. Só depois disso, com autorização explícita, seguir o checklist de
   ativação de produção (seção 16) — que é uma decisão separada, com um
   valor real cobrado por você mesmo antes de qualquer anúncio.

## 6. Riscos e limitações já registrados

- Pix não tem proteção contra duplo clique (D63) — risco aceito, mitigado no
  front, documentado.
- Rate limit é por instância, não compartilhado (mesma limitação já
  conhecida da busca do YouTube).
- Campos exatos da API do Mercado Pago foram conferidos contra documentação
  e código-fonte reais, mas só o sandbox real confirma de verdade — é
  esperado ajustar algum detalhe fino na primeira validação.

## 7. Como retomar

Leia este arquivo, `docs/tasks/013_fase_3.md` e `docs/0004_Decisions.md`
(seção Fase 3). Confirme o estado no Git e na Vercel antes de continuar.
Quando as credenciais de sandbox existirem, comece pelo item 1 da seção 5
acima.
