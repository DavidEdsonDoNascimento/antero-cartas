# 010 — Diagnóstico completo e Roadmap · Antero Cartas

> **Data:** 2026-07-24
> **Origem:** resposta à task `009_roadmap_atual.md`.
> **Base:** leitura de README, `docs/0001`–`0005`, tasks 001–008 e da implementação
> atual; verificação executada (build, typecheck, testes) no commit `f44b153`.
> **Nada foi implementado.** Este documento é só análise e plano.

---

## 0. Verificação executada hoje

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ limpo |
| `npm test` (Vitest) | ✅ **101 passando**, 7 pulados (integração, opt-in) em 15 arquivos |
| `npm run build` | ✅ limpo — **20 rotas** (5 estáticas, 15 dinâmicas) |
| `.env.local` ativo | `STORAGE_PROVIDER=supabase`, `PAYMENT_MODE=mock`, `EMAIL_MODE=mock`, `YOUTUBE_SEARCH_MODE=real`, `NEXT_PUBLIC_APP_URL=http://localhost:3000` |

O código está **saudável**. Não há nada quebrado. O que falta é infraestrutura
comercial, não correção.

---

# 1. Estado atual

## 1.1 O que está concluído

**Fase 1 — Protótipo navegável (✅)**
Identidade visual por tokens, landing com 11 seções, fluxo de criação em 4 etapas
com preview fiel em tempo real, envelope animado com `prefers-reduced-motion`,
contador de tempo, 4 temas, compartilhamento por WhatsApp, termos e privacidade,
responsividade mobile-first.

**Fase 1.1 — Refinamento (✅)**
Limite central de 6 fotos (`MAX_CART_PHOTOS`), carrossel próprio sem dependência
externa (swipe, teclado, autoplay, crossfade), gestão completa de fotos (capa,
reordenar, remover), temas visualmente distintos dirigidos por tokens.

**Fase 1.2 — Música (✅)**
Busca via YouTube Data API v3 por rota server-side, modos mock/real/disabled,
chave só no servidor (confirmado fora do bundle), debounce + dedupe +
`AbortController` + cache TTL, colar link como alternativa, sem extração de áudio.

**Fase 2 — Persistência e infraestrutura mínima (✅)**
Prisma 7 + PostgreSQL no Supabase com driver adapter; entidades `Cart`,
`CartMedia`, `Order`, `EmailDelivery`; token de edição de 256 bits (só o hash no
banco, `timingSafeEqual`); API de rascunho validada com Zod; autosave com
descarte de resposta obsoleta; upload real com validação de magic bytes no
servidor; pedido com **preço calculado no servidor**; confirmação mock
**idempotente** em transação atômica (pedido pago + slug + expiração +
publicação); slug de ≥128 bits; rota pública `/c/[slug]` como Server Component
com `noindex`; QR Code que nunca bloqueia a publicação; e-mail mock como outbox
único por pedido.

**Pós-Fase 2 — Supabase Storage (✅, não estava previsto no handoff 007)**
`SupabaseStorageProvider` implementado via REST (`src/server/storage/supabaseStorage.ts`),
bucket público com chave inadivinhável e sem política de listagem (D39–D44),
script idempotente `npm run storage:setup`. **O storage de produção deixou de ser
bloqueante** — é o avanço mais relevante desde o handoff.

**Task 008 — Correções de UX (✅)**
Prefetch da sessão no clique do CTA (D45), skeleton fiel em vez de tela branca,
cache local morre junto com a sessão (D46), retomada de rascunho como decisão
explícita do usuário (D47), preview otimista de foto (D48). Cobertas por
`src/lib/draftInit.test.ts`.

## 1.2 O que foi validado de verdade

- Migration `20260722204423_init` aplicada no Supabase real.
- Smoke test HTTP ponta a ponta contra servidor de produção + Supabase: criação
  de rascunho, rejeição de token inválido (401), upload servível, **tentativa de
  adulterar preço ignorada** (`amount:1` → 1890 centavos), confirmação →
  publicação, **idempotência** (2ª confirmação devolve mesmo slug e `paidAt`),
  carta pública sem vazar token/e-mail, **1 única** entrega de e-mail.
- Segredos (`DATABASE_URL`, `YOUTUBE_API_KEY`) confirmados fora do bundle do
  cliente por teste com chaves sentinela.
