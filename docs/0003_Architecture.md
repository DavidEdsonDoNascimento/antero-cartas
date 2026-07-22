# 0003 — Architecture · Antero Cartas

## Stack
- **Next.js 16** (App Router) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4** (tokens via `@theme` em `globals.css`)
- `next/font` (Playfair Display, Inter, Dancing Script)
- **Prisma 7** + **PostgreSQL** (driver adapter `@prisma/adapter-pg` + `pg`)
- **Zod** — validação central das rotas
- **qrcode** — geração do QR Code da carta
- **Vitest** + **tsx** (dev) — testes e execução do seed
- Sem backend separado: as rotas server-side do Next atendem o MVP.

> **Nota Next 16**: `params`/`searchParams` são `Promise` e precisam de `await`.
> Componentes são Server por padrão; interatividade usa `"use client"`.

> **Nota Prisma 7**: o gerador é `prisma-client` (saída em `src/generated/prisma`,
> gitignored). As URLs de conexão **não** ficam mais em `schema.prisma` — ficam em
> `prisma.config.ts` (CLI) e são passadas via *driver adapter* no runtime
> (`src/lib/db.ts`), não mais por `datasource.url` implícito.

## Princípio: arquitetura proporcional
Sem microsserviços, filas ou abstrações complexas. Pagamento, e-mail e
armazenamento são expostos por **interfaces simples** para troca futura de
provedor (ver Fases 2 e 3).

## Estrutura de pastas
```
prisma/
  schema.prisma        Modelo de dados (Cart, CartMedia, Order, EmailDelivery)
  seed.ts              Seed de desenvolvimento (roda via tsx)
src/
  app/                 Rotas (App Router)
    page.tsx           Landing
    criar/             Fluxo de criação
    checkout/[cartId]/ Checkout (dados do comprador + pagamento mock)
    pedido/[orderId]/sucesso/  Página de sucesso
    c/[slug]/          Carta pública (noindex, Server Component)
    demonstracao/      Carta fictícia de demonstração
    termos/ privacidade/
    robots.ts          Bloqueia /c/ em buscas
    api/
      carts/                        POST cria rascunho
      carts/[id]/                   GET/PATCH rascunho (token de edição)
      carts/[id]/media/             POST upload de foto
      carts/[id]/media/[mediaId]/   DELETE remove foto
      carts/[id]/media/reorder/     POST reordena fotos
      media/[...path]/              serve os arquivos do storage local
      orders/                       POST cria pedido
      orders/[id]/                  GET status/resultado do pedido
      orders/[id]/mock-confirm/     POST confirma pagamento mock (idempotente)
      youtube/search/               busca de música (Fase 1.2)
      dev/emails/                   visualizador de e-mails mock (dev only)
  components/
    landing/           Seções da landing
    create/            Etapas do fluxo + orquestrador (CreateFlow)
    card/               Preview, carrossel, envelope/abertura
    checkout/           CheckoutClient (dados do comprador + pagamento mock)
    order/               OrderSuccessClient (página de sucesso)
    analytics/          TrackView
  config/              site, plans, flags, youtube  (fonte única de verdade)
  content/             recipients, occasions, themes, templates, faq,
                       testimonials, demoCart, mockMusic (dados centralizados)
  lib/                 types, storage (cache local), cartSession, api (cliente
                       HTTP), db, editToken, expiry, limits, imageMagic, slug,
                       youtube, image, counter, whatsapp, analytics
  server/              cartService, orderService, schemas (Zod), errors,
                       editTokenHeader, qrcode, rateLimit, youtubeSearch,
                       storage/ (StorageProvider), payment/, email/
  generated/prisma/    Cliente Prisma gerado (gitignored)
```

## Fluxo de dados (Fase 2)
- O **backend é a fonte da verdade**. `CreateFlow` guarda apenas `{cartId,
  editToken}` no navegador (`lib/cartSession.ts`, sem login) e conversa com a
  API via `lib/api.ts`.
- **Autosave**: debounce de 700ms envia o rascunho completo (campos de texto,
  tema, música, plano) via `PATCH /api/carts/[id]`; descarta respostas de
  requisições superadas por uma mais nova (proteção contra corrida) e usa
  `lib/storage.ts` só como **cache local de recuperação** (não fonte da verdade).
