# Task 014 — Cobrança aberta e retomada do Pix

| Campo | Valor |
|---|---|
| **Status** | `DEFERRED` |
| **Prioridade** | `MÉDIA` (contém subtarefa `ALTA` — ver seção 1) |
| **Decisão** | Adiado para priorizar o refinamento visual e a validação comercial da V1 |
| **Risco aceito** | Sim, temporariamente, com gatilhos de retomada definidos (seção 7) |
| **Última revisão** | 2026-08-30 |
| **Base analisada** | `master` @ `20c67c6` (inclui `84fa58b fix: derive published plan from paid order`) |

Handoff autossuficiente: tudo o que é necessário para retomar está aqui. As
referências de arquivo citam **funções e constantes**, não apenas linhas —
números de linha mudam, nomes duram mais. Todos os fatos marcados como
*confirmado* foram reproduzidos em banco local com provider **mock**; nenhum
pagamento real foi criado para produzir este documento.

---

## 1. Subtarefa de prioridade ALTA — antes de qualquer divulgação

> **Corrigir a regra que derruba a cartinha quando uma cobrança duplicada é
> estornada.** O acesso público deve ser preservado enquanto existir pelo
> menos um pedido `PAID` para aquela cartinha.

**Onde:** `findReversedOrderStatus` em `src/server/cartService.ts` (usada por
`getPublicCart`).

**O que ela faz hoje:** busca o pedido resolvido **mais recente** da cartinha
(`status IN (PAID, REFUNDED, CHARGED_BACK)`, ordenado por `paidAt desc`) e
revoga o acesso se esse pedido não estiver `PAID`. Para uma cartinha com um
único pedido isso está correto — foi uma correção deliberada, para que uma
compra estornada não continuasse acessível para sempre.

**Por que quebra com duplicata:** havendo dois pedidos pagos, estornar o
**mais recente** (que é o gesto natural — "estornar a cobrança duplicada")
faz a regra enxergar `REFUNDED` como o estado corrente e `getPublicCart`
passa a devolver `not_found`. O cliente perde a cartinha que pagou
legitimamente. *Confirmado em banco local.*

**Correção pretendida:** revogar somente quando **nenhum** pedido `PAID`
restar para a cartinha, em vez de olhar apenas o mais recente.

### Observação operacional (enquanto a correção não existir)

- Não estornar uma possível duplicata sem antes **verificar os pedidos daquela
  cartinha**.
- Confirmar que **sobra pelo menos um pedido `PAID`** depois do estorno.
- Estar ciente de que, hoje, o estorno pode **tirar a cartinha do ar**.

Isto é uma nota de cautela, não um procedimento financeiro. Nenhuma
automação é prevista aqui.

---

## 2. Comportamento atual — cobranças duplicadas

Tudo nesta seção é comportamento **confirmado** do código em `20c67c6`.

- **Mesmo plano reaproveita o pedido.** `createOrder`
  (`src/server/orderService.ts`) devolve o pedido `PENDING` existente quando o
  `planType` recebido é igual ao dele. Repetir o checkout, recarregar a página
  ou tentar de novo **não** cria cobrança nova.
- **Trocar de plano depois de gerar cobrança pode criar um segundo pedido.**
  Com plano diferente, o atalho de reuso não se aplica e um novo `Order` é
  criado, sobrescrevendo `Cart.planType`. Passam a existir dois `PENDING` para
  a mesma cartinha, cada um com seu valor.
- **As duas cobranças podem chegar a `PAID`.** Nenhuma constraint impede: em
  `prisma/schema.prisma`, `Order.cartId` tem apenas `@@index`, sem unicidade.
  A guarda por cartinha que existe em `createOrder` só bloqueia a criação de
  um **novo** pedido quando já há um `PAID` — ela não impede que dois pedidos
  criados antes disso sejam pagos depois.
- **Quem paga primeiro define o plano publicado.** A publicação usa o
  `Order.planType` do pedido que está sendo finalizado; o segundo pagamento
  encontra a cartinha já publicada.
