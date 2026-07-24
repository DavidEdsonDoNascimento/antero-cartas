# 0006 — Runbook de Produção · Antero Cartas

> Em construção durante a Fase 2.5 (task 011). Seções marcadas **(pendente)**
> serão completadas nas Etapas 4–6, depois do deploy real na Vercel.

---

## 1. Ambientes

| Ambiente | Onde roda | Banco | Storage | Como sobe |
|---|---|---|---|---|
| **Local (dev)** | sua máquina | Supabase local (Docker, `npx supabase start`) | Supabase Storage local | `npm run dev` |
| **Produção** | Vercel | Projeto remoto `antero-cartas` (Supabase hospedado) | Bucket `cart-media` do mesmo projeto | deploy da Vercel a partir do branch de produção |
| **Preview** | Vercel (PRs/branches) | **nenhum** — sem credenciais de banco/storage de produção | — | deploy automático da Vercel |

Não existe ambiente de **staging** remoto nesta fase — decisão consciente
(seção 2.1 da task 011): o plano gratuito do Supabase comporta só dois
projetos ativos (`antero-atendimentos` e `antero-cartas`), sem espaço para um
terceiro. O Preview da Vercel cobre parte do papel de staging (valida build e
páginas estáticas), mas **nunca escreve em produção** — ver seção 3 abaixo.

## 2. Ambiente local — runbook

### Pré-requisitos
- Docker Desktop instalado e **em execução** (`docker info` deve responder).
- Node/npm já usados pelo projeto.

### Comandos
```bash
npm install                 # se necessário
npx supabase start          # sobe Postgres + Storage + Studio locais (Docker)
npx supabase status         # confere URLs/portas
npm run db:migrate          # aplica as migrations do Prisma no banco local
npm run storage:setup       # cria o bucket cart-media local (idempotente)
npm run db:seed             # dados fictícios (opcional)
npm run dev                 # http://localhost:3000
```

Para recriar o banco local do zero:
```bash
npm run supabase:reset      # supabase db reset — apaga e recria o Postgres local
npm run db:migrate          # reaplica as migrations do Prisma
npm run storage:setup       # recria o bucket (reset também limpa o storage)
npm run db:seed             # opcional
```

Para parar tudo:
```bash
npm run supabase:stop
```

### Portas locais (padrão do Supabase CLI, ver `supabase/config.toml`)
- API/Storage: `http://127.0.0.1:54321`
- Postgres: `127.0.0.1:54322`
- Studio (inspecionar dados visualmente): `http://127.0.0.1:54323`
- Inbucket/e-mail de teste: `http://127.0.0.1:54324` (não usado — o projeto usa e-mail mock próprio, não Supabase Auth e-mails)

Serviços **desativados** de propósito no `config.toml` (o produto não usa):
Auth, Realtime, Edge Functions, pooler local, analytics interno do Supabase.

### Testes
```bash
npm test                       # unitários, sem banco
RUN_DB_TESTS=true npm test      # inclui os 7 testes de integração (usa o Postgres local)
```

### Problemas comuns
- **`supabase start` falha com erro de pipe do Docker**: Docker Desktop não
  está rodando. Abra o Docker Desktop e espere o ícone ficar "Running" antes
  de tentar de novo.
- **Porta em uso**: pare qualquer outro Postgres/serviço local nas portas
  54321–54329, ou rode `npm run supabase:stop` antes de `start` de novo.
- **Bucket "não existe" depois de um `db reset`**: esperado — o reset apaga
  os metadados do storage também. Rode `npm run storage:setup` de novo.

## 3. Separação de ambientes na Vercel

| Variável de ambiente da Vercel | Development | Preview | Production |
|---|---|---|---|
| `APP_ENV` | (não se aplica — só existe local) | **ausente** | `production` |
| `DATABASE_URL` / `DIRECT_URL` | — | **ausente** (proposital) | conexão do projeto remoto `antero-cartas` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | — | **ausente** | do projeto remoto |
| `STORAGE_PROVIDER` | — | — | `supabase` |
| `ALLOW_MOCK_PAYMENT_CONFIRMATION` | — | — | `false` **(pendente — ver seção 9.5 da task)** |
| `DEV_EMAILS_ENABLED` | — | — | `false` |
| `NEXT_PUBLIC_SITE_URL` | — | URL de preview gerada pela Vercel | `https://cartas.anterosistemas.com.br` |