- **Fotos**: comprimidas no cliente (canvas → JPEG) e enviadas via
  `multipart/form-data` para `POST /api/carts/[id]/media`; o servidor valida de
  novo (magic bytes, tamanho, limite) e grava no `StorageProvider`.
- **Migração**: ao abrir `/criar` sem sessão de backend, um rascunho local da
  Fase 1 (se houver conteúdo) é enviado para `POST /api/carts` e suas fotos são
  reenviadas uma a uma (best-effort); só então o rascunho antigo é apagado.
- **Publicação**: acontece dentro da confirmação de pagamento (mock), numa
  transação que marca o pedido como pago e publica a carta atomicamente.
- **`/c/[slug]`** é um **Server Component** que lê direto do banco
  (`cartService.getPublicCart`) — sem round-trip de API pública nem client fetch.

## Modelo de dados (`prisma/schema.prisma`)
- **Cart** — conteúdo da carta, tema, música (achatada), contador, plano,
  status, slug, `editTokenHash` (nunca exposto ao cliente).
- **CartMedia** — fotos (posição, url, storageKey, mimeType, tamanho, dimensões).
- **Order** — pedido: comprador, plano, valor (definido pelo servidor), método,
  provedor, status, `paidAt`.
- **EmailDelivery** — outbox do e-mail mock; `@@unique([orderId, type])` garante
  um único envio por pedido mesmo sob confirmações concorrentes.
- Enums: `CartStatus`, `PlanType`, `MusicSource`, `OrderStatus`, `PaymentMethod`,
  `EmailStatus`. Índices em `Cart.status`, `Order.cartId`, `Order.status`,
  `Order.providerPaymentId` (único), `CartMedia.cartId`.
- `src/lib/cartMapping.ts` converte a linha do banco no `Cart` de domínio
  (`lib/types.ts`) usado pela UI — nunca inclui `editTokenHash`, pedidos ou
  dados do comprador.

## Autenticação do rascunho (sem login)
- Ao criar o rascunho, o servidor gera um **token de 256 bits**
  (`lib/editToken.ts`, `crypto.randomBytes`), guarda só o **hash SHA-256** no
  banco e devolve o token cru uma única vez.
- O token vive apenas no `localStorage` do navegador (`lib/cartSession.ts`) e é
  enviado no header `x-cart-edit-token` em toda requisição de edição.
- O servidor compara o hash com `timingSafeEqual` — nunca autoriza só pelo
  `cartId`. Nunca vai para a URL pública da carta.
- **Limitação documentada**: sem login, a edição só funciona no navegador onde
  a cartinha foi criada. Abrir o checkout em outro dispositivo mostra uma
  mensagem clara em vez de falhar silenciosamente.

## Provedores desacoplados (`src/server/*`)
- **StorageProvider** (`server/storage/`) — `put/delete/getPublicUrl/read`.
  Implementação **local (disco)** nesta fase, atrás da mesma interface que um
  provider S3/R2 usaria em produção. Upload passa pelo servidor Next
  (justificativa: sem infraestrutura S3 configurada neste ambiente; limitação
  de tamanho de payload e tempo de execução fica sujeita ao runtime/hospedagem).
- **PaymentProvider** (`server/payment/`) — `createPayment/getPaymentStatus`.
  Apenas `MockPaymentProvider` nesta fase; protegido por `PAYMENT_MODE=mock` **e**
  `ALLOW_MOCK_PAYMENT_CONFIRMATION=true` (bloqueado por padrão fora de dev).
- **EmailProvider** (`server/email/`) — `sendCartPublished`. Apenas
  `MockEmailProvider`: monta o e-mail (assunto/html/texto) mas não envia; o
  conteúdo é persistido em `EmailDelivery` e pode ser visto em
  `GET /api/dev/emails` (bloqueado em produção).

## Fluxo do pedido e idempotência
1. `POST /api/orders` — token de edição obrigatório; reaproveita um pedido
   `PENDING` existente da mesma carta (evita duplicar em duplo clique);
   **preço vem sempre de `config/plans.ts` no servidor**, nunca do cliente.
2. `POST /api/orders/[id]/mock-confirm` — usa `updateMany` condicional
   (`WHERE status = 'PENDING'`) como trava atômica: só um caller "vence" a
   corrida. Dentro de uma transação, marca o pedido como pago **e** publica a
   carta (slug + `expiresAt` + `PUBLISHED`). Chamadas repetidas devolvem o
   mesmo resultado sem duplicar nada.