- **O segundo pagamento não altera a cartinha, mas dispara outro e-mail.** O
  guard idempotente de `publishCartWithClient` preserva `planType`, `slug`,
  `expiresAt` e `publishedAt`. Já o outbox de e-mail é único por
  `[orderId, type]` (`EmailDelivery`), e o `orderId` é outro — então um
  segundo e-mail de confirmação é enviado, descrevendo o plano do **primeiro**
  pagamento.
- **Não existe detecção automática.** Nenhum log, alerta ou métrica distingue
  esse caso. Para o webhook, o desfecho é um `applied/PAID` comum. O Sentry só
  captura exceções, e aqui nada é lançado.
- **Estornar a duplicata pode derrubar a cartinha.** Ver seção 1.

### Alcance do problema

O gatilho é único e específico: **trocar de plano depois de ter gerado uma
cobrança**. Fora disso o sistema está protegido — as guardas de idempotência e
a exclusão mútua entre Pix e cartão funcionam bem, mas todas operam **por
pedido** (`where: { id: orderId }`), nunca por cartinha. É exatamente por isso
que dois pedidos distintos da mesma cartinha não se enxergam.

---

## 3. Comportamento atual — Pix e sua exibição

- **O contador do Pix não existe.** Não há componente de contagem regressiva
  em lugar nenhum do projeto. Os únicos temporizadores existentes são o
  contador de "tempo juntos" da cartinha publicada e o carrossel de fotos —
  ambos sem relação com pagamento.
- **A UI mostra apenas `Válido até HH:MM:SS`, de forma estática.** Em
  `PixPaymentPanel`, uma linha condicional formata o instante de vencimento
  uma única vez, com `toLocaleTimeString`. Nada é recalculado depois. Como
  exibe **só o horário, sem a data**, uma cobrança que vence no dia seguinte
  aparece como se vencesse hoje.
- **A validade observada no sandbox é de 24 horas.** Quatro cobranças reais
  registradas no banco local (agosto/2026) tinham exatamente 1440 minutos entre
  criação e vencimento. O projeto **não envia** `date_of_expiration`, então
  quem define o prazo é o Mercado Pago.
- **O QR some da tela após cinco minutos.** `POLL_TIMEOUT_MS` em
  `PixPaymentPanel` vale 5 minutos; esgotado o polling, o painel troca para o
  passo `timeout`, que **não renderiza QR Code nem copia-e-cola** — embora a
  cobrança siga válida por mais ~23h55. Há um botão "Verificar novamente" que
  devolve ao passo anterior e traz o QR de volta, mas seu rótulo sugere
  consultar o pagamento, não recuperar o código.
- **Depois da expiração, a tela não muda sozinha.** Passadas as 24 horas, o
  painel continua exibindo QR, copia-e-cola e "Aguardando confirmação do
  pagamento…" para uma cobrança que o provedor já expirou.
- **`pixExpiresAt = null` é tratado como cobrança ocupada indefinidamente.**
  É um valor possível (o provedor pode não devolver validade). Nesse caso
  `isPixBusy` e `reusablePix` consideram o Pix vivo para sempre: o outro método
  fica bloqueado e o mesmo QR é reapresentado indefinidamente. Na UI, a linha
  de validade simplesmente não aparece — não há `NaN`.

---

## 4. Retomada do Pix — o que já existe

Este é o achado que torna a tarefa mais barata do que parece.

- **O backend já reapresenta o Pix existente.** `claimOrReusePixAttempt`
  (`src/server/orderService.ts`) devolve o Pix já gravado quando ele ainda é
  válido, **sem chamar o provedor**.
- **`POST /api/orders/[id]/payments/pix` reutiliza QR Code e copia-e-cola.** O
  nome da rota é "criar", mas o comportamento real é "criar **ou** recuperar".
  Chamá-la novamente é seguro e não gera segunda cobrança.
- **Não precisa de endpoint novo nem de migration.** Tudo o que a retomada
  precisa já está persistido em `Order`: `pixQrCode`, `pixQrCodeBase64`,
  `pixExpiresAt`, `planType`, `amount`.
