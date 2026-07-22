# 0002 — MVP Plan · Antero Cartas

O trabalho é dividido em fases curtas. **Não construir todas de uma vez.**

## Fase 1 — Protótipo navegável ✅ (esta entrega)
Objetivo: ficar apresentável para uma demonstração comercial, ponta a ponta,
com dados locais e **sem pagamento real**.

- [x] Identidade visual (tokens de cor, tipografia, animações)
- [x] Landing page com todas as seções + SEO
- [x] Fluxo de criação em 4 etapas
- [x] Preview fiel em tempo real (desktop sticky / mobile drawer)
- [x] Carta fechada (envelope) e aberta com música e `prefers-reduced-motion`
- [x] Dados locais (localStorage) com autosave e "Salvo"
- [x] Upload de até 6 fotos com validação e compressão no cliente
- [x] Música por URL do YouTube (extração segura do ID)
- [x] Contador de tempo juntos
- [x] 4 temas visuais
- [x] Seleção de plano (visual, modo demonstração)
- [x] Compartilhamento por WhatsApp (link com mensagem)
- [x] Páginas de termos e privacidade
- [x] Responsividade mobile-first, estados de loading/erro/vazio

## Fase 1.1 — Refinamento funcional e visual ✅
Consolidação da experiência antes da persistência (sem backend).

- [x] Limite de fotos 3 → **6** via constante central `MAX_CART_PHOTOS`
- [x] **Carrossel** de fotos (preview, demonstração e carta aberta), sem dependência
- [x] Gestão de fotos: adicionar, remover, miniaturas, definir capa, reordenar
- [x] Ordem das fotos mantida no autosave (localStorage em duas camadas)
- [x] Revisão do preview (desktop sticky / drawer mobile, sem scroll horizontal)
- [x] Carta aberta revisada (carrossel em destaque, música discreta, sem erro visual)
- [x] Temas visualmente distintos dirigidos por tokens
- [x] Revisão do fluxo de 4 etapas e casos-limite (1..6 fotos, msg longa, mobile, reduced-motion)

## Fase 1.2 — Pesquisa e seleção de música no YouTube ✅
Melhor escolha de música na criação (sem backend/persistência definitiva).

- [x] Busca por música/artista via rota server-side `/api/youtube/search`
- [x] Modos **mock** (sem chave) / **real** (YouTube Data API v3) / **disabled**
- [x] Chave `YOUTUBE_API_KEY` **somente no servidor** (nunca no bundle do cliente)
- [x] Debounce, mínimo de caracteres, dedupe, `AbortController`, cache em memória com TTL
- [x] Resultados com thumbnail/título/canal, selecionar, ver no YouTube, prévia
- [x] Colar link mantido como alternativa (mesma estrutura de dados `SelectedMusic`)
- [x] Migração de rascunhos antigos (`musicUrl`/`musicVideoId` → `music`)
- [x] Analytics de música, tratamento de indisponibilidade, acessibilidade e mobile
- [x] Testes (Vitest) das funções puras e do serviço de busca

## Fase 2 — Persistência e infraestrutura mínima ✅
Substitui as limitações locais por uma infraestrutura mínima: criar, persistir,
publicar e abrir uma carta em qualquer dispositivo. **Sem pagamento real.**

- [x] Banco de dados PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`)
- [x] Modelo `Cart`/`CartMedia`/`Order`/`EmailDelivery` com enums e índices
- [x] Rascunho no backend, sem login, autorizado por **token de edição** (hash SHA-256)
- [x] Migração best-effort do rascunho local (Fase 1) para o backend
- [x] API de rascunho (`/api/carts*`) com validação central via Zod
- [x] Autosave no backend: debounce, "Salvando/Salvo/erro", descarte de respostas
      antigas, cache local de recuperação
- [x] Upload real de fotos (`StorageProvider`, implementação em disco local),
      validação de magic bytes também no servidor, remoção e reordenação persistidas
- [x] Persistência da música (`SelectedMusic` achatado no banco), sem guardar
      resultados de busca nem o termo pesquisado
- [x] `Order` + `PaymentProvider` mock, preço calculado **no servidor**
- [x] Confirmação de pagamento mock **idempotente** (transação atômica: pedido +
      publicação + slug + expiração)
- [x] Rota pública `/c/[slug]` servida pelo backend (Server Component), com `noindex`
- [x] QR Code (biblioteca `qrcode`) gerado sob demanda, nunca bloqueia a publicação
- [x] `EmailProvider` mock com outbox (`EmailDelivery`), único envio por pedido
- [x] Páginas `/checkout/[cartId]` e `/pedido/[orderId]/sucesso`
- [x] Testes unitários (funções puras) + testes de integração com banco real (opt-in)

## Fase 3 — Venda real
- [ ] `RealPaymentProvider` (Pix e cartão) atrás da interface `PaymentProvider`
- [ ] Webhook de confirmação (nunca confiar no retorno do navegador)
- [ ] Publicação após confirmação real
- [ ] E-mail real de entrega (link + QR Code)
- [ ] Tratamento de falhas (pending/failed/refunded/expired)
- [ ] Variáveis de ambiente de produção + termos/privacidade revisados

## Fase 4 — Melhorias posteriores (apenas documentar)
Assistente de IA, WhatsApp Cloud API, painel admin, cupons, afiliados, temas
premium, agendamento, senha, vídeo, i18n, edição pós-compra, recuperação de
carrinho, campanhas sazonais.

## Critérios de aceite do MVP
Ver seção 22 da task 001 e seção 39 da task 004 (Fase 2). Com a Fase 2, o produto
cobre: mobile+desktop, sem cadastro, criação em 4 etapas com autosave no backend,
preview fiel, até 6 fotos em carrossel com upload real, música persistida, seleção
de plano com preço definido pelo servidor, pedido + confirmação mock idempotente,
publicação real com slug seguro e expiração calculada, carta pública aberta em
qualquer navegador/dispositivo com `noindex`, QR Code, e-mail mock (outbox) e
botão de WhatsApp com o link público real.
Pendentes para Fase 3: pagamento real (Pix/cartão), webhook de provedor, e-mail
transacional real.
