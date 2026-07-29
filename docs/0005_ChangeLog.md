# 0005 — ChangeLog · Antero Cartas

## [Fase 2.5] — Limpeza autorizada dos dados de teste em produção — 2026-07-29

### Removido (com autorização explícita, por ID)
- Cart `cmrzbpfxa000004l211cblj62` (`DRAFT`, sem slug)
- Cart `cmrzbpt5c000104l2f1nt0n1f` (`AWAITING_PAYMENT`, sem slug)
- Order `cmrzbq6fp000204l2vjhtgvzv` (`PENDING`, e-mail `@seed.local`, nunca
  confirmado)

Criados no diagnóstico da Etapa 4 em 2026-07-24. Removidos com
`scripts/cleanupTestData.ts`, que só aceita lista explícita de IDs — nenhum
filtro genérico por data, provider ou domínio de e-mail.

### Verificação
Fotografia do banco antes e depois, comparando totais e listando todas as
entidades:

| | Antes | Depois | Delta |
|---|---|---|---|
| Cart | 23 | 21 | −2 (só os autorizados) |
| Order | 10 | 9 | −1 (só o autorizado) |
| CartMedia | 21 | 21 | 0 |
| EmailDelivery | 5 | 5 | 0 |

Antes de remover foi confirmado que os dois carts tinham **0 mídia e 0
EmailDelivery** (logo, nenhum objeto de Storage a apagar) e que **exatamente
um** Order casava com os carts autorizados — o autorizado. Depois, os três IDs
não aparecem mais em nenhuma listagem, e os 9 Orders restantes são todos
anteriores e intactos.

### Observação: o guard D49 funcionou
A primeira tentativa de remoção **abortou** com
`APP_ENV=production com NODE_ENV != "production"` em `getStorage()`, antes de
qualquer `delete`. Nada foi removido nessa tentativa (confirmado pelos totais
inalterados). O script chama `getStorage()` incondicionalmente, mesmo quando
não há mídia. A remoção foi refeita com `NODE_ENV=production` explícito, que é
o caminho que a própria mensagem do guard indica para operação administrativa
intencional.

### Não removido (fora da autorização)
O banco de produção ainda tem outros registros com aparência de teste — vários
`Cart` em `DRAFT` sem slug e o par
`cmrzae1sv000104jmifvnoem5` / Order `cmrzaj9et000604jm5tjy5mwc` (`PENDING`).
**Nenhum deles foi tocado:** a autorização cobria só os três IDs acima.
Qualquer limpeza adicional precisa de nova autorização explícita, com o mesmo
procedimento de dry run e conferência de totais.


## [Fase 2.5] — Domínio definitivo no ar e analytics ativo — 2026-07-29

`https://cartas.anterosistemas.com.br` passou a ser a URL pública definitiva.

### Alterado
- `NEXT_PUBLIC_SITE_URL` (Production) trocada de `antero-cartas.vercel.app`
  para `https://cartas.anterosistemas.com.br` às 19:15:26 UTC; novo deployment
  de produção criado às 19:15:43 UTC — **posterior** à troca, como exige a
  leitura da variável em build time. Nenhuma outra variável foi tocada: os
  mocks seguem bloqueados (`ALLOW_MOCK_PAYMENT_CONFIRMATION=false`,
  `DEV_EMAILS_ENABLED=false`, `PAYMENT_MODE=mock`, `EMAIL_MODE=mock`).

### Adicionado
- `scripts/checkQrDomain.ts`: roda o mesmo caminho de código da publicação
  (`buildPublicCartUrl` + `generateQrDataUrl`) para conferir o QR Code sem
  publicar nada nem tocar no banco.

### Validado
- **DNS**: `vercel domains verify` -> `configured-correctly` / `CNAME`;
  Google e Cloudflare resolvem para os IPs da Vercel (`64.29.17.65`,
  `216.198.79.65`), confirmando que o proxy da Cloudflare está desligado.
- **Certificado**: Let's Encrypt, CN `cartas.anterosistemas.com.br`, cadeia
  confiável, válido até 2026-10-27. A emissão levou alguns minutos — o
  handshake falhou nas primeiras tentativas e depois estabilizou em 20/20
  requisições bem-sucedidas em duas stacks TLS (schannel do curl e a do Node).
- **Smoke test contra o domínio definitivo: 31/31.**
- **URLs geradas**: canonical, `og:url`, `og:image`, `twitter:image`,
  `sitemap.xml`, `robots.txt`, link de compartilhamento por WhatsApp e QR Code
  usam todos o domínio novo. Nenhuma delas contém `localhost`, placeholder ou
  `.vercel.app`. O alias `antero-cartas.vercel.app` continua respondendo (é o
  padrão da plataforma), mas a aplicação não o gera.