**Decisão (task 7.6):** em vez de um banco de staging separado (que não
existe), o ambiente **Preview simplesmente não recebe nenhuma credencial de
produção**. Sem `DATABASE_URL`, qualquer rota que tente falar com o Prisma
falha com um erro de conexão claro — não há como escrever em produção por
engano a partir de um Preview. Isso cobre as páginas que não dependem de
banco (`/`, `/termos`, `/privacidade`) normalmente; páginas/rotas que
dependem do backend (`/criar`, `/api/*`, `/c/[slug]`) **não funcionam em
Preview** nesta fase — limitação aceita conscientemente, documentada aqui.

**(pendente)** — configuração real das variáveis fica para a Etapa 4, quando
o projeto for criado na Vercel (requer acesso à sua conta).

## 4. Backup

### O que existe hoje
- **Schema**: versionado em `prisma/migrations/` (git) — sempre reproduzível.
- **Dados**: só no Postgres gerenciado do Supabase (projeto `antero-cartas`).
  O plano gratuito do Supabase **não inclui backup automático diário** (esse
  recurso é do plano Pro). Ou seja: hoje, **não existe backup dos dados de
  produção além do próprio banco em si** — se o projeto for apagado ou
  corrompido, os dados de pedidos/cartas reais seriam perdidos.
- **Arquivos do bucket**: mesma situação — sem backup automático no plano
  gratuito.
- **Configuração do bucket**: versionada em `scripts/setupStorageBucket.ts`
  (reproduzível — recriar o bucket com a config correta não depende de memória).

### O que é possível fazer manualmente (plano gratuito, sem custo)
- **Dump lógico do banco** via `pg_dump` contra a `DIRECT_URL` (conexão
  direta, sem pooler) — comando de referência (não executado nesta auditoria,
  é responsabilidade operacional, não parte do código):
  ```bash
  pg_dump "$DIRECT_URL" --no-owner --no-acl -f backup-antero-cartas-$(date +%Y%m%d).sql
  ```
  Requer `pg_dump` instalado localmente (client do Postgres) e deve ser
  guardado fora do repositório (nunca versionado — contém dados reais de
  clientes a partir do momento em que houver vendas de verdade).
- **Frequência recomendada**: antes de qualquer migration em produção, e
  periodicamente depois que houver vendas reais (ex.: diário, via cron
  externo) — decisão de operação, não implementada nesta fase (sem
  contratar serviço pago, conforme restrição da task).

### Limitação registrada
Não existe hoje backup automático nem testado/verificado. **Não afirmamos que
backup "existe" além do procedimento manual acima** — é uma dívida técnica
conhecida, aceitável nesta fase por não haver ainda vendas reais (só dados de
teste no banco), mas deve ser revisitada antes de crescer o volume de dados
reais (ver `docs/tasks/010_diagnostico_e_roadmap.md`, seção de escalabilidade).

## 5. Limpeza de dados de teste no banco remoto

### Auditoria (2026-07-24, somente leitura — nada removido)

O banco remoto (`antero-cartas`) tem hoje **17 cartas, 8 pedidos, 5 e-mails**.
Como a Fase 3 (pagamento real) ainda não existe, **100% desses pedidos têm
`provider: "mock"`** — ou seja, nenhum é venda real por definição. Nenhum
CPF/telefone real encontrado; e-mails são `@seed.local` (dados fictícios do
seed) ou um Gmail pessoal usado nos testes manuais das tasks 007/008.

**Achado adicional:** 12 das 18 fotos no banco remoto têm URL relativa
(`/api/media/carts/...`), formato do storage em **disco local** — persistida
antes da troca para Supabase Storage (D39). Essas fotos **não abrem em
produção** (disco efêmero/inexistente no ambiente atual): são imagens
quebradas em cartas de teste antigas. Reforça que essas cartas devem ser
removidas antes do lançamento, não só por privacidade mas por estarem com
dado quebrado.

