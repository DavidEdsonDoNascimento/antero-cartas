# 0005 — ChangeLog · Antero Cartas

## [Fase 2.2] — Ajustes de experiência em /criar — 2026-07-23

### Adicionado
- **`lib/draftInit.ts`** — extrai a decisão de retomar/criar rascunho de
  `CreateFlow` para uma função pura e testável (`resolveCartInit`), com cache
  de prefetch (`prefetchCartInit`/`getCartInit`) usado pelo novo `CreateCta.tsx`.
- **`CreateCta.tsx`** — substitui os `<Link href="/criar">` espalhados pela
  landing/checkout/demonstração; dispara o prefetch da sessão no hover/clique.
- **`CreateFlowSkeleton.tsx`** — substitui o texto solto "Carregando…" por uma
  estrutura fiel ao layout real do editor.
- **`ResumeDraftPrompt.tsx`** — retomar um rascunho abandonado agora é uma
  escolha explícita ("Continuar esse rascunho" / "Começar uma cartinha nova"),
  não automática.
- **Preview otimista de fotos** (`StepPersonalize.tsx`): prévia local via
  `URL.createObjectURL` aparece antes de validar/comprimir/enviar, com spinner
  de envio e marcação de falha; nunca duplica com a foto persistida.
- **Testes**: 9 novos para `resolveCartInit`/prefetch, cobrindo retomar
  rascunho abandonado, não retomar carta publicada, não vazar cache legado ao
  encerrar sessão inválida, e migração legítima da Fase 1.

### Corrigido
- **Dados de uma carta antiga vazando para uma nova**: `saveDraft(cart)` (cache
  de recuperação do autosave) sobrevivia à publicação porque só `clearSession()`
  rodava, nunca `clearDraft()`. Corrigido em `OrderSuccessClient` (ao publicar)
  e em `resolveCartInit` (sempre que uma sessão inválida é encerrada) — ver
  D46 em `docs/0004_Decisions.md`.

### Alterado
- Todos os CTAs "Criar minha cartinha"/"Criar cartinha"/"criar a minha" agora
  usam `CreateCta` em vez de `Link` puro (Header, Sections, page.tsx,
  demonstracao/page.tsx).

## [Fase 2.1] — Storage de produção (Supabase Storage) — 2026-07-23

### Adicionado
- **`SupabaseStorageProvider`** (`server/storage/supabaseStorage.ts`) — segunda
  implementação de `StorageProvider`, ativada por `STORAGE_PROVIDER=supabase`.
  Fala com a API REST do Supabase Storage via `fetch`, **sem instalar SDK**
  (nenhuma dependência nova). Timeout de 15s, remoção idempotente (404 = sucesso)
  e `cache-control` imutável de 1 ano nos objetos, já que a chave contém UUID.
- **`npm run storage:setup`** (`scripts/setupStorageBucket.ts`) — cria ou corrige
  o bucket de forma idempotente: público para leitura, limite de 10 MB e MIME
  types restritos a JPEG/PNG/WEBP. Avisa explicitamente para não criar policy
  de listagem em `storage.objects`.
- **Variáveis novas**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (somente
  servidor, nunca `NEXT_PUBLIC_`), `SUPABASE_STORAGE_BUCKET`.
- **Testes**: 21 novos (config, URL pública, put/delete/read, chave inválida
  barrada antes da requisição, erro do Storage convertido em 500 sem vazar
  detalhe, seleção e memoização do provider na fábrica).

### Alterado
- **Fábrica `getStorage()`** agora despacha entre `local` e `supabase`, e
  **falha explicitamente** em provider desconhecido em vez de exigir `local`.
  Exporta `resetStorage()` para testes.
- **`cartService.removeMedia`**: a remoção no storage virou best-effort de
  verdade (era `await` sem `try`). Com storage em rede, uma falha de conexão
  devolvia 500 ao usuário numa remoção que o banco já havia efetivado.
- **`.env.example`** e docs 0003/0004 atualizados (decisões D39–D44; D28 marcada
  como superada por D39).

### Notas
- Upload **continua passando pelo servidor Next** — URL assinada de upload
  direto foi avaliada e descartada (D41): o ganho não se aplica (fotos
  comprimidas ficam em ~150–400 KB) e custaria a validação de magic bytes.
- `CartMedia.url` guarda a URL resolvida no momento do upload. Fotos enviadas
  com `STORAGE_PROVIDER=local` continuam apontando para `/api/media` — as
  existentes são dados de teste; trocar de bucket no futuro exige atualizar a
  coluna.

## [Fase 2] — Persistência, upload e publicação da cartinha — 2026-07-22

