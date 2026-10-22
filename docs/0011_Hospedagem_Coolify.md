# 0011 — Hospedagem em contêiner (Docker / Coolify) · Antero Cartas

> Fase 2 da migração da Vercel + Supabase para a VPS Hostinger com Coolify.
> **Estado:** código preparado e validado localmente, numa branch própria.
> **Nada disto está em produção.** A produção continua na Vercel + Supabase,
> com o comportamento de sempre, até o cutover (Fase 5).
>
> Contexto e plano completo: `claude-reports/2026-10-20_investigacao-migracao-vps-hostinger.md`
> (fora do Git) e as decisões D67–D72 em `docs/0004_Decisions.md`.

---

## 1. Arquitetura

```
Internet ──HTTPS──► Traefik (proxy do Coolify, Let's Encrypt)
                         │  rede Docker do projeto "antero-cartas"
                         ▼
              ┌────────────────────────────┐        ┌──────────────────────────┐
              │ app: imagem antero-cartas  │──5432─►│ PostgreSQL 17 dedicado   │
              │ node server.js (usuário    │ rede   │ sem porta pública        │
              │ node, não root) :3000      │interna │ volume: dados do banco   │
              │ volume: /data/uploads      │        └──────────────────────────┘
              └────────────────────────────┘
                   │ saída: Mercado Pago, Resend, YouTube, Sentry
```

- **Fotos:** `STORAGE_PROVIDER=local` grava em `/data/uploads` (volume
  persistente) e serve por `/api/media/<chave>`.
- **URL das fotos:** `MEDIA_URL_STRATEGY=storage_key` deriva a URL de
  `CartMedia.storageKey`. As fotos copiadas do bucket do Supabase abrem sem
  nenhum UPDATE na coluna `url`.
- **Migrations:** `prisma migrate deploy` roda no início do contêiner, antes do
  servidor (`MIGRATE_ON_START=true`). Se falhar, o contêiner sai com erro e o
  servidor não sobe.
- **Vercel:** nada muda. Sem `NEXT_OUTPUT_STANDALONE` o `next.config.ts` é o
  mesmo de antes; `scripts/vercelProductionMigrate.mjs` e o `prebuild`
  continuam iguais; os padrões novos (`MAINTENANCE_MODE`, `MEDIA_URL_STRATEGY`)
  preservam o comportamento atual quando ausentes.

### Arquivos

| Arquivo | Papel |
|---|---|
| `Dockerfile` | multi-stage: base Node 24 bookworm + pnpm 11.18 (corepack) → deps → builder (standalone) → migrate-deps → runner não root |
| `.dockerignore` | mantém fora da imagem `.env*`, `.vercel`, `.git`, `docs`, `claude-reports`, `supabase`, dados locais |
| `docker/build-app.sh` | lista fechada de variáveis de build; remove as vazias; recusa `NEXT_PUBLIC_*` não revisada; nunca migra |
| `docker/entrypoint.sh` | confere volume de fotos → aplica migrations → `exec node server.js` |
| `docker/migrate/` | Prisma CLI + pg + dotenv isolados, com lockfile próprio (versões iguais às do app, conferidas por teste) |
| `scripts/migrateDeploy.mjs` | migration controlada (espera o banco, recusa Supabase, falha fecha) |
| `scripts/test-integration-pg17.sh` | suíte completa contra PostgreSQL 17 descartável |
| `compose.local.yaml` | ambiente local descartável: app + PostgreSQL 17 + volumes |
| `.github/workflows/docker-image.yml` | build manual fora da VPS (opcional, publica no GHCR só se marcado) |
| `src/app/api/health/route.ts` | health check (banco + volume) |
| `src/server/maintenance.ts` | modo de manutenção |
| `src/server/storage/mediaUrl.ts` | estratégia de URL das fotos |

## 2. Construir a imagem

As variáveis `NEXT_PUBLIC_*` são embutidas no bundle **no build**, assim como
`APP_ENV` e `PAYMENT_MODE` (CSP, HSTS e validação do modo de pagamento ficam
fixados em `next.config.ts`). Por isso cada ambiente tem a **sua** imagem.