### Candidatos a remoção (revise antes de autorizar)

| Cart ID | slug | criado em | observação |
|---|---|---|---|
| `cmrwk3u4h00008cunmkdvy0qr` | seed-demonstracao | 2026-07-22 | seed — recriado a cada `db:seed` |
| `cmrwk3uab00018cun46g2dmcj` | (rascunho) | 2026-07-22 | seed |
| `cmrwk3ug600028cunlq46gvy8` | seed-expirada | 2026-07-22 | seed — recriado a cada `db:seed` |
| `cmrwk561w000010un3dzcrxf4` | (rascunho) | 2026-07-22 | teste manual |
| `cmrwk7b5y000110unxe2ylpqu` | una4kti2qr8tcugfb34zsyvjxp | 2026-07-22 | teste manual — foto com URL quebrada |
| `cmrwkmuyg0000u4unhdztvfhx` | (rascunho) | 2026-07-22 | teste manual — fotos com URL quebrada |
| `cmrwkmuyr0001u4unqrdrbmx5` | 5uwr725gqw6auef752maz36ngg | 2026-07-22 | teste manual — fotos com URL quebrada |
| `cmrwl9t1h0000cgun86x5g8bq` | (rascunho) | 2026-07-22 | teste manual |
| `cmrwl9tdu0001cgun15gxhgnc` | dv75nb24uf3q7j8wwk64i2iter | 2026-07-22 | teste manual — fotos com URL quebrada |
| `cmrxing0j0000ekunsfsvt8a0` | (rascunho) | 2026-07-23 | teste manual (task 008) |
| `cmrxing0z0001ekungawo26wm` | 8xtim7pme6qek2sx78izujim9q | 2026-07-23 | teste manual (task 008) |
| `cmrxm0fz2000ugounlxz409s1` | (rascunho) | 2026-07-23 | teste manual |
| `cmrxm0ii7000vgoun4ts8w6tj` | (rascunho) | 2026-07-23 | teste manual |
| `cmrxm0twk000wgounktroy9sm` | 33ivbcdt3s5sv5v3qmr5yrqmfk | 2026-07-23 | teste manual (task 008) |
| `cmrxm5tmn0012gounphzphvku` | (rascunho) | 2026-07-23 | teste manual |
| `cmrxm5u660013gounkt7qylh3` | (rascunho) | 2026-07-23 | teste manual |
| `cmryxoiok0000wwun3yap29fr` | (rascunho) | 2026-07-24 | teste manual |

As duas primeiras (`seed-demonstracao`, `seed-expirada`) merecem uma decisão
à parte: são o dataset de demonstração da Fase 2 — se o produto quiser manter
um link de exemplo público em produção, elas **não** deveriam ser removidas,
e sim recriadas deliberadamente lá (ou nunca ter sido semeadas em produção,
ficando só em ambientes locais daqui para frente). Fica com você decidir.

### Como executar (só com sua autorização)

Script já preparado e testado (dry run) em `scripts/cleanupTestData.ts` — por
padrão só **lista** o que seria removido; exige `--confirm` para apagar de
verdade, e só aceita uma lista explícita de IDs (nunca um filtro genérico por
data/e-mail/provider, exatamente para não arriscar dado real no futuro).

```bash
# 1. Revisar (dry run, sem alterar nada):
npx tsx scripts/cleanupTestData.ts --env-file .env.production.reference \
  --cart-ids cmrwk3u4h00008cunmkdvy0qr,cmrwk3uab00018cun46g2dmcj,cmrwk3ug600028cunlq46gvy8,cmrwk561w000010un3dzcrxf4,cmrwk7b5y000110unxe2ylpqu,cmrwkmuyg0000u4unhdztvfhx,cmrwkmuyr0001u4unqrdrbmx5,cmrwl9t1h0000cgun86x5g8bq,cmrwl9tdu0001cgun15gxhgnc,cmrxing0j0000ekunsfsvt8a0,cmrxing0z0001ekungawo26wm,cmrxm0fz2000ugounlxz409s1,cmrxm0ii7000vgoun4ts8w6tj,cmrxm0twk000wgounktroy9sm,cmrxm5tmn0012gounphzphvku,cmrxm5u660013gounkt7qylh3,cmryxoiok0000wwun3yap29fr

# 2. Só depois de revisar e autorizar, repetir com --confirm.
```

