#!/bin/sh
# Entrypoint da imagem do Antero Cartas (docs/0011).
#
# Ordem garantida:
#   1. confere o diretório de fotos (volume persistente) quando o storage é local;
#   2. aplica migrations (MIGRATE_ON_START=true, padrão) — se falhar, o
#      contêiner termina com erro e o servidor NÃO sobe;
#   3. `exec` no servidor Next: ele vira o PID 1 e recebe o SIGTERM do
#      `docker stop`/Coolify para encerrar de forma limpa.
set -eu

log() { echo "[entrypoint] $*"; }

log "Antero Cartas ${APP_VERSION:-sem-versão} · NODE_ENV=${NODE_ENV:-?} · APP_ENV=${APP_ENV:-local}"

if [ "${STORAGE_PROVIDER:-local}" = "local" ]; then
  dir="${STORAGE_DIR:-/data/uploads}"
  mkdir -p "$dir" 2>/dev/null || true
  if [ ! -d "$dir" ] || [ ! -w "$dir" ]; then
    log "ERRO: diretório de fotos '$dir' ausente ou sem permissão de escrita para o usuário $(id -u)."
    log "Monte um volume persistente em '$dir' (o volume nomeado herda o dono correto da imagem)."
    exit 1
  fi
  # Sem volume montado, as fotos iriam para a camada do contêiner e sumiriam
  # na próxima recriação (deploy). STORAGE_REQUIRE_MOUNT=false só para testes.
  if [ "${STORAGE_REQUIRE_MOUNT:-true}" = "true" ] && ! grep -qs " $dir " /proc/mounts; then
    log "ERRO: '$dir' não é um volume montado. Configure um volume persistente nesse caminho."
    exit 1
  fi
  log "fotos: storage local em '$dir'"
fi

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  node /app/.migrate/scripts/migrateDeploy.mjs
else
  log "MIGRATE_ON_START=false — este contêiner não aplica migrations."
fi

log "iniciando o servidor na porta ${PORT:-3000}"
exec node /app/server.js