- Pooler transaction-mode (6543/pgbouncer) operando com transações interativas.
- Supabase Storage validado manualmente (relato da task 008).
- Guarda de produção de `/api/dev/emails` retornando 409 em `npm start`.

## 1.3 O que está parcialmente implementado

| Item | Estado |
|---|---|
| **Pagamento** | Interface `PaymentProvider` pronta e testada, mas **só existe `MockPaymentProvider`**. `getPaymentProvider()` lança erro se `PAYMENT_MODE=real`. |
| **E-mail** | Interface + outbox (`EmailDelivery`) + template prontos; **`MockEmailProvider` não envia nada**. |
| **Analytics** | 27 eventos nomeados e instrumentados, mas `track()` só faz `console.debug` em dev. **Zero dado coletado.** |
| **Rate limiting** | Interface `RateLimiter` correta, implementação **em memória por instância** — inócua em serverless. |
| **Domínio** | `site.url` tem placeholder `cartas.anterosistemas.com.br`; `.env.local` aponta para `localhost:3000`. **QR Code e link público hoje apontam para localhost.** |
| **Termos / Privacidade** | Páginas existem, textos são **rascunho sem revisão jurídica**. |
| **Depoimentos** | Fictícios, marcados como demonstração. **Não podem ir ao ar.** |
| **Garantia** | `guarantee.enabled: false` — seção some da landing até validar. |
| **SEO** | Metadata em pt-BR + `robots.ts` ok, mas **sem `sitemap.ts`** (robots aponta para um `/sitemap.xml` que dá 404) e **sem imagem OG**. |

## 1.4 Decisões arquiteturais já tomadas (48 registradas em `0004_Decisions.md`)

As que restringem o que vem a seguir:

- **Sem login.** Autorização por token de edição no `localStorage` (D30).
- **Preço sempre no servidor**; cliente só envia `planType` (D32).
- **Publicação só dentro da confirmação de pagamento**, em transação (D33).
- **E-mail como outbox**, único por pedido; publicação não depende do envio (D34).
- **Todo fornecedor atrás de interface** trocável por env (storage, pagamento,
  e-mail). É o que torna a Fase 3 barata.
- **Upload passa pelo servidor Next**, não por URL assinada (D41) — decisão
  consciente com custo conhecido.
- **Bucket público com chave inadivinhável**, sem política de listagem (D42).
- **Prisma 7**: URLs em `prisma.config.ts`, nunca no schema.
- **Testes de integração com opt-in** `RUN_DB_TESTS=true` (D38).

---

# 2. Pendências (tudo que falta, por categoria)

Legenda de classificação (seção 3): **[C]** crítico para produção ·
**[I]** importante para conversão · **[M]** melhoria desejável ·
**[F]** pode esperar versões futuras.

## Infraestrutura
- **[C]** Deploy em produção — não existe `vercel.json`, `Dockerfile` nem host escolhido.
- **[C]** `prisma migrate deploy` no pipeline de build (hoje nem está no `package.json`).
- **[C]** Variáveis de ambiente de produção configuradas no host.
- **[C]** Banco de produção separado do de desenvolvimento (hoje é o mesmo projeto Supabase).
- **[C]** `.env.example` **não está versionado** — o `.gitignore` usa `.env*`, que o captura. O README manda `cp .env.example .env.local` e o arquivo não existe para quem clonar.
- **[I]** Limpar dados de teste do banco antes do lançamento (`@seed.local`, cartas de smoke).
- **[M]** CI (GitHub Actions) rodando lint + typecheck + testes no push.
- **[F]** Redis / store compartilhado para rate limit e cache.

## Backend
- **[C]** `RealPaymentProvider` (Pix + cartão) atrás da interface existente.
- **[C]** **Webhook idempotente** do provedor de pagamento — nunca confiar no retorno do navegador.
- **[C]** Publicação disparada pelo webhook, não pelo `mock-confirm`.
- **[C]** Desligar `/api/orders/[id]/mock-confirm` em produção (hoje protegido por `ALLOW_MOCK_PAYMENT_CONFIRMATION`, mas a rota existe).
- **[C]** `RealEmailProvider` usando o outbox já pronto.
- **[C]** Reprocessamento de e-mail falho (o outbox tem status `FAILED` e ninguém lê).
- **[I]** Tratamento completo dos estados `PENDING`/`FAILED`/`REFUNDED`/`EXPIRED` vindos do provedor.
- **[I]** Job de expiração de cartas (hoje a expiração é só verificada na leitura; nada limpa fotos de cartas expiradas — **custo de storage cresce para sempre**).
- **[M]** Rate limit distribuído nas rotas de escrita.
- **[F]** Painel administrativo (ver pedidos, reenviar e-mail, estornar).