```bash
docker build -t antero-cartas:hml-<sha> \
  --build-arg APP_VERSION=$(git rev-parse --short HEAD) \
  --build-arg APP_ENV=production \
  --build-arg PAYMENT_MODE=real \
  --build-arg NEXT_PUBLIC_PAYMENT_MODE=real \
  --build-arg NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=<chave PÚBLICA de teste> \
  --build-arg NEXT_PUBLIC_SITE_URL=https://<domínio de homologação> \
  --build-arg NEXT_PUBLIC_ANALYTICS_ENABLED=false \
  .
```

**Nunca** passe segredos como `--build-arg`. O Dockerfile nem declara ARGs para
eles, e o `docker/build-app.sh` aborta se aparecer uma `NEXT_PUBLIC_*` fora da
lista revisada.

Pelo GitHub Actions (fora da VPS), `.github/workflows/docker-image.yml`:

- **Enquanto a branch não for mesclada:** um `push` em
  `feat/coolify-hosting-preparation` constrói a imagem de **homologação**. (Um
  workflow só com `workflow_dispatch` precisa estar na branch padrão para ser
  acionado; por isso o gatilho `push`, restrito a esta branch.)
- **Depois do merge:** Actions → **Imagem Docker** → Run workflow permite
  escolher o ambiente.
- **Publicação no GHCR é opt-in:** só ocorre se a variável `GHCR_PUBLISH` da
  Environment for `true` (e, no disparo manual, `publicar` marcado). Sem isso o
  job valida e constrói, sem publicar. Sem segredos: usa o `GITHUB_TOKEN`.
- **Pré-requisito:** criar a Environment `homologacao` com as variáveis de
  build (§3.1). O job falha cedo se faltarem `APP_ENV`/`NEXT_PUBLIC_SITE_URL`,
  se `PAYMENT_MODE` divergir de `NEXT_PUBLIC_PAYMENT_MODE`, se homologação usar
  o domínio de produção ou se produção definir o mock.
- **Tag:** `ghcr.io/<owner>/antero-cartas:<ambiente>-<sha completo>`; no
  Coolify, referencie pelo **digest** do resumo do run. Nunca há deploy.

### 2.1 Isolamento homologação × produção

Como o Next.js incorpora no **build** tudo que é público, **cada ambiente tem a
sua imagem**; não há configuração dinâmica de runtime para isso:

| Item | Onde é definido | Separação |
|---|---|---|
| `NEXT_PUBLIC_*` (domínio, chave pública do MP, preços…), `APP_ENV`, `PAYMENT_MODE` | build (Environment do GitHub) | imagem própria por ambiente, tag `<ambiente>-<sha>`; o workflow barra domínio/modo errados |
| CSP e HSTS (`next.config.ts`) | build | derivados das mesmas variáveis |
| `DATABASE_URL`, volume de fotos | runtime (Coolify) | Postgres e volume próprios por projeto/ambiente |
| Mercado Pago (token, segredo do webhook) | runtime | credenciais de teste × produção; o webhook de cada ambiente aponta para o seu domínio (`notification_url` = `NEXT_PUBLIC_SITE_URL`) |
| E-mail | runtime | `EMAIL_MODE=mock` em homologação |
| Segredos | só runtime | o build não recebe nem `DATABASE_URL`/`DIRECT_URL` (`docker/build-app.sh` as remove) |

Risco residual: nada impede tecnicamente apontar a imagem de homologação num
app de produção do Coolify. Mitigações: a tag começa com o ambiente, o
domínio embutido diverge (`/api/health` mostra `version`, mas não o domínio — o
`curl -s <url>/` revela o `canonical`), e o checklist da homologação/cutover
deve conferir a tag antes do deploy.

## 3. Variáveis

### 3.1 Build (argumentos da imagem)