**Nada foi executado.** Aguardando sua decisão sobre quais IDs remover (e se
os dois seeds ficam ou saem do remoto).

## 6. Estratégia de migration em produção

**Decisão: migrations NÃO rodam dentro do Build Command da Vercel.** Elas são
um passo manual e deliberado, feito pelo desenvolvedor antes de cada deploy
que muda o schema — não automático a cada push.

### Por que não simplesmente colocar no Build Command
`prisma migrate deploy` é idempotente (só aplica migrations pendentes) e por
si só seria seguro rodar a cada build. O problema não é a idempotência — é
tudo em volta dela:
- **Deployments de Preview** nunca têm `DATABASE_URL` de produção (seção 3) —
  então nem poderiam rodar migration mesmo se estivesse no build command
  compartilhado; mas isso também significa que colocar o comando ali só
  funcionaria de fato no ambiente Production, exigindo dois Build Commands
  diferentes por ambiente (complexidade extra sem necessidade real).
- **Builds concorrentes**: dois deploys de produção próximos rodariam
  `migrate deploy` em paralelo. O Prisma usa um lock a nível de banco para
  isso (relativamente seguro), mas é uma variável a menos para gerenciar se a
  migration simplesmente não roda de forma automática.
- **Falha no meio da migration**: se `migrate deploy` aplicar parte do schema
  e falhar, o **build inteiro falha** e a Vercel mantém a versão anterior no
  ar — mas o banco já ficou com o schema novo (parcial ou não) enquanto o
  código antigo continua rodando contra ele. Sem controle manual, não há
  window para conferir isso antes do próximo deploy.
- **Rollback**: reverter um deploy da Vercel não reverte uma migration já
  aplicada. Precisa ser um passo consciente, não escondido dentro do build.

### Como funciona na prática
1. Antes de um deploy que muda `prisma/schema.prisma`, rode a migration
   manualmente contra produção, definindo as credenciais **só para aquele
   comando** (nunca em `.env.local`):
   ```bash
   # bash — variáveis só para este comando (não persistem no shell)
   DATABASE_URL="<DATABASE_URL de .env.production.reference>" \
   DIRECT_URL="<DIRECT_URL de .env.production.reference>" \
   APP_ENV=production ALLOW_PRISMA_CLI_PRODUCTION=true \
   npm run db:migrate:deploy
   ```
   ```powershell
   # PowerShell — equivalente
   $env:DATABASE_URL = "<DATABASE_URL de .env.production.reference>"
   $env:DIRECT_URL = "<DIRECT_URL de .env.production.reference>"
   $env:APP_ENV = "production"
   $env:ALLOW_PRISMA_CLI_PRODUCTION = "true"
   npm run db:migrate:deploy
   ```
   As duas variáveis de confirmação (`APP_ENV`/`ALLOW_PRISMA_CLI_PRODUCTION`)
   são exigidas por `prisma.config.ts` (D49) — sem elas o comando recusa
   rodar. `dotenv` não sobrescreve variáveis já definidas no shell, então
   isso funciona mesmo com `.env.local` apontando para o Supabase local.
2. Só depois de a migration ser aplicada com sucesso, faça o deploy do
   código (push no branch de produção / promover o deploy na Vercel).
3. Para uma migration considerada arriscada (remover coluna, mudar tipo),
   faça um `pg_dump` antes (seção 4) — nunca em migrations puramente aditivas.

**Build Command da Vercel (produção): `prisma generate && next build`** — só
gera o client, nunca migra. `prisma generate` é seguro e barato de rodar em
todo build (não toca no banco).