## Frontend
- **[C]** Página de retorno do pagamento real (aprovado / pendente Pix / recusado).
- **[C]** Tela de Pix com QR Code do pagamento + copia-e-cola + polling de status.
- **[I]** Recuperação do link da carta por e-mail ("perdi meu link").
- **[I]** Página de erro 404/500 com identidade visual.
- **[M]** Substituir os SVGs default do Next em `public/`.
- **[F]** Edição da carta após a compra.

## UX/UI
- **[I]** Prova social real substituindo os depoimentos fictícios.
- **[I]** Aviso claro, antes do pagamento, de que o link fica **preso ao navegador** até chegar o e-mail.
- **[M]** Revisão de acessibilidade (contraste, foco visível, leitor de tela) no fluxo de criação.
- **[M]** Estados de erro de upload mais explícitos (foto muito grande, formato inválido).
- **[F]** Onboarding/tour na primeira visita ao `/criar`.

## Performance
- **[I]** Verificar o **limite de payload da função serverless** (Vercel: ~4,5 MB por request). O upload passa pelo servidor Next (D41); a compressão no cliente mitiga, mas precisa ser testado em produção com foto de celular moderno.
- **[M]** Servir fotos com CDN/transformação (o Supabase Storage já oferece).
- **[M]** `next/image` com `remotePatterns` para o domínio do Supabase.
- **[F]** URL assinada de upload direto ao bucket, tirando o servidor do caminho.

## Segurança
- **[C]** Rotação/confirmação de que a `service_role` do Supabase **não** vazou para o cliente em produção.
- **[C]** Validação de assinatura do webhook de pagamento.
- **[I]** Rate limit efetivo nas rotas de criação e upload (hoje é por instância).
- **[I]** Cabeçalhos de segurança (CSP, `X-Frame-Options`, HSTS) — hoje `next.config.ts` está praticamente vazio.
- **[M]** Recalcular dimensões da imagem no servidor (hoje são *hints* do cliente — é metadado, não controle de segurança, mas é dívida registrada).
- **[F]** Proteção anti-bot no `/criar` (captcha só se houver abuso real).

## Testes
- **[I]** Teste de integração do webhook de pagamento (idempotência, assinatura inválida, evento duplicado).
- **[I]** Teste do fluxo de e-mail real (com provider fake, sem enviar).
- **[M]** Teste end-to-end de navegador (Playwright) do caminho crítico: criar → pagar → abrir.
- **[M]** Rodar os 7 testes de integração no CI contra um banco de teste dedicado.
- **[F]** Teste de carga.

## Documentação
- **[C]** Versionar `.env.example` (corrigir `.gitignore` com `!.env.example`).
- **[I]** Runbook de produção: como fazer deploy, como rodar migration, o que fazer se um pagamento não publicar a carta.
- **[I]** Atualizar README e `0002_MVP_Plan.md` — ambos ainda dizem "pagamento real não implementado" e "storage local", e o storage já mudou.
- **[M]** Documentar o contrato do webhook escolhido.

## SEO
- **[I]** `sitemap.ts` — hoje o `robots.txt` aponta para um sitemap que retorna 404.
- **[I]** Imagem OG/Twitter card — link do site compartilhado no WhatsApp aparece **sem imagem**, e o produto é vendido justamente por compartilhamento.
- **[I]** Domínio real com HTTPS e canonical corretos.
- **[M]** Dados estruturados (`Product`/`FAQPage`) — a landing já tem 9 FAQs prontas para marcar.
- **[F]** Landing pages sazonais (Dia das Mães, Namorados).

## Observabilidade
- **[C]** Error tracking (Sentry ou equivalente) — hoje **não há nada**. Se um pagamento aprovar e a publicação falhar, ninguém fica sabendo.
- **[I]** Log estruturado nas rotas de pedido e webhook.
- **[M]** Alerta de falha (e-mail/WhatsApp) para erro em pagamento.
- **[F]** Dashboard de saúde / uptime check.