| Variável | Homologação | Produção (cutover) |
|---|---|---|
| `APP_VERSION` | sha do commit | sha do commit |
| `APP_ENV` | `production` | `production` |
| `PAYMENT_MODE` / `NEXT_PUBLIC_PAYMENT_MODE` | `real` (credenciais **de teste**) ou `mock` | `real` |
| `NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION` | `true` só se `mock` | **ausente** |
| `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` | chave pública **de teste** | chave pública de produção |
| `NEXT_PUBLIC_SITE_URL` | `https://<domínio-hml>` | `https://cartas.anterosistemas.com.br` |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | `false` | `false` (o Vercel Analytics não funciona fora da Vercel — decisão pendente) |
| `NEXT_PUBLIC_SENTRY_DSN` | opcional | o mesmo da Vercel |
| `NEXT_PUBLIC_PLAN_*`, `NEXT_PUBLIC_MAX_CART_PHOTOS`, `NEXT_PUBLIC_WHATSAPP_SUPPORT`, `NEXT_PUBLIC_YOUTUBE_SEARCH_ENABLED` | iguais à produção | iguais à produção |
| `SUPABASE_URL` | não usar | não usar (só alimentava a CSP das fotos do bucket) |

### 3.2 Runtime (variáveis do contêiner no Coolify)

| Variável | Valor | Observação |
|---|---|---|
| `APP_ENV` | `production` | igual ao build |
| `DATABASE_URL` | `postgresql://<usuário>:<senha>@<host interno do Postgres>:5432/<banco>` | rede interna; sem TLS; sem pooler |
| `DIRECT_URL` | opcional (igual à `DATABASE_URL`) | |
| `PAYMENT_MODE` / `NEXT_PUBLIC_PAYMENT_MODE` | iguais ao build | validados também no boot (`instrumentation.ts`) |
| `ALLOW_MOCK_PAYMENT_CONFIRMATION` | `false` (`true` só em hml com mock) | |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | **teste** em homologação | segredos |
| `EMAIL_MODE` | `mock` em homologação | `real` + `RESEND_API_KEY`, `EMAIL_FROM` na produção |
| `DEV_EMAILS_ENABLED` | `false` | |
| `YOUTUBE_SEARCH_MODE`, `YOUTUBE_API_KEY`, demais `YOUTUBE_*` | como na produção (ou `mock`) | |
| `PLAN_LIMITED_PRICE`, `PLAN_PERMANENT_PRICE`, `PLAN_LIMITED_DURATION_DAYS` | iguais à produção | autoritativos no servidor |
| `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` | opcional | |
| `STORAGE_PROVIDER` | `local` (padrão da imagem) | |
| `STORAGE_DIR` | `/data/uploads` (padrão) | precisa ser volume montado |
| `MEDIA_URL_STRATEGY` | `storage_key` (padrão da imagem) | |
| `MIGRATE_ON_START` | `true` (padrão) | `false` se usar comando de pré-deploy |
| `MIGRATE_DB_WAIT_SECONDS` | `60` (padrão) | |
| `MAINTENANCE_MODE` | `false` | `true` só durante a janela de migração |
| `STORAGE_REQUIRE_MOUNT` | `true` (padrão) | não desligar fora de teste |

## 4. Ambiente local descartável

```bash
docker compose -f compose.local.yaml up -d --build
curl -s http://127.0.0.1:3100/api/health        # {"status":"ok",...}
# navegador: http://localhost:3100  (pagamento simulado; nada sai para fora)
MAINTENANCE_MODE=true docker compose -f compose.local.yaml up -d app   # testa a manutenção
docker compose -f compose.local.yaml down       # mantém banco e fotos
docker compose -f compose.local.yaml down -v    # apaga banco e fotos locais
```

O banco do compose não publica porta. Ele só é acessível pela rede interna, a
mesma topologia do Coolify.

## 5. Testes

```bash
pnpm lint && pnpm typecheck
pnpm test                      # unitários (sem banco)
pnpm test:integration:pg17     # unitários + integração em PostgreSQL 17 descartável
```

`test:integration:pg17` cria e destrói um contêiner próprio em `127.0.0.1`,
aplica as migrations pelo mesmo `scripts/migrateDeploy.mjs` do contêiner e roda
a suíte com o ambiente saneado: Mercado Pago, Resend, Supabase e YouTube vazios
ou em mock, mesmo que o `.env.local` tenha valores. **Nunca** rode testes de
integração apontando para um banco real.

## 6. Migrations

- **Quando:** no início de cada contêiner novo (`MIGRATE_ON_START=true`), antes
  de `server.js`. Se a migration falhar, o contêiner novo sai com erro e o
  servidor dele nunca atende nem fica saudável (comprovado localmente).
  **A9 — verificar na homologação:** que o Coolify, num deploy com migration
  falhada, mantém o contêiner anterior atendendo (rolling update com health
  check). Isso depende da configuração do Coolify e **não foi validado**; não
  conte com isso antes de testar.