- **Falta persistir o `orderId` na sessão do navegador.** `CartSession`
  (`src/lib/cartSession.ts`) guarda apenas `{ cartId, editToken }`. Sem o
  `orderId`, ao recarregar o checkout o cliente volta ao formulário e precisa
  preencher nome e e-mail de novo — e só então recai no mesmo pedido.
- **Falta uma resposta de conflito estruturada.** `ApiClientError`
  (`src/lib/api.ts`) preserva apenas `code`, `message` e `status`, descartando
  campos extras do corpo do erro. Para a tela exibir plano, valor e validade da
  cobrança aberta, o erro precisa carregar dados.
- **Falta a tela "Continuar com este Pix".** Hoje não há nenhuma superfície que
  informe "você já tem uma cobrança aberta". O caso análogo do cartão (409)
  já é tratado como "esperar é a ação certa", mas renderiza somente um
  parágrafo, sem status nem saída.

**Classificação do esforço:** a retomada em si é **simples e localizada** — o
servidor já faz o trabalho, a autorização por token de edição já existe e nada
novo é persistido no servidor. O que eleva o frontend a **moderado** é
acrescentar contador ao vivo e estado de expirado, que são componentes novos,
com testes de tempo, sem precedente no projeto.

---

## 5. Solução recomendada — dois PRs

### PR de backend

1. **Guarda de cobrança viva por cartinha.** Antes de criar um segundo pedido,
   verificar se outro pedido `PENDING` da **mesma cartinha** tem cobrança viva
   ou ambígua — a mesma pergunta que `isPixBusy`/`isCardBusy` já respondem,
   aplicada ao conjunto de pedidos da cartinha em vez de a um único. Havendo,
   recusar com `conflict`.
2. **Payload estruturado com a cobrança existente:** `orderId`, plano, valor e
   `pixExpiresAt`, para que o frontend consiga oferecer a retomada.
3. **Correção da regra de acesso após `REFUNDED`/`CHARGED_BACK`** — a
   subtarefa `ALTA` da seção 1.
4. **Log estruturado** quando um pagamento aprovado encontra a cartinha **já
   publicada por outro pedido**. Não previne nada; transforma um incidente hoje
   invisível numa linha pesquisável.
5. **Configuração de expiração do Pix** (`date_of_expiration`), **somente após
   prova no sandbox** — ver seção 6.

O payload estruturado fica no PR de backend de propósito: é o contrato que o
PR de frontend consome, e defini-lo junto da guarda evita mexer duas vezes na
mesma função.

### PR de frontend

1. Persistir `orderId` na sessão do navegador (campo opcional, retrocompatível).
2. Tela de cobrança existente, com plano, valor e validade.
3. Botão **"Continuar com este Pix"**, reaproveitando o painel atual.
4. **Contador baseado em timestamp absoluto** — nunca decremento de um número,
   para sobreviver a aba em segundo plano, timers reduzidos e suspensão.
5. Estado **expirado**: esconder QR e copia-e-cola, oferecer nova cobrança.
6. QR e copia-e-cola visíveis **durante toda a validade** da cobrança.
7. Revisão do timeout de polling, que hoje esconde o QR aos cinco minutos.
8. Exibição de **data e hora completas**, não apenas o horário.

### Sequenciamento

Os dois PRs são independentes e o de backend tem valor de segurança próprio.
Mas **não deixe o backend sozinho em produção por muito tempo**: sem a tela de
retomada e sem prazo reduzido, a guarda entrega um beco sem saída de até 24
horas para quem trocar de plano. Se for necessário publicar só o backend,
então a redução do prazo do Pix **precisa** ir junto nele.

---

## 6. Decisões de produto

- **Não permitir uma segunda cobrança viva** para a mesma cartinha.
- **Não cancelar Pix somente no banco.** É ativamente perigoso: a transição
  `CANCELLED → PAID` não é aplicada (`shouldApplyTransition`,
  `src/server/payment/mercadoPagoStatus.ts`). Se marcarmos `CANCELLED`
  localmente e o cliente pagar o Pix — que continua vivo no provedor — o
  webhook de aprovação é descartado: dinheiro recebido, cartinha nunca
  publicada, nenhum alerta.