## Analytics
- **[I]** Plugar um sink real no `track()` (os 27 eventos já estão instrumentados — é trocar a implementação de uma função).
- **[I]** Funil mínimo: `landing_viewed → create_started → checkout_started → payment_confirmed`. **Sem isso você não sabe onde perde venda.**
- **[M]** Origem de tráfego (UTM) persistida no pedido.
- **[F]** Testes A/B de preço e copy.

## LGPD
- **[C]** Política de privacidade revisada por quem entende (hoje é rascunho).
- **[C]** Identificação do fornecedor no site (razão social, CNPJ, contato) — exigência do CDC para e-commerce.
- **[C]** Direito de arrependimento (art. 49 do CDC, 7 dias) tratado explicitamente no texto — produto digital entregue na hora exige redação cuidadosa.
- **[I]** Base legal e prazo de retenção dos dados do comprador (nome, e-mail, telefone) declarados.
- **[I]** Canal para exclusão de dados a pedido do titular.
- **[M]** Banner de cookies **se** entrar analytics com cookie (com uma ferramenta cookieless, não precisa).

## Pagamento
- **[C]** Escolher o provedor. Para o Brasil, com Pix + cartão + baixo atrito: **Mercado Pago** (Pix instantâneo, checkout transparente, sem exigir conta do comprador) ou **Pagar.me/Stripe**. Stripe tem Pix, mas o suporte a Pix é mais recente e o público-alvo já confia no Mercado Pago.
- **[C]** Conta de recebimento (PJ ou PF) validada e homologada.
- **[C]** Webhook com validação de assinatura + idempotência por `providerPaymentId` (o índice único **já existe** no schema).
- **[I]** Página de status de pagamento pendente (Pix pode levar minutos).
- **[M]** Cupom de desconto.
- **[F]** Assinatura/recorrência — não faz sentido no modelo de pagamento único.

## E-mail
- **[C]** Provedor transacional (Resend é o mais simples; SendGrid/SES como alternativa).
- **[C]** Domínio verificado com **SPF + DKIM + DMARC** — sem isso o e-mail com o link cai em spam e o cliente acha que foi golpe.
- **[C]** E-mail de entrega com link + QR Code.
- **[I]** E-mail de recuperação de link ("reenviar minha carta").
- **[M]** E-mail de aviso de expiração próxima no plano Essencial (oportunidade de upsell para o Para Sempre).
- **[F]** Recuperação de carrinho abandonado.

## Domínio
- **[C]** Registrar/confirmar o domínio (`cartas.anterosistemas.com.br` é placeholder no código).
- **[C]** Definir `NEXT_PUBLIC_SITE_URL` e `NEXT_PUBLIC_APP_URL` — **link público e QR Code são montados a partir daí**. QR Code gerado com URL errada é irrecuperável depois de impresso/enviado.
- **[C]** DNS + certificado.
- **[I]** Subdomínio de e-mail para o transacional.

## Deploy
- **[C]** Escolher host. **Vercel** é o caminho natural (Next 16, zero config), com a ressalva do limite de payload no upload.
- **[C]** Build com `prisma generate` + `prisma migrate deploy`.
- **[C]** `ALLOW_MOCK_PAYMENT_CONFIRMATION=false` e `DEV_EMAILS_ENABLED=false` em produção.
- **[I]** Ambiente de staging/preview com banco próprio.
- **[M]** Rollback documentado.

## Monitoramento
- **[I]** Uptime check externo na landing e em `/c/[slug]`.
- **[I]** Alerta de erro em rota de pagamento.
- **[M]** Monitorar consumo do Supabase (storage e banco) contra o limite do plano.
- **[F]** APM / tracing.

## Melhorias futuras (todas **[F]**)
Assistente de escrita com IA (flag já existe), WhatsApp Cloud API, painel admin,
cupons, programa de afiliados, temas premium, agendamento de entrega, senha na
carta, vídeo, i18n, edição pós-compra, recuperação de carrinho, campanhas
sazonais, presente físico (cartão impresso com QR).

---

# 3. Classificação consolidada

