# Handoff — Antero Cartas (fim da Fase 2)

> **Data:** 2026-07-22
> **Objetivo deste documento:** permitir retomar o desenvolvimento amanhã, em uma
> nova conversa, apenas lendo este arquivo. Resume o estado técnico completo do
> projeto ao fim da Fase 2.
> **Como retomar:** peça "leia `docs/tasks/007_handoff_fase2.md`" e siga a seção 15.

---

## 1. Visão geral

- **Produto:** **Antero Cartas** — produto digital da Antero Sistemas que permite criar uma **cartinha digital** para surpreender alguém especial.
- **Proposta:** a pessoa monta em ~3 minutos uma carta com título, mensagem, até 6 fotos, música do YouTube, contador de tempo juntos e tema visual. A carta é acessível por um **link privado** que abre no celular como um **envelope** que se abre com a música tocando. Sem app, sem cadastro.
- **Público-alvo:** pessoas que querem presentear namorado(a), esposo(a), mãe, pai, filho(a), amigo(a), familiares, professores — em ocasiões como declaração, aniversário, Dia das Mães/Pais, agradecimento etc. Perfil majoritariamente **mobile**.
- **Monetização:** **pagamento único por cartinha** (sem mensalidade). Dois planos: **Essencial** (365 dias, R$ 18,90) e **Para Sempre** (sem expiração, R$ 48,90) — preços provisórios/configuráveis.
- **Status atual do MVP:** **Fase 2 concluída e validada em runtime** contra banco real (Supabase). O produto cria, persiste, publica e abre cartas em qualquer dispositivo, com pagamento **mock** (nenhuma cobrança real). Próximo grande marco: **Fase 3 — venda real** (Pix/cartão + webhook + e-mail transacional).

---

## 2. Arquitetura atual

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict** + **Tailwind CSS v4** (tokens em `globals.css`). Sem backend separado: as rotas server-side do Next atendem tudo.
- **Prisma 7** + **PostgreSQL (Supabase)**. Convenções da v7: gerador `prisma-client` (saída em `src/generated/prisma`, gitignored, TS puro); URLs de conexão **não** ficam no `schema.prisma` — ficam em `prisma.config.ts` (CLI) e são passadas via **driver adapter** `@prisma/adapter-pg` no runtime (`src/lib/db.ts`).
- **Storage:** interface `StorageProvider` com implementação **em disco local** (`.data/uploads`), servida pela rota `/api/media/[...path]`. Decisão explícita da Fase 2 (ver seção 6).
- **Providers desacoplados** (todos atrás de interface, trocáveis por env):
  - `StorageProvider` → `createLocalDiskStorage` (disco local).
  - `PaymentProvider` → `MockPaymentProvider` (só mock nesta fase).
  - `EmailProvider` → `MockEmailProvider` (monta o e-mail, não envia).
- **APIs (11 rotas em `src/app/api`):** criação/edição de rascunho, upload/remoção/reordenação de fotos, serviço de arquivos, criação de pedido, status do pedido, confirmação mock, busca de música no YouTube, visualizador de e-mails (dev).
- **Entidades (Prisma):** `Cart`, `CartMedia`, `Order`, `EmailDelivery`.
- **Serviços (`src/server`):** `cartService` (rascunho, mídia, publicação, rota pública), `orderService` (pedido, confirmação mock idempotente, outbox de e-mail), `youtubeSearch`, `qrcode`, `editToken`, `rateLimit`, `schemas` (Zod), `errors`.
- **Fluxo da aplicação:** cliente guarda só `{cartId, editToken}` no `localStorage`; o **backend é a fonte da verdade**. Autosave via `PATCH`, upload via `multipart/form-data`, publicação dentro da confirmação de pagamento (transação), carta pública lida direto do banco por Server Component.

---

## 3. O que foi implementado (por fase)