- **Idempotente:** sem migrations pendentes, nada é aplicado (`No pending
  migrations to apply`). Com réplicas simultâneas, o lock do Prisma evita
  aplicar em dobro.
- **Salvaguardas** (`scripts/migrateDeploy.mjs`):
  - recusa hosts `*.supabase.co`/`*.supabase.com` sem `ALLOW_MIGRATE_ON_SUPABASE=true`;
  - espera o banco por até `MIGRATE_DB_WAIT_SECONDS`;
  - nunca imprime a URL.
- **Comando de pré-deploy (alternativa):** `MIGRATE_ON_START=false` no app e
  `node /app/.migrate/scripts/migrateDeploy.mjs` como pré-deploy no Coolify.
- **Migration arriscada** (remover coluna, mudar tipo): fazer backup antes e
  aplicar de forma manual e consciente, pelo mesmo critério de
  `docs/0006_Runbook_Producao.md` §6. O rollback de imagem **não** desfaz
  migration.
- **Diagnóstico:** `docker exec <app> sh -c 'cd /app/.migrate && node node_modules/prisma/build/index.js migrate status'`.

## 7. Fotos e volume persistente

- No Coolify: **Persistent Storage** → volume em `/data/uploads`.
  - Um volume **nomeado** herda o dono `node` (uid 1000) que a imagem define.
  - Se usar *bind mount* de um diretório do host, faça `chown 1000:1000` nele.
- O entrypoint recusa iniciar se `/data/uploads` não for um ponto de montagem.
  Isso evita gravar fotos na camada do contêiner, que some no próximo deploy.
- A escrita é atômica (arquivo temporário + `rename`).
- A leitura só aceita `carts/{id}/{uuid}.{jpg|png|webp}`, e o caminho final
  precisa ficar dentro do volume.
- A posição, o enquadramento e o zoom das fotos ficam no banco (`CartMedia`);
  o arquivo nunca é alterado.
- As 12 referências legadas de teste, sem arquivo, continuam no banco. A
  cartinha abre normalmente (200) e só a imagem ausente responde 404.

## 8. Health check, logs e recursos

- **Health check:**
  - `GET /api/health`: 200 com `{"status":"ok","checks":{"database":"ok","storage":"ok"}}`,
    ou 503 sem expor detalhes. Com manutenção ligada continua 200, com
    `"maintenance": true`.
  - `GET /api/health?probe=live`: só o processo.
  - O `HEALTHCHECK` da imagem usa `curl` em `/api/health` (intervalo 30 s,
    início tolerado de 90 s para as migrations). No Coolify, configure o
    mesmo caminho, a porta 3000 e o método GET.
- **Logs:** stdout/stderr do contêiner, com prefixos `[entrypoint]`,
  `[migrate]`, `[health]` e `[webhook][mercadopago]`. Configure a rotação no
  Docker/Coolify. Erros continuam indo para o Sentry quando há DSN.
- **Encerramento:** o servidor é o PID 1 e trata o SIGTERM terminando as
  requisições em andamento. Deixe pelo menos 30 s de *stop grace period*.
- **Recursos** (KVM 2: 2 vCPU, 7,8 GB):
  - app: 1 vCPU e 768 MB;
  - Postgres: 0,5 vCPU e 512 MB;
  - em repouso, medido localmente: app ~95 MB, Postgres ~22 MB;
  - ajuste depois de medir em homologação.
- **Imagem:** ~720 MB, dos quais ~230 MB são o Prisma CLI usado só nas
  migrations.
  - **Build fora da VPS** (GitHub Actions): o `next build` consome CPU e RAM
    e afetaria os outros sistemas.

## 9. Modo de manutenção

`MAINTENANCE_MODE=true` (variável de runtime + restart):

- **Escritas recusadas com 503 e `Retry-After: 120`:** criar ou editar
  rascunho, upload, enquadramento, reordenação ou remoção de foto, pedido,
  Pix, cartão, confirmação mock e o **webhook do Mercado Pago**. A recusa
  acontece antes de tocar no banco, no storage ou no provedor.