## Crítico para produção (bloqueia a primeira venda)
1. Provedor de pagamento real + webhook idempotente + assinatura validada
2. Provedor de e-mail transacional real + SPF/DKIM/DMARC
3. Domínio definitivo + `NEXT_PUBLIC_APP_URL` (QR Code / link)
4. Deploy configurado + `prisma migrate deploy` + variáveis de produção
5. Banco de produção separado + limpeza dos dados de teste
6. Mock de pagamento desligado em produção
7. Error tracking (Sentry)
8. LGPD/CDC: privacidade revisada, identificação do fornecedor, direito de arrependimento
9. Depoimentos fictícios removidos ou substituídos
10. WhatsApp de suporte real (hoje é `5599999999999`)
11. `.env.example` versionado

## Importante para conversão
Imagem OG · sitemap · analytics com sink real · funil mínimo · recuperação de
link por e-mail · aviso sobre link preso ao navegador · página de Pix pendente ·
prova social real · cabeçalhos de segurança · rate limit efetivo · tratamento
completo dos estados de pagamento · runbook · atualização do README.

## Melhoria desejável
CI · `next/image` com CDN · Playwright · acessibilidade · página 404/500 com
marca · dados estruturados · staging · limpeza dos assets default · alerta de
falha · recálculo de dimensões no servidor.

## Pode esperar versões futuras
Redis · URL assinada de upload · painel admin · cupons · IA · WhatsApp Cloud API ·
afiliados · temas premium · i18n · edição pós-compra · teste de carga · APM.

---

# 4. Roadmap

## Fase 2.5 — Preparação para produção *(pré-requisitos que não dependem do provedor de pagamento)*

**Objetivo:** deixar tudo pronto para que a Fase 3 seja só "plugar o pagamento".

**Funcionalidades**
- Registrar domínio, configurar DNS, definir `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`
- Projeto Supabase de produção (banco + bucket) separado do de desenvolvimento
- Deploy na Vercel com `prisma migrate deploy` no build
- `sitemap.ts` + imagem OG + cabeçalhos de segurança
- Sentry (client + server)
- `.env.example` versionado; README e `0002_MVP_Plan.md` atualizados
- **Teste real de upload em produção** para medir o limite de payload

**Tempo estimado:** 1 a 2 dias
**Riscos:** propagação de DNS; upload estourar o limite da Vercel (mitigação: baixar o alvo de compressão no cliente ou, no pior caso, antecipar a URL assinada)
**Dependências:** decisão de domínio e de host (só suas)

---

## Fase 3 — Venda real *(o marco comercial)*

**Objetivo:** receber dinheiro de verdade e entregar a carta de forma confiável.

**Funcionalidades**
- `RealPaymentProvider` com Pix + cartão atrás da interface existente
- Checkout com Pix (QR + copia-e-cola) e cartão
- **Webhook idempotente** com assinatura validada; publicação **só** por ele
- `mock-confirm` bloqueado em produção
- Estados `PENDING`/`FAILED`/`REFUNDED`/`EXPIRED` tratados na UI
- `RealEmailProvider` (Resend) reusando o outbox; SPF/DKIM/DMARC
- Reprocessamento de e-mail com status `FAILED`
- Termos e privacidade revisados; identificação do fornecedor; direito de arrependimento
- Depoimentos e número de WhatsApp reais
- Testes de integração do webhook

**Tempo estimado:** 3 a 5 dias de desenvolvimento + 1 a 5 dias de espera pela
homologação/aprovação da conta no provedor (esse prazo é externo — **comece a
abrir a conta agora**)
**Riscos:** homologação do provedor; webhook não chegar (mitigação: polling de
status como rede de segurança); e-mail cair em spam sem DNS correto
**Dependências:** Fase 2.5 completa (o webhook precisa de URL pública)

> **Fim da Fase 3 = produto vendável.** É aqui que o lançamento acontece.

---

## Fase 3.5 — Instrumentação pós-lançamento *(primeira semana vendendo)*

**Objetivo:** enxergar o que acontece com usuário real antes de mudar qualquer coisa.

**Funcionalidades**
- Sink real no `track()` (Vercel Analytics ou Plausible — cookieless evita banner)
- Funil `landing → criar → checkout → pago`
- Uptime check + alerta de erro em pagamento
- Recuperação de link por e-mail
- Correções vindas dos primeiros clientes reais