### Fase 1 — Protótipo navegável
- Identidade visual: tokens de cor (vinho/creme/rosa/dourado/grafite), fontes (Playfair Display, Inter, Dancing Script), animações do envelope respeitando `prefers-reduced-motion`.
- Landing com 11 seções (barra, hero, como funciona, para quem, demonstração, benefícios, planos, depoimentos marcados como demo, garantia configurável, 9 FAQs, CTA final) + SEO em pt-BR + `robots.txt`.
- Fluxo de criação em **4 etapas** com preview fiel em tempo real (sticky no desktop, drawer no mobile).
- Carta fechada (envelope) → aberta com música pós-clique, contador de tempo, 4 temas.
- Compartilhamento por WhatsApp; páginas de termos e privacidade; estados de loading/erro/vazio; responsividade mobile-first.

### Fase 1.1 — Refinamento funcional e visual
- Limite de fotos 3 → **6** via constante central `MAX_CART_PHOTOS`.
- **Carrossel** de fotos próprio (sem dependência): swipe (pointer events), teclado, indicadores, crossfade de altura constante, **autoplay na carta pronta/demonstração** (pausa ao interagir, respeita reduced-motion).
- Gestão de fotos: adicionar, remover, miniaturas, **definir capa**, reordenar (← →).
- Temas **visualmente distintos** dirigidos por tokens (tipografia do título, papel pautado/pontilhado/liso, moldura das fotos, borda/raio, ornamento, divisor, selo do envelope).

### Fase 1.2 — Pesquisa de música no YouTube
- Rota server-side `/api/youtube/search` com modos **mock / real / disabled**; chave `YOUTUBE_API_KEY` **somente no servidor** (confirmado fora do bundle).
- Busca com debounce, mínimo de caracteres, dedupe, `AbortController`, cache em memória com TTL, rate limit leve.
- Resultados com thumbnail/título/canal, selecionar, "Ver no YouTube", prévia com player oficial; **colar link** mantido como alternativa; decodificação de entidades HTML nos títulos.
- Estrutura `SelectedMusic` (`source: "search" | "manual"`); migração do formato antigo (`musicUrl`/`musicVideoId`).

### Fase 2 — Persistência, upload e publicação
- **Banco**: schema Prisma completo (`Cart`, `CartMedia`, `Order`, `EmailDelivery`) + 6 enums + índices; migration aplicada.
- **Rascunho sem login**: token de edição de 256 bits (só o **hash SHA-256** no banco; token cru no `localStorage`; comparação `timingSafeEqual`; header `x-cart-edit-token`).
- **API de rascunho** (`/api/carts*`) validada com **Zod**; **autosave no backend** com debounce, retry, descarte de resposta antiga e cache local de recuperação.
- **Migração** best-effort do rascunho local (Fase 1) → backend, com reenvio das fotos e aviso se alguma falhar.
- **Upload real** de fotos (compressão no cliente + validação de magic bytes **também no servidor**; chave `carts/{id}/{uuid}.{ext}` validada contra path traversal); remoção (apaga do storage) e reordenação persistidas.
- **Música persistida** (campos achatados no `Cart`); não guarda resultados de busca nem o termo pesquisado.
- **Pedido + pagamento mock**: preço **calculado no servidor**; confirmação **idempotente** (`updateMany` condicional + transação: pedido pago + publicação + slug + expiração atômicos).
- **Publicação**: slug com **≥128 bits** de entropia (26 chars), único; `expiresAt` calculado pelo plano.
- **Rota pública `/c/[slug]`** reescrita como **Server Component** lendo do banco (abre em qualquer navegador), com `noindex`; nunca expõe token/pedido/dados do comprador.
- **QR Code** (`qrcode`) sob demanda; nunca bloqueia a publicação.
- **E-mail mock** com **outbox** (`EmailDelivery`, único por pedido via `@@unique([orderId, type])`); visualizador dev `/api/dev/emails` (bloqueado em produção).
- Páginas **`/checkout/[cartId]`** e **`/pedido/[orderId]/sucesso`**.
- **Testes**: unitários (sem banco) + integração (opt-in `RUN_DB_TESTS=true`).
- **Correção pós-validação (hoje):** ao retomar `/criar` com uma carta **já publicada**, o app agora descarta a sessão e cria uma **nova** (antes dava "Esta carta já foi processada" no checkout); a tela de sucesso limpa a sessão ao concluir.

---