### Adicionado
- **Banco de dados**: PostgreSQL + Prisma 7 (`prisma/schema.prisma`), driver
  adapter `@prisma/adapter-pg`. Entidades `Cart`, `CartMedia`, `Order`,
  `EmailDelivery` com enums e índices.
- **Rascunho no backend, sem login**: token de edição de 256 bits (hash SHA-256
  no banco, token cru no `localStorage`), API `POST/GET/PATCH /api/carts*`
  validada com Zod, autosave com debounce/retry/descarte de respostas antigas.
- **Migração** best-effort do rascunho local (Fase 1) para o backend, incluindo
  reenvio das fotos, com aviso discreto se alguma não puder ser migrada.
- **Upload real de fotos**: `StorageProvider` (interface) + implementação em
  disco local; validação de magic bytes também no servidor; remoção e
  reordenação (com "definir capa") persistidas no banco e refletidas no
  carrossel.
- **Música persistida**: campos achatados no `Cart` (`musicVideoId`, `musicUrl`,
  `musicTitle`, `musicChannelTitle`, `musicThumbnailUrl`, `musicSource`) — sem
  guardar resultados de busca nem o termo pesquisado.
- **Pedido e pagamento mock**: `Order` com preço calculado **no servidor**;
  `PaymentProvider`/`MockPaymentProvider`; confirmação idempotente
  (`POST /api/orders/[id]/mock-confirm`) que publica a carta atomicamente
  (transação: pedido pago + slug + `expiresAt` + status `PUBLISHED`).
- **Rota pública `/c/[slug]`** reescrita como Server Component lendo do banco —
  abre em qualquer navegador/dispositivo, mantendo `noindex`.
- **QR Code** (`qrcode`) gerado sob demanda, nunca bloqueia a publicação.
- **E-mail mock** (`EmailProvider`/`MockEmailProvider`) com outbox
  (`EmailDelivery`, único por pedido) e visualizador de desenvolvimento
  (`GET /api/dev/emails`, bloqueado em produção).
- **Páginas novas**: `/checkout/[cartId]` (dados do comprador + simulação de
  pagamento aprovado/falha/expirado) e `/pedido/[orderId]/sucesso` (link, QR
  Code, WhatsApp, estados pendente/pago/falho).
- **Testes**: unitários para token, slug/entropia, expiração, magic bytes,
  mapeamento de carta, schemas Zod, QR Code e regex de storage; testes de
  integração com banco real, desligados por padrão (`RUN_DB_TESTS=true`).
- **Scripts**: `typecheck`, `db:generate`, `db:migrate`, `db:push`, `db:seed`,
  `db:studio`. Seed de desenvolvimento (`prisma/seed.ts`, sem dados reais).

### Alterado
- `lib/types.ts`: `Cart` ganhou modelo alinhado ao banco (sem alterar a forma
  usada pela UI). `lib/storage.ts` deixou de ser a fonte da verdade — vira
  cache local de recuperação; `savePublishedCart`/`loadPublishedCart`/
  `createEmptyCart` removidos (obsoletos).
- `CreateFlow`, `StepPersonalize`, `StepPlan` passaram a falar com o backend em
  vez de manter tudo em memória/local.
- Removidos `components/card/CardLoader.tsx` e `components/create/Success.tsx`
  (substituídos pelo Server Component de `/c/[slug]` e pela página de sucesso).

### Não incluído (Fase 3+)
- Pagamento real (Pix/cartão), webhook de provedor externo, e-mail transacional
  real, Redis, autenticação, painel administrativo, WhatsApp Cloud API.

## [Fase 1.2] — Pesquisa e seleção de música no YouTube — 2026-07-22

### Adicionado
- **Busca de música** na Etapa 3 (`components/create/MusicPicker.tsx`): pesquisa
  por música/artista com debounce, mínimo de caracteres, dedupe e `AbortController`;
  estados de inicial/carregando/vazio/erro/desativado; resultados com thumbnail,
  título, canal, "Selecionar" e "Ver no YouTube"; prévia com o player oficial;
  trocar e remover. Colar link mantido como alternativa.
- **Rota server-side** `GET /api/youtube/search` + serviço `server/youtubeSearch.ts`
  com modos **mock/real/disabled**, cache em memória com TTL, timeout e erros
  consistentes. Chave `YOUTUBE_API_KEY` só no servidor.
- **Funções puras** `lib/music.ts` (normalização/validação do termo, transformação
  da resposta, `SelectedMusic`, migração do formato antigo) + `content/mockMusic.ts`.