- **QR Code decodificado**, não apenas gerado: contém exatamente
  `https://cartas.anterosistemas.com.br/c/seed-demonstracao`, sem token e sem
  barra duplicada.
- **Analytics ativado** no painel e validado ao vivo: os beacons de pageview
  chegam, e o de `/c/seed-demonstracao` é enviado como `/c/[slug]` — o slug
  real nunca sai do navegador. Registrado que o script ignora navegador
  automatizado, o que faz o analytics parecer quebrado em teste headless.
- **Carta pública** aberta em navegador contra o domínio definitivo, sem
  nenhuma violação de CSP.
- lint, typecheck e build limpos; **211/211** com `RUN_DB_TESTS=true`.

### Continua pendente
DSN do Sentry, autorização para remover os dados de teste (nada removido) e o
checklist em aparelho físico.


## [Fase 2.5] — Observabilidade, analytics, SEO e headers de segurança — 2026-07-29

Fecha o trabalho técnico da Fase 2.5 (task 011, etapas 5 e 6). Nenhum item da
Fase 3 foi iniciado: pagamento e e-mail seguem em modo mock.

### Adicionado
- **SEO** — `src/app/sitemap.ts` (só `/`, `/criar` e `/demonstracao`; rotas
  privadas e páginas `noindex` ficam de fora), imagem Open Graph 1200x630
  gerada por código com a paleta da marca (`src/app/opengraph-image.tsx`),
  mesma arte reexportada para o card do X (`twitter-image.tsx`), canonical
  relativo e `twitter:card=summary_large_image` no `layout.tsx`. Ver D58.
- **Analytics** — Vercel Web Analytics: gratuito no Hobby, sem cookie,
  servido pela própria origem. `beforeSend` mascara `/c/<slug>`, `/pedido/` e
  `/checkout/` e descarta query string antes do envio — sem isso o link
  privado da carta sairia do navegador. `sanitizeAnalyticsProps` filtra as
  propriedades de evento por chave e por formato de valor. Ver D55.
- **Sentry** — integração opcional cliente/servidor/edge. Sem DSN, `init` não
  é chamado e nada é enviado. Sanitização remove o corpo da requisição
  inteiro, cookies, query string e cabeçalhos fora da lista de permitidos, e
  substitui e-mail/CPF/telefone/token em texto livre. Session Replay
  desligado. Ver D56.
- **Headers de segurança** — CSP montada a partir dos domínios reais do
  código (Supabase Storage, `i.ytimg.com`, `www.youtube.com`, `data:`,
  `blob:`, host do DSN), sem `*` nem `https:`; mais nosniff, `X-Frame-Options:
  DENY` + `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy` e
  HSTS só em produção, sem `preload`. Ver D57.
- **Domínio** — `cartas.anterosistemas.com.br` adicionado ao projeto
  `antero-cartas` na Vercel. A propriedade do domínio já está verificada; falta
  só o registro DNS, que precisa ser criado na Cloudflare (ação manual).

### Corrigido
- `GET /api/dev/emails` respondia 409 "Indisponível em produção", confirmando
  a existência da rota. Agora responde 404. Nenhum dado vazava antes; a
  correção é sobre não revelar a superfície. Ver D59.

### Validado
- **Testes:** `npm run lint`, `npm run typecheck` e `npm run build` limpos;
  `npm test` com 204/204 (7 pulados sem banco) e `RUN_DB_TESTS=true npm test`
  com **211/211 passando** contra o Postgres local. 61 testes novos nesta
  entrada (sitemap 5, analyticsPrivacy 13, sentryPrivacy 19, securityHeaders
  20, rota dev 4).
- **CSP em navegador real** contra o build local: as 5 rotas públicas
  renderizam sem violação e sem erro de página; a miniatura do YouTube
  carrega; e o controle negativo confirma que a política é aplicada de fato —
  `fetch` e `iframe` para origem não listada são bloqueados, `/api/carts`
  continua permitido.
- **Smoke test de produção (somente leitura): 31/31.** HTTPS, canonical,
  `og:image`, sitemap sem rota privada, robots, headers, `mock-confirm` 403,
  `/api/dev/emails` 404, resposta de pedido sem token nem e-mail, e nenhum
  segredo nos 11 bundles do cliente (939 KB baixados e varridos por service
  role, JWT do Supabase, string de conexão e chave do YouTube).
- **Logs da Vercel** durante o smoke test: só `info`, nenhum erro.
- **Preview e Development** continuam com zero variáveis de ambiente —
  confirmado por `vercel env ls`; não conseguem alcançar o banco de produção.

### Não executado (aguarda ação externa)
- Remoção dos dados de teste remotos — dry run repetido nesta sessão, saída
  idêntica à documentada (0 mídia e 0 e-mail nos dois carts). **Nada foi
  removido:** a autorização explícita ainda não foi dada.