- **Não implementar cancelamento nem reembolso automático na V1.** A interface
  `PaymentProvider` expõe apenas `createPayment` e `getPaymentStatus`; o
  adapter do Mercado Pago implementa somente criar e consultar. Cancelar
  exigiria método novo na interface, no adapter e no mock. Além disso, estorno
  automático hoje dispararia a revogação descrita na seção 1.
- **Não trocar instantaneamente de método** enquanto outra cobrança estiver
  viva.
- **Prazo desejado do Pix: 30 minutos**, sujeito a confirmação.
- **3 minutos foi descartado** por ser curto demais para o cliente concluir o
  pagamento.
- **10 minutos não foi comprovado como suportado.** O único mínimo oficial
  encontrado é de **30 minutos**, e vem da documentação da Orders API — não da
  Payments API usada aqui.
- **A Payments API atual usa `POST /v1/payments`** (`API_BASE` +
  `/v1/payments` em `src/server/payment/mercadopago.ts`), com campo
  `date_of_expiration` em timestamp ISO 8601. A documentação atual do Mercado
  Pago para Pix migrou para a **Orders API** (`/v1/orders`, campo
  `expiration_time`, em duração ISO 8601) — endpoint e campo **diferentes** dos
  que o projeto usa. A referência oficial de `/v1/payments` não pôde ser
  recuperada.
- **O suporte a 30 minutos precisa ser comprovado** com **uma criação de Pix
  não paga no sandbox**, antes de projetar qualquer coisa em cima disso.
- **Se 30 minutos não for aceito**, manter as 24 horas atuais e publicar o
  backend e a retomada **juntos** — porque aí o beco sem saída da guarda
  isolada duraria um dia inteiro.

### Fato confirmado versus decisão futura

| Item | Situação |
|---|---|
| Padrão de 24h no `/v1/payments` | **Confirmado** por dados locais (4 de 4 cobranças, 1440 min) |
| Projeto não envia `date_of_expiration` | **Confirmado** por leitura do adapter |
| Mínimo de 30 min | **Não comprovado** para `/v1/payments` (fonte é da Orders API) |
| `/v1/payments` aceitar `date_of_expiration` | **Não comprovado** oficialmente |
| Adotar 30 minutos | **Decisão futura**, condicionada à prova no sandbox |

---

## 7. Gatilhos de retomada

Retomar quando ocorrer **o primeiro** destes eventos:

1. **Antes de investir em anúncios.**
2. **Ao atingir as primeiras 10 vendas.**
3. **Ao detectar ou receber relato de cobrança duplicada.**
4. **Antes de implementar o upgrade de Essencial para Para Sempre** — esse
   fluxo cria, por natureza, uma segunda cobrança para a mesma cartinha e
   colide de frente com esta pendência.
5. **Antes de aumentar significativamente o tráfego.**

A subtarefa `ALTA` da seção 1 tem gatilho próprio e mais cedo: **antes de
qualquer divulgação comercial.**

---

## 8. Critérios de aceite futuros

### Backend

- Criar um segundo pedido com plano diferente é **recusado** enquanto houver
  cobrança viva ou ambígua na mesma cartinha.
- A recusa devolve payload estruturado com `orderId`, plano, valor e
  `pixExpiresAt` da cobrança aberta.
- Trocar de plano **sem** cobrança viva **continua permitido** — a jornada
  legítima de voltar etapas não pode regredir.
- Um Pix **vencido** deixa de bloquear e libera a troca de plano.
- Nenhum pedido é cancelado automaticamente; nenhuma chamada de cancelamento
  ou estorno é feita ao provedor.

### Acesso após estorno

- Cartinha com dois pedidos resolvidos, sendo um estornado e **um ainda
  `PAID`**, **continua acessível**.