## 4. O que foi validado hoje (executado de verdade)

- ✅ **Migrations**: `prisma migrate dev --name init` → migration `20260722204423_init` **aplicada no Supabase** (via `DIRECT_URL`, porta 5432).
- ✅ **Seed**: `npm run db:seed` populou carta publicada (`/c/seed-demonstracao`), expirada (`/c/seed-expirada`) e rascunho.
- ✅ **Testes**: **78/78** passando (71 unitários + **7 de integração contra o Supabase real**). Os de integração precisaram de timeout maior por latência de rede (não bug) — timeout de 60s persistido no arquivo.
- ✅ **Build**: `next build` limpo (20 rotas). **Lint** e **typecheck** limpos.
- ✅ **Segredos**: `DATABASE_URL`/`DIRECT_URL`/`YOUTUBE_API_KEY` confirmados **fora** do bundle do cliente (teste com chaves sentinela).
- ✅ **Smoke test HTTP ponta a ponta** (servidor de produção + Supabase + disco):
  - criar rascunho (201) · token inválido rejeitado (401)
  - **upload de foto** persistido e servível em `/api/media/...jpg` (200, image/jpeg)
  - criar pedido com **preço do servidor** (ignorou `amount:1` adulterado → 1890 centavos)
  - **confirmação mock** → pedido PAGO + carta PUBLICADA, **slug de 26 chars**, **QR Code PNG**
  - **idempotência**: 2ª confirmação devolveu o **mesmo slug e paidAt**
  - **carta pública** abre por slug (200, `noindex`), **sem vazar token nem e-mail**
  - **e-mail mock** confirmado no banco: **1 entrega SENT** (única, mesmo com 2 confirmações)
  - leituras seed: publicada (200) / expirada ("expirou") / inexistente ("não encontrada")
- ✅ **Supabase**: conectado e operando, inclusive o **pooler transaction-mode (6543, pgbouncer)** com transações interativas via driver `pg`.
- ✅ **Guarda de produção**: `/api/dev/emails` retorna **409 em `npm start`** (bloqueado em produção, por design).

---

## 5. Estado atual do banco

- **Provedor:** **Supabase** (PostgreSQL). App usa o pooler *transaction-mode* (`DATABASE_URL`, porta 6543, `pgbouncer=true`); migrations usam o pooler *session-mode* (`DIRECT_URL`, porta 5432).
- **Migrations existentes:** `prisma/migrations/20260722204423_init/` (+ `migration_lock.toml`).
- **Entidades / tabelas:** `Cart`, `CartMedia`, `Order`, `EmailDelivery`.
- **Enums:** `CartStatus` (DRAFT, AWAITING_PAYMENT, PAID, PUBLISHED, EXPIRED, CANCELLED); `PlanType` (LIMITED, PERMANENT); `MusicSource` (SEARCH, MANUAL); `OrderStatus` (PENDING, PAID, FAILED, REFUNDED, EXPIRED, CANCELLED); `PaymentMethod` (PIX, CARD, MOCK); `EmailStatus` (PENDING, SENT, FAILED).
- **Índices / unicidades:** `Cart.slug` (único), `Cart.status`; `CartMedia.cartId`; `Order.cartId`, `Order.status`, `Order.providerPaymentId` (único); `EmailDelivery.orderId`, `@@unique([orderId, type])`.
- **Dados seed atuais:** ~5 cartas (3 publicadas, incluindo `seed-demonstracao` e `seed-expirada`, + 1 rascunho + cartas de teste do smoke), 2 pedidos pagos, 1 e-mail SENT. Dados de teste do smoke usam e-mail `@seed.local`, então um novo `npm run db:seed` os remove. Para zerar tudo: `npx prisma migrate reset`.

---

## 6. Estado do armazenamento