- DNS de `cartas.anterosistemas.com.br` (Cloudflare) e, na sequência, a troca
  de `NEXT_PUBLIC_SITE_URL` para o domínio definitivo.
- DSN do Sentry — código pronto e variável documentada.
- Testes físicos em Android/iPhone e rede móvel — checklist entregue em
  `docs/0006_Runbook_Producao.md`.


## [Fase 2.5] — Checkout travava em "Confirmando seu pagamento…" em produção — 2026-07-24

### Contexto (incidente)
Smoke test manual no primeiro deploy de produção (`https://antero-cartas.vercel.app`):
ao clicar em "Simular pagamento aprovado" no checkout, a tela ficava presa
indefinidamente em "Confirmando seu pagamento…". `ALLOW_MOCK_PAYMENT_CONFIRMATION`
nunca foi habilitada em produção — o bloqueio server-side sempre funcionou
(`POST /api/orders/[id]/mock-confirm` responde 403 `mock_disabled`); o bug era
inteiramente client-side.

### Corrigido
- **`CheckoutClient.tsx`**: o painel "Pagamento simulado" (`MockPaymentPanel`)
  era renderizado incondicionalmente após criar o pedido, sem checar nenhuma
  variável — o botão de simulação sempre aparecia, mesmo em produção onde o
  servidor sempre rejeita a confirmação. Agora o painel só aparece quando
  `flags.MOCK_PAYMENT_CONFIRMATION_ENABLED` está ligada; caso contrário mostra
  `PaymentUnavailablePanel` com mensagem clara e um "Voltar" que retorna à
  etapa do formulário (pedido e rascunho preservados — `createOrder` já é
  idempotente por carta+plano).
- **`OrderSuccessClient.tsx`**: o polling de `/api/orders/[id]` tinha um teto
  de 20s (`POLL_TIMEOUT_MS`) que já funcionava — mas ao esgotar o prazo com o
  pedido ainda `PENDING`, nenhum novo estado era definido. Como o render fixa
  `status === "PENDING" → "Confirmando seu pagamento…"`, a tela ficava presa
  nesse texto para sempre (não era polling infinito; era ausência de estado
  terminal). Corrigido com um novo estado `pending_timeout` (mensagem +
  "Verificar novamente" + "Voltar") e uma classificação de erro
  (`retryable`) para respostas 400/401/403/404/409/429/500, falha de rede,
  timeout e resposta inválida — cada uma encerra o loading corretamente.
- **`src/lib/api.ts`**: `request()` não tinha timeout — uma requisição
  travada na rede prenderia o polling indefinidamente sem nunca rejeitar.
  Adicionado `timeoutMs` opcional (AbortController, mesmo padrão de
  `youtubeSearch.ts`/`supabaseStorage.ts`); `getOrderResult` usa 8s. Também
  passou a validar resposta 200 com corpo inválido (antes retornava `null`
  silenciosamente).

### Adicionado
- **`NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION`**: espelho público de
  `ALLOW_MOCK_PAYMENT_CONFIRMATION`, fail-closed (padrão `false`). Único jeito
  de o checkout mostrar o painel de simulação — `NEXT_PUBLIC_PAYMENT_MODE`
  sozinho não serve porque produção também roda `PAYMENT_MODE=mock` (Fase 3
  ainda não existe). Documentado em `.env.example`; corrigido também em
  `.env.production.reference` (tinha `ALLOW_MOCK_PAYMENT_CONFIRMATION=true`
  desatualizado, nunca usado em produção porque a Vercel foi configurada
  manualmente com `false`).
- **`src/lib/orderPolling.ts`**: lógica pura do polling (`reduceOrderPoll`,
  `classifyOrderError`, `PollTimeoutError`), extraída para ser testável sem
  DOM (o projeto não tem `jsdom`/`testing-library`) — 10 testes novos.
- **Testes**: `src/config/flags.test.ts` (4), `src/lib/orderPolling.test.ts`
  (10), `src/server/payment/index.test.ts` (6, cobrindo o bloqueio server-side
  do mock-confirm por combinação de `PAYMENT_MODE`/`ALLOW_MOCK_PAYMENT_CONFIRMATION`).

### Limitação conhecida
Sem `jsdom`/`@testing-library/react` no projeto, não há teste de render/DOM
confirmando que o botão desaparece visualmente — a cobertura garante a
condição booleana que controla a renderização (`flags.MOCK_PAYMENT_CONFIRMATION_ENABLED`),
e a ausência do botão em produção foi confirmada manualmente após o redeploy.
Ver `docs/0006_Runbook_Producao.md`, seção 3 ("Incidente (2026-07-24)").

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
