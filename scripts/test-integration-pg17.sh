#!/usr/bin/env bash
# Suíte completa (unitários + integração) contra um PostgreSQL 17 CONVENCIONAL
# e DESCARTÁVEL — sem Supabase, sem nenhum serviço externo (docs/0011).
#
#   pnpm test:integration:pg17
#
# - sobe postgres:17-alpine num contêiner próprio, só em 127.0.0.1, porta aleatória;
# - aplica as migrations com scripts/migrateDeploy.mjs (o mesmo caminho do contêiner);
# - roda `RUN_DB_TESTS=true pnpm test` com o ambiente SANEADO: as variáveis
#   abaixo são definidas explicitamente (vazias ou mock), então o .env.local
#   (que o vitest carrega) não consegue injetar credenciais reais — o dotenv
#   nunca sobrescreve uma variável já definida;
# - remove o contêiner e o diretório temporário ao final, com ou sem falha.
#
# Nunca aponte estes testes para um banco real: eles criam e apagam dados.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="antero-cartas-it-$$"
PASS="it-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
TMP="$(mktemp -d)"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

docker run -d --name "$NAME" -p 127.0.0.1::5432 \
  -e POSTGRES_DB=antero_it -e POSTGRES_USER=antero_it -e POSTGRES_PASSWORD="$PASS" -e TZ=UTC \
  postgres:17-alpine -c timezone=UTC >/dev/null

PORT="$(docker port "$NAME" 5432/tcp | head -1 | sed 's/.*://')"
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -h 127.0.0.1 -U antero_it -q 2>/dev/null && break
  sleep 1
done
echo "[it] PostgreSQL $(docker exec "$NAME" postgres --version | awk '{print $3}') descartável em 127.0.0.1:$PORT"

export DATABASE_URL="postgresql://antero_it:$PASS@127.0.0.1:$PORT/antero_it"
export DIRECT_URL="$DATABASE_URL"
export APP_ENV=local
export PAYMENT_MODE=mock NEXT_PUBLIC_PAYMENT_MODE=mock
export ALLOW_MOCK_PAYMENT_CONFIRMATION=true NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION=true
export EMAIL_MODE=mock DEV_EMAILS_ENABLED=false
export STORAGE_PROVIDER=local STORAGE_DIR="$TMP/uploads" STORAGE_PUBLIC_URL=/api/media
export MEDIA_URL_STRATEGY=stored MAINTENANCE_MODE=false
export YOUTUBE_SEARCH_MODE=mock YOUTUBE_API_KEY=""
export SUPABASE_URL="" SUPABASE_SERVICE_ROLE_KEY="" SUPABASE_STORAGE_BUCKET=""
export MERCADOPAGO_ACCESS_TOKEN="" MERCADOPAGO_WEBHOOK_SECRET="" NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=""
export RESEND_API_KEY="" EMAIL_FROM="" EMAIL_TEST_TO=""
export NEXT_PUBLIC_SENTRY_DSN="" SENTRY_DSN="" VERCEL_OIDC_TOKEN=""

cd "$ROOT"
node scripts/migrateDeploy.mjs
RUN_DB_TESTS=true pnpm exec vitest run "$@"