- **Webhook:** nunca recebe 200 falso. O Mercado Pago reenvia em 15 min,
  30 min, 6 h, 48 h e 96 h, e o processamento é idempotente.
- **Leituras continuam:** cartinha pública, fotos, status do pedido e busca
  de música.
- **Cobertura:** `src/app/api/maintenanceWiring.test.ts` falha se alguma rota
  de escrita nova ficar sem a checagem, se aparecer um GET não revisado ou se
  surgir uma Server Action.

## 10. Homologação no Coolify (passos — ainda não executados)

1. **Novo projeto** `antero-cartas`, com o ambiente `homologacao`. Não use
   redes nem bancos dos outros sistemas.
2. **Database → PostgreSQL 17:**
   - banco e usuário dedicados, senha forte gerada pelo Coolify;
   - **sem** "Make it publicly available";
   - `timezone=UTC`;
   - limite de 512 MB.
3. **Application → Docker Image:**
   - imagem `ghcr.io/<owner>/antero-cartas@sha256:<digest>`, ou build por
     Dockerfile apontando para a branch (este último consome CPU da VPS);
   - porta 3000;
   - domínio de homologação (subdomínio próprio, nunca o de produção);
   - health check `/api/health`;
   - limites de 1 vCPU e 768 MB;
   - Persistent Storage em `/data/uploads`.
4. **Variáveis de runtime** (§3.2):
   - `DATABASE_URL` com o host **interno** do Postgres;
   - Mercado Pago **de teste**;
   - `EMAIL_MODE=mock`.
5. **Deploy:** acompanhar `[migrate] migrations em dia` e o health check verde.
6. **Webhook de teste:**
   - no painel **de teste** do Mercado Pago, apontar para
     `https://<domínio-hml>/api/webhooks/mercadopago`, com o segredo de teste;
   - a `notification_url` de cada pagamento já usa `NEXT_PUBLIC_SITE_URL`.
7. **Backups a cada 6 h:**
   - Postgres: backup agendado do Coolify com cron `0 */6 * * *`, para um
     destino S3 **fora da VPS**;
   - fotos: `rclone sync` do volume com cron `15 */6 * * *`;
   - testar um restore.
8. **Dados:** só uma cópia **anonimizada** do backup da Fase 1, se for
   necessário testar dados antigos. Nunca dados pessoais reais em homologação.

## 11. Rollback

- **App:** voltar o Coolify para o digest anterior (reimplantar a imagem
  anterior). Se um deploy com contêiner não saudável preserva o anterior é
  ponto a verificar na homologação (A9, §6); não pressuponha.
- **Schema:** o rollback de imagem não desfaz migration. As migrations deste
  projeto são aditivas; para uma não aditiva, use backup e o procedimento
  manual (§6).
- **Cutover:** enquanto o DNS não for trocado, a produção não foi afetada.
  Depois da troca, o caminho de volta está em
  `claude-reports/2026-10-20_investigacao-migracao-vps-hostinger.md` §7.7:
  - voltar o DNS para a Vercel;
  - reaplicar no Supabase o que foi escrito no período;
  - Supabase e Vercel ficam preservados por 30 dias.

## 12. Migração dos dados (Fase 5 — resumo)

1. Ligar `MAINTENANCE_MODE=true` na **Vercel** (escritas e webhook → 503).
2. Fazer o dump final do schema `public` e o sync incremental das fotos do
   bucket, com o `backup_inicial.sh` da Fase 1 e uma role temporária somente
   leitura.
3. Restaurar no PostgreSQL 17 do Coolify:
   - o dump inclui `CREATE SCHEMA public`, então remova antes o schema
     `public` padrão do banco **novo e vazio**;
   - use `pg_restore --no-owner --no-privileges --single-transaction --exit-on-error`.
4. Copiar as fotos para o volume `/data/uploads`, mantendo a árvore
   `carts/{cartId}/{uuid}.ext`.
5. Validar contagens e MD5 por tabela e as fotos (tamanho e eTag).
6. Subir o app com `MEDIA_URL_STRATEGY=storage_key`; as fotos antigas abrem
   por `/api/media/...`.
7. Trocar o DNS na Cloudflare e conferir o HTTPS.
8. Conferir os webhooks reenviados e os pedidos `PENDING` no painel do
   Mercado Pago.
