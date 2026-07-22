# 0003 — Architecture · Antero Cartas

## Stack
- **Next.js 16** (App Router) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4** (tokens via `@theme` em `globals.css`)
- `next/font` (Playfair Display, Inter, Dancing Script)
- Sem backend separado: as rotas server-side do Next atendem o MVP.

> **Nota Next 16**: `params`/`searchParams` são `Promise` e precisam de `await`.
> Componentes são Server por padrão; interatividade usa `"use client"`.

## Princípio: arquitetura proporcional
Sem microsserviços, filas ou abstrações complexas. Pagamento, e-mail e
armazenamento são expostos por **interfaces simples** para troca futura de
provedor (ver Fases 2 e 3).

## Estrutura de pastas
```
src/
  app/                 Rotas (App Router)
    page.tsx           Landing
    criar/             Fluxo de criação
    c/[slug]/          Carta pública (noindex)
    demonstracao/      Carta fictícia de demonstração
    termos/ privacidade/
    robots.ts          Bloqueia /c/ em buscas
  components/
    landing/           Seções da landing
    create/            Etapas do fluxo + orquestrador
    card/              Preview, envelope/abertura, loader
    analytics/         TrackView
  config/              site, plans, flags  (fonte única de verdade)
  content/             recipients, occasions, themes, templates, faq,
                       testimonials, demoCart  (textos/dados centralizados)
  lib/                 types, storage, slug, youtube, image, counter,
                       whatsapp, analytics
```

## Fluxo de dados (Fase 1)
- O estado da carta vive no cliente (`CreateFlow`), com **autosave** em
  `localStorage` (sem imagens grandes — só texto/config).
- As **fotos** são comprimidas no cliente (canvas → JPEG) e mantidas em memória;
  ao publicar, a carta completa é gravada por `slug` no `localStorage`.
- `/c/[slug]` lê a carta publicada localmente (`CardLoader`).
- Na **Fase 2**, `lib/storage.ts` é substituído por chamadas de API + Prisma,
  preservando a forma de dados de `lib/types.ts`.

## Modelo de dados (`lib/types.ts`)
- **Cart** — conteúdo da carta, tema, música, contador, plano, status, slug.
- **CartMedia** — fotos (posição, url/storageKey).
- **Order** — dados do pedido/pagamento (Fase 3).
- Enums: `CartStatus`, `PlanType`, `PaymentMethod`, `OrderStatus`.

## Segurança
- **YouTube**: só URLs de hosts permitidos; ID validado por regex; nunca HTML
  de embed do usuário (`lib/youtube.ts`).
- **Imagens**: MIME real via magic bytes (não confia na extensão), sem SVG/
  executáveis, limite de tamanho, compressão, nomes não previsíveis (`lib/image.ts`).
- **Slug**: gerado por Web Crypto, longo e difícil de adivinhar (`lib/slug.ts`).
- **Cartas**: `noindex` + `robots.ts`, sem galeria pública.
- **Analytics**: nunca inclui dados pessoais nem conteúdo da carta.

## Configuração
Marca, copy, preços e flags ficam em `src/config/*` e são sobrescrevíveis por
variáveis `NEXT_PUBLIC_*` (ver `.env.example`). Nada de preço hardcoded nos
componentes.