- **Banco:** no **Supabase** (persistente, gerenciado).
- **Fotos:** ainda em **disco local** (`.data/uploads`, gitignored), servidas por `/api/media/[...path]`. **Não** é localStorage, Supabase Storage nem S3.
- **Motivo:** decisão explícita da Fase 2 (D28) — não havia bucket S3/Supabase Storage configurado e o objetivo era manter o produto 100% executável localmente, sem custos/contas externas. A interface `StorageProvider` foi desenhada exatamente para trocar depois sem mexer no domínio.
- **Limitações:**
  - Não sobrevive a **deploy serverless** (Vercel etc.) — disco efêmero.
  - Não funciona com **múltiplas instâncias** (cada uma tem o próprio disco).
  - Upload passa **pelo servidor Next** → sujeito a limites de tamanho de payload e tempo de execução da hospedagem; sem CDN.
- **Impacto em produção:** **bloqueante** — antes de vender de verdade é preciso migrar para um storage real (S3 / Cloudflare R2 / Supabase Storage), idealmente com **URL assinada de upload direto**.

---

## 7. Problemas conhecidos / pendências técnicas

- **Storage local** — precisa migrar para S3/R2/Supabase Storage antes de produção (ver seção 6).
- **Domínio definitivo** — `site.url` / `NEXT_PUBLIC_APP_URL` usam placeholders; o **link público e o QR Code** são montados com essa URL, então **o QR Code aponta para um domínio ainda não publicado**. Precisa definir o domínio real antes de gerar QR Codes "de verdade".
- **Cache e rate limit em memória por instância** (busca de música / APIs) — não confiáveis com múltiplas instâncias; produção pede Redis/store compartilhado.
- **Sem login** — editar rascunho e finalizar compra só funcionam no navegador de origem (token no `localStorage`). Não há recuperação por e-mail; documentado e com mensagem clara, mas pode prejudicar conversão.
- **Migração de fotos do rascunho legado** — best-effort; imagens grandes podem não migrar (o texto sempre migra).
- **Pagamento e e-mail são mock** — nada real ainda (é o escopo da Fase 3).
- **Termos/privacidade** — rascunhos, precisam de revisão jurídica; **depoimentos** ainda são fictícios marcados como demonstração (nunca publicar em produção).
- **Dimensões de imagem** no servidor vêm como *hints* do cliente (não recalculadas) — metadado, não controle de segurança.

---

## 8. Próximas tarefas (por prioridade)

1. **Storage de produção** — escolher e implementar `S3StorageProvider` (ou Supabase Storage / R2) atrás da interface existente, de preferência com upload por URL assinada; ajustar `STORAGE_PROVIDER`.
2. **Definir domínio + `NEXT_PUBLIC_APP_URL`/`site.url`** para que link público e QR Code fiquem corretos.
3. **Fase 3 — pagamento real**: `RealPaymentProvider` (Pix + cartão) atrás da interface, **webhook idempotente** do provedor (nunca confiar no retorno do navegador), publicação só após confirmação real.
4. **E-mail transacional real** (`RealEmailProvider`) usando o mesmo outbox.
5. **Redis** para cache/rate limit compartilhado.
6. **Pipeline de deploy**: `prisma migrate deploy`, variáveis de produção, revisão de termos/privacidade, substituição de depoimentos.

> Não iniciar nenhuma delas agora — este é apenas o handoff.

---

## 9. Decisões técnicas (consolidado, ver `docs/0004_Decisions.md` para detalhes)

- **Prisma 7 + Postgres** com driver adapter e URLs em `prisma.config.ts` (não no schema — mudança da v7).
- **Supabase** como Postgres hospedado (pooler transaction-mode para app, session-mode para migrations).
- **Storage local em dev** atrás de interface `StorageProvider`; upload pelo servidor Next.
- **Token de edição** (256 bits, hash SHA-256, sem JWT, nunca na URL) no lugar de login.
- **Slug ≥128 bits** de entropia (alfabeto de 33 símbolos sem caracteres ambíguos).
- **Preço sempre no servidor** (cliente só envia `planType`).
- **Confirmação mock idempotente** via `updateMany` condicional + transação.
- **E-mail como outbox** (`EmailDelivery`), único por pedido; publicação não depende do "envio".
- **QR Code nunca bloqueia** a publicação (retorna `null` em falha).
- **YouTube Data API v3** oficial, chave só no servidor, modos mock/real/disabled, sem extração de áudio.
- **Preview** reusa o mesmo `CardPreview` no editor e na carta; **carrossel** próprio sem dependência; **temas** dirigidos por tokens; **limite de fotos** central (`MAX_CART_PHOTOS`); **autosave** com descarte de resposta antiga.
- **Testes de integração com opt-in** (`RUN_DB_TESTS=true`) para nunca tocar banco por acidente.
- **Deps novas justificadas:** `@prisma/client`, `@prisma/adapter-pg`, `pg`, `prisma`, `zod`, `qrcode`, `tsx` (seed), `vitest` (já da Fase 1.2).

