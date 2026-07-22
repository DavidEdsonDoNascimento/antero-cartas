# 0005 — ChangeLog · Antero Cartas

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
