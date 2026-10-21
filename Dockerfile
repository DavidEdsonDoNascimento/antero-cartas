# syntax=docker/dockerfile:1.7
# ===========================================================================
# Antero Cartas — imagem para hospedagem em contêiner (Coolify). docs/0011.
#
# A Vercel NÃO usa este arquivo: lá o build continua sendo `pnpm build` com a
# configuração de sempre (sem `output: "standalone"`).
#
# Estágios:
#   base         Node 24 (Debian bookworm — OpenSSL 3, exigido pelo motor de
#                migration do Prisma) + pnpm fixado no package.json via corepack
#   deps         dependências completas pelo pnpm-lock.yaml (frozen)
#   builder      `next build` em modo standalone; só variáveis públicas/de build
#   migrate-deps Prisma CLI + pg + dotenv, isolados (docker/migrate)
#   runner       imagem final: servidor standalone, usuário não root
#
# Segredos (DATABASE_URL, tokens do Mercado Pago, Resend, etc.) NUNCA são
# argumentos de build — são variáveis de ambiente do contêiner em runtime.
# ===========================================================================

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `postinstall` roda `prisma generate`, que precisa do schema e do
# prisma.config.ts (que importa src/lib/appEnv.ts).
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/lib/appEnv.ts ./src/lib/appEnv.ts
RUN corepack prepare --activate \
 && pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
FROM deps AS builder
COPY . .

# Variáveis de BUILD (ver docker/build-app.sh — lista fechada).
ARG APP_ENV
ARG PAYMENT_MODE
ARG SUPABASE_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_WHATSAPP_SUPPORT
ARG NEXT_PUBLIC_AI_WRITING_ASSISTANT
ARG NEXT_PUBLIC_MAX_CART_PHOTOS
ARG NEXT_PUBLIC_PLAN_LIMITED_PRICE
ARG NEXT_PUBLIC_PLAN_PERMANENT_PRICE
ARG NEXT_PUBLIC_PLAN_LIMITED_DURATION_DAYS
ARG NEXT_PUBLIC_YOUTUBE_SEARCH_ENABLED
ARG NEXT_PUBLIC_PAYMENT_MODE
ARG NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION
ARG NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_ANALYTICS_ENABLED
ARG NEXT_PUBLIC_ANALYTICS_CUSTOM_EVENTS_ENABLED

RUN sh docker/build-app.sh

# ---------------------------------------------------------------------------
FROM base AS migrate-deps
WORKDIR /migrate
COPY docker/migrate/package.json docker/migrate/pnpm-lock.yaml docker/migrate/pnpm-workspace.yaml ./
RUN corepack prepare --activate \
 && pnpm install --frozen-lockfile --prod

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="antero-cartas" \
      org.opencontainers.image.revision="${APP_VERSION}"

# openssl: biblioteca exigida pelo motor de migration do Prisma.
# curl: health check do Coolify (que roda curl/wget dentro do contêiner).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION} \
    STORAGE_PROVIDER=local \
    STORAGE_DIR=/data/uploads \
    STORAGE_PUBLIC_URL=/api/media \
    MEDIA_URL_STRATEGY=storage_key \
    STORAGE_REQUIRE_MOUNT=true \
    MIGRATE_ON_START=true

WORKDIR /app

# Código da aplicação: dono root, somente leitura para o processo.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Migrations: projeto mínimo à parte, com o mesmo prisma.config.ts do repo.
COPY --from=migrate-deps /migrate/node_modules ./.migrate/node_modules
COPY docker/migrate/package.json ./.migrate/package.json
COPY prisma ./.migrate/prisma
COPY prisma.config.ts ./.migrate/prisma.config.ts
COPY src/lib/appEnv.ts ./.migrate/src/lib/appEnv.ts
COPY scripts/migrateDeploy.mjs ./.migrate/scripts/migrateDeploy.mjs
COPY docker/entrypoint.sh /usr/local/bin/antero-entrypoint

# Únicos diretórios graváveis: cache do Next (otimização de imagem) e o volume
# de fotos. O volume nomeado montado em /data/uploads herda este dono.
RUN chmod 0755 /usr/local/bin/antero-entrypoint \
 && mkdir -p /app/.next/cache /data/uploads \
 && chown -R node:node /app/.next/cache /data

USER node
EXPOSE 3000
# Sem `VOLUME` de propósito: um volume anônimo esconderia a falta de um volume
# persistente de verdade (as fotos sumiriam ao recriar o contêiner). O
# entrypoint recusa iniciar se /data/uploads não estiver montado.

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/antero-entrypoint"]