---

## 10. Variáveis de ambiente

> Sem valores reais/segredos aqui. Ver `.env.example`. Segredos ficam em `.env.local` (gitignored).

**Marca / app**
- `NEXT_PUBLIC_SITE_URL` — URL canônica do site (metadata/SEO).
- `NEXT_PUBLIC_APP_URL` — URL base usada para montar link público e QR Code (padrão `http://localhost:3000`).
- `NEXT_PUBLIC_WHATSAPP_SUPPORT` — número (DDI+DDD) para links de ajuda por WhatsApp.

**Feature flags / fotos**
- `NEXT_PUBLIC_AI_WRITING_ASSISTANT` — assistente de escrita com IA (desligado; Fase 4).
- `NEXT_PUBLIC_MAX_CART_PHOTOS` — limite de fotos por cartinha (padrão 6).

**Busca de música (YouTube)**
- `YOUTUBE_SEARCH_MODE` — `mock` | `real` | `disabled`.
- `YOUTUBE_SEARCH_ENABLED` — liga/desliga a busca no servidor (`false` força disabled).
- `YOUTUBE_SEARCH_MAX_RESULTS` — nº de resultados (1–8).
- `YOUTUBE_SEARCH_CACHE_TTL_SECONDS` — TTL do cache em memória por termo.
- `YOUTUBE_API_KEY` — chave da YouTube Data API v3 (**somente servidor**, nunca `NEXT_PUBLIC_`).
- `NEXT_PUBLIC_YOUTUBE_SEARCH_ENABLED` — espelho de UI (mostrar/ocultar a aba de busca).

**Planos (preços em centavos)**
- `PLAN_LIMITED_PRICE`, `PLAN_PERMANENT_PRICE`, `PLAN_LIMITED_DURATION_DAYS` — autoritativos no servidor.
- `NEXT_PUBLIC_PLAN_LIMITED_PRICE`, `NEXT_PUBLIC_PLAN_PERMANENT_PRICE`, `NEXT_PUBLIC_PLAN_LIMITED_DURATION_DAYS` — para exibição no cliente (fallback dos acima).

**Banco (Prisma/Supabase)**
- `DATABASE_URL` — conexão da aplicação (Supabase pooler transaction-mode, `pgbouncer=true`).
- `DIRECT_URL` — conexão direta/session-mode usada pelas migrations.

**Storage**
- `STORAGE_PROVIDER` — `local` (única opção nesta fase).
- `STORAGE_DIR` — pasta local dos uploads (padrão `.data/uploads`).
- `STORAGE_PUBLIC_URL` — prefixo público das fotos (padrão `/api/media`).

**Pagamento (mock)**
- `PAYMENT_MODE` — `mock` (único suportado nesta fase).
- `ALLOW_MOCK_PAYMENT_CONFIRMATION` — precisa ser `true` para a confirmação mock funcionar (bloqueio de segurança).
- `NEXT_PUBLIC_PAYMENT_MODE` — espelho de UI (texto do checkout).

**E-mail (mock)**
- `EMAIL_MODE` — `mock` (único suportado nesta fase).
- `DEV_EMAILS_ENABLED` — habilita `GET /api/dev/emails` (nunca em produção).

---

## 11. Estrutura do projeto (principais pastas)

