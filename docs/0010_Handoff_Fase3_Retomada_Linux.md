# 0010 — Handoff de retomada · Fase 3 · migração para Linux · 2026-08-06

> Não substitui `docs/0009_Handoff_Fase3_Parcial.md` — complementa. Este
> documento registra a **reverificação do estado real** feita no ambiente
> Linux em 2026-08-06, rodando os comandos, lendo o código e comparando com
> o que a documentação afirmava.
>
> **Atualizado no mesmo dia**, depois da análise, com a normalização do pnpm
> e as duas correções do caminho do pagamento (seção 9).

---

## 1. Ambiente

| Item | Valor confirmado |
|---|---|
| Sistema | Linux (`Linux 7.0.0-29-generic`), shell `fish` |
| Diretório | `/home/david-no-linux/www/antero-cartas` |
| Node | v24.18.1 |
| npm / pnpm | 11.16.0 / 11.18.0 |
| Banco local | Supabase CLI via Docker, containers `supabase_*_antero-cartas` no ar, PostgreSQL em `127.0.0.1:54322` |
| Migrations | 2 encontradas, **"Database schema is up to date"** (`prisma migrate status`) |
| Vercel | **Não vinculada localmente** — não existe `.vercel/` e o CLI não está instalado (nem global, nem em devDependencies) |

## 2. Git

| Item | Valor |
|---|---|
| Branch | `master` (única) |
| Último commit | `6d7f155` — `config: ajuste nas regras do claude` (2026-08-02 20:00 -03) |
| Divergência com `origin/master` | nenhuma (`git rev-list --left-right --count` = `0 0`) |
| Working tree | limpo, exceto **2 arquivos não versionados**: `pnpm-lock.yaml`, `pnpm-workspace.yaml` |

Os dois commits mais recentes (`fcbd27c`, `6d7f155`) são de documentação e
configuração. O último commit de código-fonte continua sendo `5f9fc26`
(`test: confirm email delivery failure never undoes publication`), da Fase 3.

## 3. Estado validado nesta sessão (comandos executados agora)

| Comando | Resultado |
|---|---|
| `npm run lint` | limpo (exit 0) |
| `npm run typecheck` | limpo (exit 0) |
| `npm test` (sem banco) | **266 passando, 17 pulados** (33 arquivos passando, 2 pulados) |
| `RUN_DB_TESTS=true npm test` | **283/283 passando**, 35 arquivos |
| `npm run build` | limpo (exit 0), 26 rotas — incluindo `/api/webhooks/mercadopago`, `/api/orders/[id]/payments/pix` e `/payments/card` |
| `npx prisma migrate status` | schema em dia com o banco local |

Conclusão: **a migração Windows → Linux não quebrou nada.** O número de
testes bate exatamente com o que o handoff 0009 registrava (283).

## 4. Pendência de ambiente criada pela migração

- `node_modules/` contém **tanto** `.modules.yaml` (pnpm) **quanto**
  `.package-lock.json` (npm) — instalação mista.
- `package-lock.json` está **versionado**; `pnpm-lock.yaml` **não está**.
- `AGENTS.md` determina "This project uses pnpm. Never use npm or yarn."

Decisão de qual lockfile é o oficial ainda **não foi tomada** — é a única
pendência de ambiente aberta. Não é bloqueante para a Fase 3.

> Resolvida depois, ainda em 2026-08-06: pnpm oficializado em `b405d66`
> (seção 9).

## 5. O que a documentação afirmava e foi reconfirmado no código

Tudo o que o handoff 0009 lista como implementado **existe de verdade** e
está coberto por teste. Verificado arquivo por arquivo: provider do Mercado
Pago, mapeamento de status, assinatura do webhook, rota do webhook,
`applyMercadoPagoWebhook`, `finalizeOrderAsPaid`, rotas Pix/cartão, painéis
de checkout, provider Resend, `PaymentEvent`, `CHARGED_BACK`.

## 6. Lacunas encontradas na revisão de código (não estavam documentadas)

1. **Corrida no cartão** — `createCardPaymentAttempt`
   (`src/server/orderService.ts:261`) grava `status: "PENDING"`
   incondicionalmente **depois** da chamada ao Mercado Pago. Se o webhook de
   aprovação chegar nessa janela, a carta fica publicada com o pedido de
   volta em `PENDING`.
2. **CPF do pagador nunca é coletado** — `Order.customerDocument` existe e é
   lido (`orderService.ts:194,254`), mas nenhum caminho o escreve
   (`createOrderSchema` não tem o campo; o formulário de checkout também
   não). `payer.identification` sai sempre ausente para o Pix.
3. **`PaymentEvent` é gravado antes de aplicar a transição**
   (`orderService.ts:436`). Se a aplicação falhar depois disso, um reenvio
   com o mesmo id de notificação é classificado como `duplicate` e nunca é
   aplicado.
4. **Textos de "modo demonstração" fixos** — o checkout exibe "nenhuma
   cobrança real será feita" (`CheckoutClient.tsx:257`) e a tela de sucesso
   diz "Enviamos (modo demonstração) um e-mail" (`OrderSuccessClient.tsx:194`)
   mesmo com `PAYMENT_MODE=real`/`EMAIL_MODE=real`.
5. **Pix sem `date_of_expiration` explícito** — fica no padrão do Mercado
   Pago, e o painel formata a validade só com hora.