- **Rate limiting** leve (`lib/rateLimit.ts`) e config de UI (`config/youtube.ts`).
- **Analytics**: `music_search_started/completed/failed`, `music_selected`,
  `music_removed`, `music_preview_played` (sem enviar o termo pesquisado).
- **Testes (Vitest)**: 23 casos cobrindo funções puras e o serviço de busca.

### Alterado
- Modelo de dados da música: de `musicUrl`/`musicVideoId` soltos para
  `music: SelectedMusic | null`, com **migração** de rascunhos/cartas antigos.
- `CardPreview` e a carta aberta mostram título/canal e nota de disponibilidade.
- FAQ: menção à busca e à dependência de disponibilidade do YouTube.

### Não incluído (Fase 2+)
- Persistência definitiva dos metadados (backend/Prisma), Redis, OAuth do YouTube.
- Sem extração/hospedagem de áudio (apenas player oficial incorporado).

## [Fase 1.1] — Refinamento funcional e visual — 2026-07-22

### Alterado
- **Limite de fotos 3 → 6** via constante central `MAX_CART_PHOTOS`
  (`lib/image.ts`, sobrescrevível por `NEXT_PUBLIC_MAX_CART_PHOTOS`). Textos e
  copy passam a derivar da constante.
- **Fotos em carrossel** (`components/card/PhotoCarousel.tsx`) no preview, na
  demonstração e na carta aberta: uma foto por vez, prev/próxima, indicadores,
  swipe (pointer events), teclado, crossfade de altura constante,
  `prefers-reduced-motion`. **Sem nova dependência.**
- **Gestão de fotos** na Etapa 3: adicionar até 6, remover, miniaturas, definir
  **capa** e reordenar (← / →). Ordem refletida no carrossel.
- **Autosave preserva a ordem/fotos**: rascunho em duas camadas no localStorage
  (texto sempre salvo; fotos best-effort em chave separada — ver D15).
- **Temas visualmente distintos por tokens**: título (script/serifada), papel
  (pautado/pontilhado/liso), moldura das fotos, borda/raio da carta, ornamento,
  divisor e selo do envelope. Sem implementações separadas.
- **Carta aberta**: carrossel em destaque, controles de música mais discretos com
  botão claro de "Tocar música" e sem erro visual se o navegador bloquear o áudio.
- Carta de demonstração ganhou 3 "fotos" (SVG embutido) para exibir o carrossel.

### Mantido para a Fase 2
- Upload real (S3) + backend/Prisma; a estratégia de imagens continua local.
- QR Code e envio de e-mail.

## [Fase 1] — Protótipo navegável — 2026-07-22

### Adicionado
- **Identidade visual**: tokens de cor e tipografia (Tailwind v4 `@theme`),
  fontes via `next/font`, animações do envelope com `prefers-reduced-motion`.
- **Landing page** (`/`) com barra superior, hero, como funciona, para quem é,
  demonstração interativa, benefícios, planos, depoimentos (marcados como demo),
  garantia configurável, FAQ (9 perguntas) e CTA final. Metadata/SEO em pt-BR.
- **Fluxo de criação** (`/criar`) em 4 etapas com preview ao vivo:
  - Etapa 1: destinatário + nome + ocasião.
  - Etapa 2: título + mensagem com contador, validação e "Preciso de inspiração"
    (modelos locais).
  - Etapa 3: até 3 fotos (validação + compressão), contador de tempo, música por
    YouTube (extração segura do ID) e 4 temas.
  - Etapa 4: assinatura + revisão com botões de editar.
  - Seleção de plano (modo demonstração) e tela de sucesso.
- **Autosave** com debounce em `localStorage` + indicador "Salvo".
- **Carta recebida** (`/c/[slug]`, `noindex`) e **demonstração** (`/demonstracao`):
  envelope fechado → animação de abertura → carta + música + WhatsApp.
- **Páginas legais**: `/termos` e `/privacidade` (rascunhos LGPD).
- **Infra de código**: `config/` (site, plans, flags), `content/` (dados/textos),
  `lib/` (types, storage, slug, youtube, image, counter, whatsapp, analytics),
  `robots.ts`, `.env.example`, documentação `0001`–`0005`.

### Mockado / pendente
- Pagamento é **mock** (seleção de plano visual, sem cobrança).
- Persistência é **local** (localStorage); backend/Prisma na Fase 2.
- **QR Code** e **envio de e-mail** entram na Fase 2.
- Assistente de escrita com **IA** desligado por flag (Fase 4).

### Notas
- Nenhuma linha de código, marca, texto ou layout copiado da referência.
- Preços e textos comerciais são provisórios e configuráveis.