```
prisma/
  schema.prisma        Modelo de dados (Cart, CartMedia, Order, EmailDelivery)
  migrations/          Migration init aplicada
  seed.ts              Seed de desenvolvimento (roda via tsx)
prisma.config.ts       Config do Prisma 7 (schema, migrations, seed, datasource CLI)
src/
  app/                 Rotas (App Router): páginas + api/*
  components/          landing/, create/, card/, checkout/, order/, analytics/
  config/              site, plans, flags, youtube (fonte única de verdade)
  content/             recipients, occasions, themes, templates, faq,
                       testimonials, demoCart, mockMusic (dados centralizados)
  lib/                 types, db, cartSession, api (cliente HTTP), storage
                       (cache local), editToken, expiry, limits, imageMagic,
                       image, slug, youtube, music, counter, whatsapp, analytics
  server/              cartService, orderService, schemas (Zod), errors,
                       editTokenHeader, qrcode, rateLimit, youtubeSearch,
                       storage/, payment/, email/
  generated/prisma/    Cliente Prisma gerado (gitignored)
docs/                  0001–0005 (brief, plano, arquitetura, decisões, changelog)
docs/tasks/            Tasks recebidas (001–006) + este handoff (007)
.data/uploads/         Fotos em disco (gitignored)
```

---

## 12. Fluxo completo do usuário (landing → abrir a cartinha)

1. Entra na **landing** (`/`) e clica em "Criar minha cartinha".
2. **`/criar`**, Etapa 1 — escolhe destinatário e ocasião.
3. Etapa 2 — escreve título e mensagem (com "Preciso de inspiração" e contador de caracteres).
4. Etapa 3 — personaliza: **até 6 fotos** (upload real, definir capa, reordenar), **música** (buscar no YouTube ou colar link), contador de tempo, tema.
5. Etapa 4 — assinatura + revisão de cada parte.
6. Escolhe um **plano** e clica em "Continuar para o pagamento".
7. **`/checkout/[cartId]`** — informa nome, e-mail, celular (opcional) e aceita os termos; cria o pedido.
8. Tela de **pagamento mock** — simula aprovado (ou falha/expiração). Nenhuma cobrança real.
9. **`/pedido/[orderId]/sucesso`** — vê link exclusivo, **QR Code** (com download), botão de **WhatsApp** e aviso de e-mail (mock) enviado.
10. Abre `/c/[slug]` (ou compartilha): a carta aparece **fechada** como envelope.
11. Ao clicar, o **envelope abre**, a **música toca**, e aparecem título, fotos (carrossel), mensagem, contador e assinatura. Funciona em qualquer navegador/dispositivo.

---

## 13. Fluxo interno da aplicação (como os dados percorrem)

- **Landing** → estático/SSR; só CTA para `/criar`.
- **Criar** → `CreateFlow` carrega a sessão (`{cartId, editToken}`) do `localStorage`. Se não houver (ou a carta não for editável), cria um rascunho: `POST /api/carts` → `cartService.createDraft` → `INSERT Cart (status DRAFT)` no Supabase, devolve token; migra rascunho legado se existir.
- **Autosave** → a cada mudança (debounce 700ms) envia `PATCH /api/carts/[id]` com o header `x-cart-edit-token` → `cartService.updateDraft` (valida token via hash + Zod) → `UPDATE Cart`. Respostas de requisições superadas são descartadas; `localStorage` guarda um cache de recuperação. Fotos vão por `POST /api/carts/[id]/media` (multipart) → validação de magic bytes → `StorageProvider.put` (disco) + `INSERT CartMedia`.
- **Banco** → Prisma (adapter `pg`) contra o Supabase é a **fonte da verdade**.
- **Pedido** → no checkout, `POST /api/orders` → `orderService.createOrder`: valida token e conteúdo, **busca o preço no servidor**, `UPDATE Cart (AWAITING_PAYMENT)` + `INSERT Order (PENDING)`; reaproveita pedido pendente existente (idempotência).
- **Pagamento Mock** → `POST /api/orders/[id]/mock-confirm`: guard atômico `updateMany(status: PENDING → PAID)`; só o vencedor prossegue.
- **Publicação** → dentro de uma **transação**: `publishCart` gera **slug** (≥128 bits, único), calcula `expiresAt`, `UPDATE Cart (PUBLISHED, publishedAt, slug, expiresAt)`. Depois: gera **QR Code** (não bloqueia) e registra **e-mail** no outbox (`EmailDelivery`, único por pedido).
- **Carta pública** → `/c/[slug]` (Server Component) → `cartService.getPublicCart(slug)` → `SELECT` por slug com status `PUBLISHED` e verificação de expiração → devolve DTO **sem** token/pedido/dados do comprador → renderiza envelope + carta.