**Tempo estimado:** 1 a 2 dias
**Riscos:** baixo
**Dependências:** vendas acontecendo (sem tráfego, o dado não diz nada)

---

## Fase 4 — Conversão

**Objetivo:** vender mais para o mesmo tráfego.

**Funcionalidades**
- Prova social real (depoimentos, contador de cartas criadas)
- Cupons de desconto
- E-mail de aviso de expiração → upsell para o "Para Sempre"
- Landing pages sazonais (Dia dos Namorados, Dia das Mães)
- Dados estruturados + SEO de conteúdo
- Testes A/B de preço e copy

**Tempo estimado:** 3 a 5 dias
**Riscos:** otimizar sem volume estatístico
**Dependências:** Fase 3.5 (sem funil, é chute)

---

## Fase 5 — Escala e operação

**Objetivo:** aguentar volume e reduzir suporte manual.

**Funcionalidades**
- Painel administrativo (pedidos, reenvio de e-mail, estorno)
- Rate limit e cache em Redis
- URL assinada de upload direto ao bucket
- Job de expiração + limpeza de fotos de cartas expiradas
- CDN/transformação de imagem
- Playwright no CI

**Tempo estimado:** 5 a 8 dias
**Riscos:** construir cedo demais — só faz sentido com volume real
**Dependências:** sinais concretos de gargalo (ver seção 6)

---

## Fase 6 — Produto ampliado *(só com receita comprovada)*
Assistente de IA, WhatsApp Cloud API, temas premium, agendamento, senha na carta,
vídeo, i18n, edição pós-compra, afiliados, presente físico com QR.

---

# 5. MVP Comercial

**O menor conjunto para colocar no ar e começar a vender.**

A boa notícia: o produto já faz tudo que o cliente compra. Criação, persistência,
publicação, link privado, QR Code, WhatsApp e storage de produção **já funcionam
e foram validados**. Falta apenas **cobrar** e **entregar por e-mail**.

## Obrigatório antes do lançamento (11 itens)

| # | Item | Por quê |
|---|---|---|
| 1 | Pagamento real (Pix + cartão) | Sem isso não existe venda |
| 2 | Webhook idempotente com assinatura | Confiar no navegador = carta publicada sem pagamento |
| 3 | `mock-confirm` desligado em produção | Qualquer pessoa publicaria de graça |
| 4 | E-mail transacional real | O comprador fecha a aba e perde o produto que pagou — chargeback garantido |
| 5 | SPF/DKIM/DMARC no domínio | E-mail em spam = cliente acha que foi golpe |
| 6 | Domínio + `NEXT_PUBLIC_APP_URL` | **QR Code e link são montados com essa URL.** Errado aqui é irrecuperável depois de enviado |
| 7 | Deploy + `prisma migrate deploy` + banco de produção | Óbvio |
| 8 | Sentry | Pagamento que falha silencioso é dinheiro recebido sem entrega |
| 9 | Termos/privacidade revisados + CNPJ + direito de arrependimento | Exigência legal de e-commerce (CDC + LGPD) |
| 10 | Depoimentos fictícios removidos | Publicar depoimento inventado é publicidade enganosa |
| 11 | WhatsApp de suporte real | Hoje o número é `5599999999999` |

**Esforço total:** ~5 a 7 dias de desenvolvimento, mais o prazo externo de
homologação do provedor de pagamento.

## Pode ficar para depois das primeiras vendas

Analytics e funil · imagem OG e sitemap · recuperação de link por e-mail · rate
limit distribuído · cupons · CI · Playwright · painel admin · Redis · URL
assinada · job de expiração · acessibilidade avançada · página 404 com marca ·
IA · WhatsApp Cloud API.

> Nenhum desses impede a primeira venda. Com poucas vendas por dia, suporte
> manual pelo WhatsApp resolve qualquer exceção — e ensina mais sobre o produto
> do que qualquer painel construído antes da hora.

---

# 6. Escalabilidade — quando cada coisa passa a doer

A arquitetura atual (Next serverless + Postgres gerenciado + storage de objetos)
é a escolha certa para este produto. Os gargalos abaixo são de **custo** antes de
serem de performance.

## Até ~1.000 cartas
**Nada quebra tecnicamente.** O primeiro limite é **financeiro, não técnico**:

