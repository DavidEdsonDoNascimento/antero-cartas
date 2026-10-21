#!/bin/sh
# Build do Next.js dentro da imagem (estágio "builder" do Dockerfile).
#
# Só as variáveis da lista abaixo podem influenciar o build. Elas são:
#   - NEXT_PUBLIC_*: embutidas no bundle do navegador (públicas por natureza);
#   - APP_ENV, PAYMENT_MODE, SUPABASE_URL, NEXT_PUBLIC_SENTRY_DSN: lidas por
#     next.config.ts para validar o modo de pagamento e montar CSP/HSTS, que
#     ficam fixados no build.
# Nenhum segredo (token, senha, chave privada, DATABASE_URL) entra no build:
# eles são variáveis de RUNTIME do contêiner.
#
# Um ARG não informado chega aqui como string vazia; para o código, "" não é o
# mesmo que ausente (`process.env.X ?? padrão`), então as vazias são removidas.
set -eu

BUILD_VARS="
APP_ENV
PAYMENT_MODE
SUPABASE_URL
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_WHATSAPP_SUPPORT
NEXT_PUBLIC_AI_WRITING_ASSISTANT
NEXT_PUBLIC_MAX_CART_PHOTOS
NEXT_PUBLIC_PLAN_LIMITED_PRICE
NEXT_PUBLIC_PLAN_PERMANENT_PRICE
NEXT_PUBLIC_PLAN_LIMITED_DURATION_DAYS
NEXT_PUBLIC_YOUTUBE_SEARCH_ENABLED
NEXT_PUBLIC_PAYMENT_MODE
NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY
NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_ANALYTICS_ENABLED
NEXT_PUBLIC_ANALYTICS_CUSTOM_EVENTS_ENABLED
"

for name in $BUILD_VARS; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    unset "$name"
  else
    echo "[build] $name definido"
  fi
done

# Qualquer outra NEXT_PUBLIC_* presente seria embutida no bundle sem revisão.
for name in $(env | sed -n 's/^\(NEXT_PUBLIC_[A-Z0-9_]*\)=.*/\1/p'); do
  case " $(echo $BUILD_VARS) " in
    *" $name "*) ;;
    *) echo "[build] ERRO: $name não está na lista revisada de variáveis de build." >&2; exit 1 ;;
  esac
done

# O build nunca aplica migration nem conhece o banco: o prebuild só migra com
# VERCEL_ENV=production, e as URLs de banco são removidas por garantia.
unset VERCEL_ENV DATABASE_URL DIRECT_URL

export NEXT_OUTPUT_STANDALONE=true
exec pnpm build