6. **Formato IPN antigo não é processado** — a rota lê `data.id`/`type`; uma
   notificação `?topic=payment&id=...` seria respondida 200 sem processar.
7. **`NEXT_PUBLIC_APP_URL` ainda aparece no `.env.example`** (linha 25),
   apesar de D54 tê-la removido do código.
8. **`NEXT_PUBLIC_WHATSAPP_SUPPORT` continua com o placeholder**
   `5599999999999` como padrão.

Nenhuma delas foi corrigida no momento desta análise. As lacunas **1 e 3**
foram corrigidas em seguida, ainda em 2026-08-06 — ver seção 9. As demais
continuam abertas.

## 7. Bloqueio real da fase (inalterado desde 2026-07-29)

Continua sendo o **checkpoint humano de credenciais**: conta e aplicação no
Mercado Pago (Access Token de teste, Public Key de teste, segredo do
webhook) e conta/domínio verificado no Resend. Nada disso existe no
`.env.local` local nem foi confirmado na Vercel nesta sessão (projeto não
vinculado localmente).

## 8. Próximo passo recomendado

**Corrigir a corrida do cartão e a ordem de gravação do `PaymentEvent`**
(itens 1 e 3 acima) — defeitos no caminho do dinheiro, independentes de
qualquer credencial, verificáveis com a suíte de integração já existente, e
que devem estar corretos antes do primeiro teste em sandbox para que uma
falha lá seja atribuída ao Mercado Pago e não a um bug conhecido nosso.

O item 2 (CPF) **não** deve ser implementado por antecipação: adicionar um
campo de CPF ao checkout custa conversão, e só a primeira chamada real em
sandbox confirma se o Mercado Pago exige `payer.identification` para Pix
nesta conta.

> Executado em seguida: `4eb7830` e `0763c76` (seção 9). O item 2 continua
> deliberadamente adiado.

> Executado: `4eb7830` e `0763c76` (seção 9).

## 9. Execução posterior — 2026-08-06 (mesma data)

Depois de aprovar a análise acima, você pediu a normalização do pnpm e as duas
primeiras correções. Estado atualizado:

| Item | Valor |
|---|---|
| Último commit | `0763c76` — `fix: allow a half-applied mercado pago webhook to be reprocessed` |
| Commits criados | `b405d66`, `4eb7830`, `0763c76` (nenhum push) |
| Migrations | **3** (nova: `20260806221907_phase3_payment_event_processed_at`, aditiva) |
| Suíte | **287/287** com banco (`RUN_DB_TESTS=true pnpm test`) |
| Gerenciador | **pnpm 11.18.0**, fixado em `packageManager` |

### O que mudou

1. **`b405d66` — pnpm oficial.** `packageManager` no `package.json`,
   `pnpm-lock.yaml` e `pnpm-workspace.yaml` versionados, `package-lock.json`
   removido, `node_modules` reinstalado só com pnpm. `pnpm-workspace.yaml` é
   necessário: carrega o `allowBuilds` do pnpm 11 (sem ele os scripts de
   instalação de `prisma`, `@prisma/engines`, `esbuild`, `sharp`,
   `@sentry/cli` e `unrs-resolver` ficam bloqueados e o `prisma generate`
   quebra). `dotenv` passou a ser devDependency declarada — era dependência
   fantasma que só resolvia pelo hoisting plano do npm. README e runbook
   passam a instruir pnpm.
2. **`4eb7830` — lacuna 1 da seção 6 corrigida.** `recordPaymentAttempt`
   substitui a escrita incondicional de `status: "PENDING"` por um
   `updateMany` condicional; um pedido já resolvido nunca regride.
3. **`0763c76` — lacuna 3 da seção 6 corrigida.** `PaymentEvent.processedAt`
   separa "notificação reservada" de "notificação aplicada"; um evento
   interrompido no meio volta a ser processável, e um concluído continua
   duplicado.

### Pendências abertas da seção 6

Lacunas **2, 4, 5, 6, 7 e 8 continuam em aberto** — nenhuma foi tocada. A 2
(CPF) segue deliberadamente adiada até o primeiro Pix em sandbox dizer se o
Mercado Pago exige `payer.identification`.

### Atenção para a ativação de produção

A migration nova precisa ser aplicada antes do deploy do código
(`pnpm db:migrate:deploy`, seção 6 do runbook). É aditiva e o backfill marca
os eventos antigos como concluídos, então rodar em produção é seguro mesmo
com o código antigo ainda no ar.

## 10. Prompt de retomada

```text
Retomando a Fase 3 do Antero Cartas. Leia docs/0010_Handoff_Fase3_Retomada_Linux.md,
docs/0009_Handoff_Fase3_Parcial.md e docs/tasks/013_fase_3.md antes de agir.
Confirme branch, último commit e estado do working tree no Git antes de
prosseguir. Ambiente Linux, banco local via Supabase CLI/Docker.

Se eu ainda não tiver configurado credenciais sandbox do Mercado Pago,
trabalhe apenas nas lacunas da seção 6 do handoff 0010, em ordem, com commit
atômico por item. Se eu já tiver configurado, confirme quais variáveis
existem (só nomes) e siga para o smoke test em sandbox
(docs/0006_Runbook_Producao.md, seções 14 e 15).

Não ative PAYMENT_MODE=real nem EMAIL_MODE=real em produção sem minha
autorização explícita. Não use credenciais de produção sem autorização
separada. Não faça push, merge nem deploy sem eu pedir.
```