- **Storage** — ~6 fotos × ~300 KB ≈ **2 MB por carta**. Mil cartas ≈ **2 GB**,
  acima do free tier do Supabase (1 GB). *Primeiro gargalo real, e chega antes do
  que se imagina.*
- **Cota do YouTube** — busca custa ~100 unidades e a cota diária padrão é 10.000.
  São ~100 buscas/dia. Com dezenas de usuários simultâneos criando cartas, isso
  estoura. Já existe fallback (429 → "cole o link"), mas a experiência piora.
- **Cartas do plano "Para Sempre" nunca expiram** — o custo de storage é
  monotônico crescente. Precifique isso mentalmente antes de vender muito.

**Ação:** apenas monitorar consumo do Supabase e solicitar aumento de cota do
YouTube quando as buscas passarem de ~80/dia. Nenhuma mudança de arquitetura.

## Até ~10.000 cartas
- **Rate limit e cache em memória perdem o sentido** — com múltiplas instâncias
  serverless, cada uma tem seu contador. É quando o Redis passa a valer.
- **Upload pelo servidor Next** vira custo relevante de execução de função (cada
  foto ocupa uma invocação pelo tempo do upload). É quando a URL assinada de
  upload direto se paga.
- **Fotos de cartas expiradas acumulam** — é quando o job de limpeza se paga.
- **Suporte manual não escala** — é quando o painel admin se paga.
- Storage na casa de ~20 GB: plano pago do Supabase, ainda barato.

**Ação:** Redis, URL assinada, job de expiração, painel admin. Nada antes disso.

## Até ~100.000 cartas
- **Connection pool do Postgres** — já mitigado pelo pooler transaction-mode,
  mas é o ponto a observar sob concorrência alta.
- **Leitura de cartas públicas** domina o tráfego (cada carta é aberta várias
  vezes e compartilhada) — é quando cache/ISR na rota `/c/[slug]` e read replica
  passam a valer.
- **CDN para fotos** vira obrigatória.
- **Fila para e-mails** (o outbox já está modelado para isso — só falta o worker).
- Storage ~200 GB: custo passa a ser linha de planilha, não detalhe.

**Ação:** cache na rota pública, CDN, read replica, worker de e-mail.

> **Resumo honesto:** nada na arquitetura atual precisa mudar para os primeiros
> milhares de clientes. O que muda primeiro é a **conta do Supabase**, não a
> latência.

---

# 7. Dívida técnica

## Alta

**1. Upload passa pelo servidor Next (D41)**
Cada foto ocupa uma invocação de função pelo tempo do upload e está sujeita ao
limite de payload da plataforma (~4,5 MB na Vercel). *Impacto:* upload pode
**falhar em produção** com foto de celular moderno se a compressão do cliente não
der conta — e é a etapa mais emocional do fluxo. **Precisa ser testado em
produção antes do lançamento**, não depois.

**2. Sem login e sem recuperação de acesso**
O token vive no `localStorage`. Quem limpa o navegador, troca de celular ou usa
aba anônima **perde o rascunho e o acesso ao checkout**. *Impacto:* perda direta
de conversão e volume de suporte. O e-mail transacional da Fase 3 mitiga o caso
pós-compra; o rascunho abandonado continua irrecuperável.

**3. Rate limit e cache em memória por instância**
*Impacto:* em serverless a proteção é praticamente nula — a cota do YouTube e as
rotas de escrita ficam expostas a abuso trivial. Baixo risco hoje, alto no dia
em que alguém resolver testar.

**4. Nenhuma observabilidade**
Não há error tracking, log estruturado nem alerta. *Impacto:* **o pior tipo de
falha é a silenciosa** — pagamento aprovado, publicação falha, ninguém descobre
até o cliente reclamar. Barato de resolver, caro de não ter.

## Média

**5. Analytics é `console.debug`**
27 eventos instrumentados e nenhum dado coletado. *Impacto:* você vai vender às
cegas, sem saber em qual etapa perde o cliente. A instrumentação já está feita —
falta só o sink.

**6. `robots.txt` aponta para um sitemap inexistente**
*Impacto:* 404 para o crawler; sinal negativo pequeno mas gratuito de corrigir.

**7. Sem imagem OG**
*Impacto:* o link do site compartilhado no WhatsApp aparece sem imagem. Para um
produto que **vive de compartilhamento**, isso é conversão perdida.