- Cartinha cujo **único** pedido foi estornado ou sofreu chargeback **continua
  bloqueada** (não regredir a proteção existente).

### Frontend e Pix

- Recarregar o checkout com cobrança aberta leva à tela de retomada, **sem
  refazer o formulário** de nome e e-mail.
- "Continuar com este Pix" reapresenta **o mesmo QR Code**, sem gerar segunda
  cobrança — verificável por ausência de nova chamada de criação ao provedor.
- Contador derivado de **timestamp absoluto**: permanece correto após aba em
  segundo plano, suspensão do computador e recarregamento.
- Cobrança **vencida** esconde QR e copia-e-cola e oferece nova cobrança.
- `pixExpiresAt = null` não quebra a tela e não exibe `NaN`.
- QR e copia-e-cola permanecem acessíveis **durante toda a validade** — o
  timeout de polling não os remove.
- A validade é exibida com **data e hora**.

### Testes necessários

**Backend (integração, banco local):** recusa com cobrança viva; permissão sem
cobrança viva; liberação após vencimento; payload de conflito correto; cartinha
com dois resolvidos e um `PAID` continua acessível; cartinha com único pedido
estornado continua bloqueada; envio de `date_of_expiration` no corpo (asserção
sobre o `fetch` falso, como já se faz nos testes do adapter).

**Frontend (componente):** conflito renderiza plano, valor e validade;
"Continuar com este Pix" não dispara segunda criação; `expiresAt` no passado
esconde QR; `expiresAt` nulo não quebra; contador com relógio falso, cobrindo
salto de tempo e aba inativa.

> **Lacuna atual a corrigir junto:** todos os stubs de Pix da suíte usam
> `expiresAt: null`. Nenhum teste hoje exercita uma validade real — qualquer
> trabalho nesta área deveria começar por aí.

---

## 9. Referências de código

Números de linha **mudam**; os nomes abaixo são o que deve ser procurado.

| Assunto | Arquivo | Símbolo |
|---|---|---|
| Reuso do pedido por plano; guarda de pedido já pago | `src/server/orderService.ts` | `createOrder` |
| Reapresentação do Pix existente | `src/server/orderService.ts` | `claimOrReusePixAttempt`, `reusablePix` |
| Exclusão mútua Pix × cartão (escopo por pedido) | `src/server/orderService.ts` | `isPixBusy`, `isCardBusy`, `pixBusyWhere`, `cardBusyWhere` |
| Finalização e publicação do pagamento | `src/server/orderService.ts` | `finalizeOrderAsPaid` |
| E-mail de confirmação (outbox por pedido) | `src/server/orderService.ts` | `deliverPublishedEmail` |
| Guard idempotente da publicação | `src/server/cartService.ts` | `publishCartWithClient` |
| **Regra de acesso após estorno (subtarefa ALTA)** | `src/server/cartService.ts` | `findReversedOrderStatus`, `getPublicCart` |
| Transições de status do provedor | `src/server/payment/mercadoPagoStatus.ts` | `shouldApplyTransition` |
| Interface do provedor (sem cancelar/estornar) | `src/server/payment/PaymentProvider.ts` | `PaymentProvider` |
| Criação do Pix; ausência de `date_of_expiration` | `src/server/payment/mercadopago.ts` | `createPayment` (ramo `PIX`), `API_BASE` |
| Painel do Pix, timeout e linha de validade | `src/components/checkout/PixPaymentPanel.tsx` | `POLL_TIMEOUT_MS`, passo `timeout` |
| Máquina de estados do checkout | `src/components/checkout/CheckoutClient.tsx` | `CheckoutClient` |
| Sessão do navegador (falta `orderId`) | `src/lib/cartSession.ts` | `CartSession` |
| Erro de API (descarta campos extras) | `src/lib/api.ts` | `ApiClientError` |
| Ausência de unicidade por cartinha | `prisma/schema.prisma` | `model Order` (`@@index([cartId])`) |
| Unicidade do e-mail por pedido | `prisma/schema.prisma` | `model EmailDelivery` (`@@unique([orderId, type])`) |