3. Depois da transação: gera o QR Code (nunca bloqueia a publicação se falhar)
   e registra o e-mail mock em `EmailDelivery` (outbox), protegido pela
   constraint única `[orderId, type]`.
4. `GET /api/orders/[id]` é somente leitura e reaproveita a mesma lógica de
   montagem de resultado — usado pela página de sucesso para consultar o status
   (com polling curto enquanto `PENDING`) sem repetir a confirmação.

## Segurança
- **YouTube**: só URLs de hosts permitidos; ID validado por regex; nunca HTML
  de embed do usuário (`lib/youtube.ts`).
- **Imagens**: MIME real via magic bytes tanto no cliente quanto no **servidor**
  (`lib/imageMagic.ts`), sem SVG/executáveis, limite de tamanho, nomes não
  previsíveis (`carts/{cartId}/{uuid}.{ext}`, validados por `STORAGE_KEY_RE`
  contra path traversal antes de qualquer leitura/escrita em disco).
- **Slug**: alfabeto de 33 símbolos sem caracteres ambíguos, **≥128 bits de
  entropia** (26 caracteres, `lib/slug.ts`), único no banco.
- **Token de edição**: ver seção acima.
- **Preço**: sempre autoritativo no servidor; o cliente só escolhe o `planType`.
- **Cartas**: `noindex` + `robots.ts`, sem galeria pública; a rota pública
  nunca retorna token, pedido ou dados do comprador.
- **Analytics**: nunca inclui dados pessoais, conteúdo da carta ou termo pesquisado.

## Configuração
Marca, copy, preços e flags ficam em `src/config/*` e são sobrescrevíveis por
variáveis `NEXT_PUBLIC_*` (ver `.env.example`). Nada de preço hardcoded nos
componentes.

## Busca de música (Fase 1.2)
- **Rota**: `src/app/api/youtube/search/route.ts` (`GET`), `force-dynamic`.
  Valida o termo, aplica rate limiting leve e devolve erros num formato consistente
  `{ error: { code, message } }`. Só expõe o formato interno, nunca a resposta bruta.
- **Serviço server-only**: `src/server/youtubeSearch.ts` lê `YOUTUBE_*` (sem
  `NEXT_PUBLIC_`), com modos **mock/real/disabled**, cache em memória por termo
  (TTL configurável, por instância), timeout via `AbortController` e mapeamento de
  erros (`missing_key`, `quota_exceeded`, `timeout`, `upstream_error`).
- **Funções puras**: `src/lib/music.ts` — normalização/validação do termo,
  transformação da resposta, `SelectedMusic`, migração do formato antigo.
- **Cliente**: `src/components/create/MusicPicker.tsx` — busca (debounce,
  dedupe, `AbortController`) + colar link; `src/config/youtube.ts` expõe apenas a
  flag booleana de UI. A chave nunca chega ao cliente.
- **Cache**: em memória, **por instância**, perdido em reinicializações; não
  substitui Redis/cache compartilhado em produção — suficiente para o protótipo.
- **Rate limiting**: `src/lib/rateLimit.ts` — abstração + implementação em memória
  best-effort (por instância). Produção deve usar store compartilhado atrás da
  mesma interface.

## Testes
- **Vitest** (`vitest.config.ts`, alias `@`, carrega `.env.local`), `npm test`.
- **Unitários** (rodam sempre, sem banco): música (Fase 1.2), token de edição,
  slug/entropia, cálculo de expiração, magic bytes de imagem, mapeamento
  `dbToDomainCart`, schemas Zod, geração de QR Code, regex de chave de storage,
  preços dos planos.
- **Integração** (`server/phase2.integration.test.ts`) — usam Prisma real;
  ficam **desligados por padrão** e só rodam com opt-in explícito:
  `RUN_DB_TESTS=true npm test`. Cobrem: criar/atualizar rascunho com token,
  rejeitar token inválido, limite de 6 fotos, reordenação, persistência da
  música, preço definido pelo servidor, fluxo completo de confirmação mock
  idempotente + publicação + consulta pública + e-mail único, carta expirada,
  confirmação de falha/expiração. Cada teste limpa os próprios dados ao final.
  **Nunca aponte para um banco de produção** — use um banco/branch de teste.