**8. `.env.example` não versionado**
O `.gitignore` usa `.env*` e engole o arquivo. *Impacto:* o README dá uma
instrução (`cp .env.example .env.local`) que não funciona em um clone limpo.

**9. Documentação desatualizada**
README e `0002_MVP_Plan.md` ainda dizem "storage local" e "pagamento real não
implementado" — o storage já mudou. *Impacto:* confunde quem retomar o projeto.

**10. Sem CI**
Lint, typecheck e testes dependem de disciplina manual. *Impacto:* baixo hoje
(um dev), cresce com o time.

**11. Fotos de cartas expiradas nunca são removidas**
*Impacto:* custo de storage cresce indefinidamente por dados sem valor.

## Baixa

**12. Dimensões de imagem são *hints* do cliente** — metadado, não controle de segurança; já documentado.
**13. Depoimentos fictícios** — resolvido no checklist de lançamento.
**14. Migração de rascunho legado da Fase 1** — código que existe para um caso que praticamente não ocorre mais; candidato a remoção.
**15. Assets default do Next em `public/`** — cosmético.
**16. Rota `/api/media/[...path]`** — só serve o storage local; virará código morto quando produção for 100% Supabase.

---

# 8. Próxima recomendação — **UMA fase**

## ▶ Fase 2.5 — Preparação para produção

**Não é a Fase 3.** E a diferença importa.

### Por que ela antes de tudo

**Velocidade para colocar no ar.**
É a única fase cujo trabalho é 100% **seu** — não depende de aprovar conta em
provedor de pagamento nem de homologação. São 1–2 dias que você controla
integralmente. E ela **destrava** a Fase 3: webhook de pagamento **exige URL
pública com HTTPS**. Sem domínio e deploy, a Fase 3 simplesmente não pode ser
testada de ponta a ponta — você escreveria o código sem conseguir validá-lo.

**Experiência do usuário.**
O `NEXT_PUBLIC_APP_URL` é o item mais perigoso do projeto inteiro. **QR Code e
link público são montados a partir dele.** Um QR Code gerado com a URL errada é
irrecuperável: já foi enviado, já foi impresso, já está no presente. Esse valor
precisa estar certo **antes** da primeira venda, não durante.

**Risco técnico.**
A Fase 2.5 é a fase que **descobre problemas**, e descobrir agora é barato. O
upload passando pelo servidor Next (dívida alta nº 1) só se prova em produção —
se estourar o limite de payload da Vercel, isso muda o desenho da Fase 3 e você
precisa saber **antes** de escrever o código de pagamento, não depois de já ter
clientes. Fazer a Fase 3 primeiro significaria construir a parte comercial em
cima de um deploy nunca testado.

**Potencial de vendas.**
Sozinha ela não vende nada — e é exatamente por isso que deve ser curta e
imediata. Ela é o custo fixo mínimo para que a Fase 3 valha alguma coisa. Um
provedor de pagamento perfeitamente integrado em `localhost` fatura **zero**.

### Escopo sugerido (nesta ordem)

1. Registrar o domínio e configurar DNS
2. Criar o projeto Supabase de **produção** (banco + bucket), separado do de dev
3. Deploy na Vercel com `prisma generate` + `prisma migrate deploy` no build
4. Definir `NEXT_PUBLIC_SITE_URL` e `NEXT_PUBLIC_APP_URL` reais e **conferir o QR Code apontando para o domínio certo**
5. **Testar upload real em produção** com foto de celular sem redimensionar — é o teste que mais informa
6. Sentry (client + server)
7. `sitemap.ts` + imagem OG + cabeçalhos de segurança em `next.config.ts`
8. Corrigir o `.gitignore` e versionar `.env.example`
9. Atualizar README e `0002_MVP_Plan.md`

**Tempo:** 1 a 2 dias.

### Uma ação para fazer hoje, em paralelo

**Abra a conta no provedor de pagamento agora.** A homologação leva de 1 a 5 dias
úteis e é o único prazo do projeto que não depende de você. Se ela começar a
correr hoje, provavelmente estará pronta no momento em que a Fase 2.5 terminar —
e a Fase 3 começa sem espera.

> Nada foi implementado. Aguardando sua decisão sobre a fase e sobre o provedor
> de pagamento.