---

## 14. Checklist da Fase 2

- ✅ Banco PostgreSQL (Supabase) conectado
- ✅ Prisma configurado (schema + client + adapter)
- ✅ Migration criada e aplicada
- ✅ Rascunho persistido no backend
- ✅ Atualizar a página não perde dados (autosave + sessão)
- ✅ Edição exige token seguro (hash SHA-256)
- ✅ Até 6 fotos armazenadas fora do localStorage (disco)
- ✅ Fotos podem ser removidas e reordenadas (persistido)
- ✅ Música persistida
- ✅ Pedido criado com preço definido pelo servidor
- ✅ Pagamento mock confirmável
- ✅ Confirmação idempotente
- ✅ Carta publicada
- ✅ Slug seguro (≥128 bits)
- ✅ Carta abre em outro navegador/dispositivo
- ✅ Carta pública com `noindex`
- ✅ Plano limitado calcula expiração / permanente não expira
- ✅ QR Code funcionando
- ✅ Página de sucesso funcionando
- ✅ E-mail mock registrado (outbox, único)
- ✅ WhatsApp usa o link público
- ✅ Erros tratados (sem stack trace)
- ✅ Testes / lint / typecheck / build passando
- ✅ Smoke tests das APIs
- ✅ Documentação atualizada (0002–0005, README, .env.example)
- ⚠ Storage de **produção** (S3/R2/Supabase Storage) — **não iniciado** (decisão: disco local nesta fase)
- ⚠ Domínio real + `NEXT_PUBLIC_APP_URL` definitivo (QR/link) — **pendente**
- ❌ Pagamento real / webhook / e-mail transacional — **Fase 3 (fora do escopo da Fase 2)**

**Resumo:** Fase 2 **concluída** no escopo definido (persistência + infra mínima + pagamento mock). Itens ⚠ são pré-requisitos de produção; ❌ é Fase 3.

---

## 15. O que deve ser feito amanhã (plano de ação)

> Não implementar agora. Sugestão de ordem para a próxima sessão:

1. **Decidir o storage de produção** (recomendado: **Supabase Storage**, já que o banco está no Supabase — ou S3/R2). Criar bucket + política; implementar `SupabaseStorageProvider`/`S3StorageProvider` atrás da interface `StorageProvider`; idealmente **upload por URL assinada**; ajustar `STORAGE_PROVIDER` e `STORAGE_PUBLIC_URL`. Migrar/valer para novas fotos (as antigas em `.data/uploads` são de teste).
2. **Definir domínio e `NEXT_PUBLIC_APP_URL`/`site.url`** para que link público e QR Code apontem para o endereço correto.
3. **Planejar a Fase 3** (não iniciar sem alinhar): escolher provedor de pagamento (ex.: Mercado Pago/Stripe/Pagar.me), desenhar `RealPaymentProvider` + **webhook idempotente**, e-mail transacional real, e o pipeline de deploy (`prisma migrate deploy` + variáveis de produção).
4. **(Opcional) Limpar dados de teste** do Supabase: `npx prisma migrate reset` (recria o schema) ou `npm run db:seed` (remove os `@seed.local`), e apagar `.data/uploads`.

### Como subir o ambiente amanhã
```bash
npm install            # se necessário
npm run db:generate    # garante o cliente Prisma
npm run dev            # http://localhost:3000  (.env.local já tem DATABASE_URL do Supabase)
```
Validação rápida: `npm run typecheck && npm run lint && npm test` (unitários);
integração com banco: `RUN_DB_TESTS=true npm test`.

> **Correção aplicada hoje que vale lembrar:** se aparecer "Esta carta já foi
> processada" ao testar o checkout, é sessão antiga apontando para carta já
> publicada — já corrigido (o `/criar` cria uma nova automaticamente); para
> forçar, limpe `localStorage` (`antero:session`).
