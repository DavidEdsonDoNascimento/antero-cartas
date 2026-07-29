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
| `ALLOW_MOCK_PAYMENT_CONFIRMATION` | — | — | `false` |
| `NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION` | — | — | **ausente** (equivale a `false` — ver incidente de 2026-07-24 abaixo) |
| `DEV_EMAILS_ENABLED` | — | — | `false` |
| `NEXT_PUBLIC_SITE_URL` | — | URL de preview gerada pela Vercel | `https://antero-cartas.vercel.app` (temporária — trocar para `https://cartas.anterosistemas.com.br` quando o domínio for configurado, etapa 4 da continuação) |

**Decisão (task 7.6):** em vez de um banco de staging separado (que não
existe), o ambiente **Preview simplesmente não recebe nenhuma credencial de
produção**. Sem `DATABASE_URL`, qualquer rota que tente falar com o Prisma
falha com um erro de conexão claro — não há como escrever em produção por
engano a partir de um Preview. Isso cobre as páginas que não dependem de
banco (`/`, `/termos`, `/privacidade`) normalmente; páginas/rotas que
dependem do backend (`/criar`, `/api/*`, `/c/[slug]`) **não funcionam em
Preview** nesta fase — limitação aceita conscientemente, documentada aqui.

**Configurado na Etapa 4** (2026-07-24): projeto `antero-cartas` criado e
vinculado ao repositório na Vercel, 18 variáveis de Production configuradas
via CLI, Preview/Development confirmados vazios (`vercel env ls`).

### Incidente (2026-07-24): checkout travava em "Confirmando seu pagamento…"

No smoke test manual do primeiro deploy, o botão "Simular pagamento aprovado"
aparecia no checkout de produção mesmo com `ALLOW_MOCK_PAYMENT_CONFIRMATION=false`
— o servidor sempre bloqueou a confirmação (403 `mock_disabled`), mas o
front-end não sabia disso e ficava preso indefinidamente em "Confirmando seu
pagamento…" depois do clique. Causa e correção completas em
`docs/0005_ChangeLog.md` (entrada "[Fase 2.5] — Checkout travava..."). Resumo:
adicionada `NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION` (fail-closed, espelho
de `ALLOW_MOCK_PAYMENT_CONFIRMATION`) para o front decidir se mostra o painel
de simulação, e um estado terminal (`pending_timeout`) na tela de confirmação
para nunca mais ficar presa em loading. **Não definir esta variável em
Production** — a ausência é o comportamento correto (oculta o botão).

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

**Build Command da Vercel: o padrão da plataforma (`next build`), sem
customização.** `prisma generate` roda sozinho via `postinstall` do
`package.json` — dispara a cada `npm install` (inclusive o da Vercel antes do
build), sem precisar aparecer no Build Command. `prisma generate` é seguro e
barato de rodar sempre: só lê `schema.prisma`, nunca toca o banco (por isso é
o único comando do Prisma CLI isento do guard `APP_ENV`, ver D49).

## 7. Testes de upload — tamanhos de arquivo

Testado localmente (servidor Next local + Supabase Storage local),
2026-07-24, via requisições diretas à API `POST /api/carts/[id]/media`
(sem passar pela compressão do navegador — testa o **guard de tamanho do
servidor**, camada de defesa que existe independentemente da compressão do
cliente). Arquivos gerados sinteticamente (JPEG válido nos magic bytes,
inflado com marcadores COM) para atingir tamanhos exatos sem depender de
fotos reais.

| Tamanho enviado | Resultado | Status HTTP | Tempo |
|---|---|---|---|
| 5 MB | aceito, salvo no Storage local | 201 | ~1,1 s |
| 9,99 MB (limite − 200 B) | aceito | 201 | ~0,24 s |
| 10 MB (limite + 4 B) | rejeitado, mensagem clara | 400 | ~0,07 s |
| 10 MB + 1 B | rejeitado, mensagem clara | 400 | ~0,06 s |
| 15 MB | rejeitado, mensagem clara | 400 | ~0,11 s |

**Conclusão:** o guard de tamanho (`MAX_UPLOAD_BYTES`, `src/lib/limits.ts`,
10 MB) funciona corretamente no limite exato, rejeita rápido e sem erro
genérico. Como o cliente comprime antes de enviar (~150–400 KB por foto,
D41), o caminho normal nunca chega perto desse limite — este teste cobre o
caso de borda (compressão falhar/ser pulada), não o caminho feliz.

**Não testado nesta etapa** (precisa de navegador real ou dispositivo físico
— ver checklist manual no arquivo de handoff): tempo de compressão no
cliente, tempo de preview otimista, comportamento em rede móvel, e o **limite
de payload da função serverless da Vercel** (~4,5 MB por requisição) — só se
confirma depois do deploy real com um upload de fato passando pela Vercel.

---

## 8. Domínio e DNS — `cartas.anterosistemas.com.br`

### Situação atual (2026-07-29) — CONCLUÍDO

**O domínio está no ar e é a URL pública definitiva.** O registro CNAME foi
criado na Cloudflare, o certificado foi emitido pela Let's Encrypt e
`NEXT_PUBLIC_SITE_URL` em Production aponta para
`https://cartas.anterosistemas.com.br`.

O histórico abaixo fica registrado porque o mesmo procedimento vale para
qualquer domínio futuro.

O subdomínio foi **adicionado ao projeto `antero-cartas`** na Vercel, e a
propriedade do domínio já estava verificada (`anterosistemas.com.br` está na
mesma conta Vercel desde 2026-04-29).

Ponto de atenção descoberto nesta fase: o DNS de `anterosistemas.com.br`
**não** está na Vercel — os nameservers apontam para a **Cloudflare**
(`mustafa.ns.cloudflare.com`, `sarah.ns.cloudflare.com`). Os registros que
`vercel dns ls` mostra para esse domínio não são autoritativos e não têm
efeito nenhum. O apex e o `www` pertencem a outro projeto (`dnsistemas`) —
criar `cartas.` não conflita com eles.

### Registro a criar (na Cloudflare)

| Campo | Valor |
|---|---|
| Tipo | `CNAME` |
| Nome / Host | `cartas` |
| Destino / Target | `0d681018f5545bb0.vercel-dns-017.com` |
| TTL | Auto |
| Proxy (nuvem laranja) | **DESLIGADO** — "DNS only" (nuvem cinza) |

O proxy precisa ficar desligado: a própria Vercel devolve `disableProxy: true`
para este registro. Com o proxy da Cloudflare ligado, a emissão do certificado
pela Vercel falha.

Alternativa aceita pela Vercel, caso o CNAME não seja possível:
`A cartas -> 216.198.79.1` (secundário `64.29.17.1`).

### Depois que o DNS estiver criado

1. Confirmar propagação e emissão do certificado:

       npx vercel domains inspect cartas.anterosistemas.com.br
       npx vercel domains verify cartas.anterosistemas.com.br

2. Conferir o HTTPS de fato:

       curl -sI https://cartas.anterosistemas.com.br | head -1

3. Trocar a URL pública (Production apenas):

       npx vercel env rm NEXT_PUBLIC_SITE_URL production
       printf 'https://cartas.anterosistemas.com.br' | npx vercel env add NEXT_PUBLIC_SITE_URL production

4. Novo deploy — a URL é lida em build time:

       npx vercel --prod

5. Revalidar canonical, `og:image`, `sitemap.xml` (as três URLs devem usar o
   domínio novo), compartilhamento por WhatsApp e QR Code.

**QR Codes gerados antes desta troca não são definitivos** — apontam para
`antero-cartas.vercel.app` e precisam ser regerados. Nenhuma carta paga foi
publicada até aqui (pagamento é Fase 3), então na prática não há QR Code
antigo em circulação.

### Como conferir o QR Code sem publicar nada

`scripts/checkQrDomain.ts` roda o mesmo caminho de código da publicação
(`buildPublicCartUrl` + `generateQrDataUrl`) e imprime a URL gerada, sem tocar
no banco:

    NEXT_PUBLIC_SITE_URL=https://cartas.anterosistemas.com.br APP_ENV=production \
      npx tsx scripts/checkQrDomain.ts seed-demonstracao

Validado em 2026-07-29 decodificando o PNG gerado: o QR Code contém
exatamente `https://cartas.anterosistemas.com.br/c/seed-demonstracao` — sem
`.vercel.app`, sem `localhost`, sem token e sem barra duplicada.

### Observação sobre o domínio `.vercel.app`

`antero-cartas.vercel.app` continua respondendo: é o alias padrão da
plataforma e aponta para o mesmo deployment. Isso não é problema — o que
importa é que **nenhuma URL gerada pela aplicação** o utiliza. Confirmado:
canonical, `og:url`, `og:image`, `twitter:image`, `sitemap.xml`, `robots.txt`,
o link de compartilhamento por WhatsApp e o QR Code usam todos o domínio
definitivo.

---

## 9. Sentry

**Configurado em Production desde 2026-07-29.** `NEXT_PUBLIC_SENTRY_DSN` foi
adicionada manualmente na Vercel (só em Production; Preview e Development
seguem com zero variáveis) e o redeploy que a embutiu no build já foi feito.

Sem DSN, `init` não é chamado, nenhuma requisição sai e a aplicação funciona
normalmente — continua valendo para desenvolvimento local (`.env.local` não
define nenhuma variável de Sentry, de propósito).

O DSN é público por natureza (vai no bundle do cliente) e só permite
**escrever** eventos — por isso o prefixo `NEXT_PUBLIC_` está correto e não
expõe segredo. `SENTRY_DSN` (sem prefixo) existe para o servidor usar um
projeto separado, se um dia fizer sentido; vazia, usa a mesma do cliente.

A CSP inclui o host do DSN em `connect-src` automaticamente (derivado da
variável no build) — confirmado em produção:
`https://o4511820149358592.ingest.us.sentry.io`.

**O que é sanitizado antes de sair** (`src/lib/sentryPrivacy.ts`): corpo da
requisição inteiro, cookies, query string, cabeçalhos fora da lista de
permitidos (`authorization` e `x-cart-edit-token` são removidos), URLs com
identificador privado (`/c/<slug>` vira `/c/[slug]`), e e-mail, CPF, telefone,
bearer e token longo em qualquer texto livre. Session Replay é desligado —
gravaria o texto da carta sendo digitado.

### Validação controlada (2026-07-29)

`scripts/sentryValidationEvent.ts` envia um único evento identificado
("Fase 2.5 — validação controlada do Sentry — production") usando a mesma
configuração de `src/lib/sentryOptions.ts`. Não é rota pública nem botão de
teste: script local, rodado manualmente, uma vez.

**Confirmado:** DSN, envio e sanitização funcionam ponta a ponta — o primeiro
evento chegou com `commit` e `origin=phase-2.5-validation` corretos, sem
nenhum dado pessoal ou segredo. Esse primeiro evento saiu com
`environment=local` por um bug do script (tag customizada duplicando o campo
nativo, que na verdade vem de `SENTRY_ENVIRONMENT` /
`APP_ENV`) — corrigido: o script agora reusa a mesma resolução de ambiente da
aplicação e **aborta** se `APP_ENV` não resolver para `production`.

**Pendente de confirmação:** os valores exatos do segundo evento (depois da
correção) — `environment=production`, `commit`, `origin` e `flushed` — ainda
não foram confirmados por você com dados reais (checklist recebido com campos
em branco). Não considerar esse item validado até confirmação explícita.

**Não comprovado, e não será forçado:** captura de um erro real originado no
runtime serverless da Vercel. O script roda localmente, então `server_name`
sempre mostra a máquina onde rodou, nunca a Vercel — isso é esperado, não é
falha. Só um erro real em produção comprovaria a captura pelo runtime; não
criar rota pública nem forçar erro em produção só para obter essa prova.

**Importante — nunca use `vercel env pull` para obter o DSN.** A Vercel CLI só
sabe entregar o valor escrevendo em arquivo; não existe modo somente-memória.
Para qualquer nova validação, copie o valor diretamente do painel da Vercel
(Project -> Settings -> Environment Variables -> Production -> revelar) e
cole apenas no comando local — nunca em `.env*`, log ou documentação.

---

## 10. Analytics

Vercel Web Analytics — gratuito no Hobby (50 mil eventos/mês), sem cookie,
sem credencial. O script é servido pela própria origem.

**Ativado em 2026-07-29** no painel (projeto -> Analytics -> Enable) e
validado ao vivo: os beacons de pageview chegam e a máscara de URL privada
funciona — ver abaixo.

Passo manual (uma vez, gratuito, caso precise repetir em outro projeto):
painel da Vercel -> projeto `antero-cartas` -> **Analytics** -> **Enable**.
Sem esse toggle, o `<Analytics />` já está no `layout.tsx` mas a plataforma
não coleta.

### Validação da máscara de URL (2026-07-29)

Navegando por `/`, `/criar` e `/c/seed-demonstracao` em produção, os três
beacons enviados foram:

    {"o":"https://cartas.anterosistemas.com.br/",           ...}
    {"o":"https://cartas.anterosistemas.com.br/criar",      ...}
    {"o":"https://cartas.anterosistemas.com.br/c/[slug]",   ...}

O slug real (`seed-demonstracao`) **não aparece em nenhum beacon** — é
substituído por `[slug]` antes do envio, exatamente como projetado em D55.

**Atenção ao testar:** o script do Web Analytics ignora navegador
automatizado (`navigator.webdriver` ou `Headless` no user agent) e não envia
beacon nenhum. Para reproduzir esta verificação é preciso mascarar as duas
coisas — do contrário parece, enganosamente, que o analytics não funciona.

**Limitação do plano gratuito:** eventos personalizados exigem plano Pro. No
Hobby só o **pageview** é coletado. Os cerca de 25 `track()` do produto
continuam funcionando (e logando em dev), mas só são encaminhados se
`NEXT_PUBLIC_ANALYTICS_CUSTOM_EVENTS_ENABLED=true` — desligado por padrão.

Para desligar o analytics por completo: `NEXT_PUBLIC_ANALYTICS_ENABLED=false`.

**Privacidade:** `beforeSend` mascara `/c/<slug>`, `/pedido/<id>` e
`/checkout/<id>` e descarta query string e fragmento — sem isso o link privado
da carta sairia do navegador, porque o Web Analytics registra a URL completa
de cada pageview.

---

## 11. SEO e compartilhamento

| Recurso | Onde | Observação |
|---|---|---|
| `sitemap.xml` | `src/app/sitemap.ts` | só `/`, `/criar`, `/demonstracao` |
| `robots.txt` | `src/app/robots.ts` | bloqueia `/c/`, `/pedido/`, `/checkout/` |
| Imagem OG | `src/app/opengraph-image.tsx` | 1200x630 PNG, gerada em build |
| Card do X | `src/app/twitter-image.tsx` | reexporta a mesma arte |
| Canonical | `src/app/layout.tsx` | relativo, acompanha `NEXT_PUBLIC_SITE_URL` |

Nada aqui precisa ser regenerado manualmente: tudo é derivado de
`NEXT_PUBLIC_SITE_URL` e de `src/config/site.ts` no build.

---

## 12. Headers de segurança

Definidos em `src/config/securityHeaders.ts` e aplicados a todas as rotas por
`next.config.ts`. Ver D57 para o raciocínio, em especial o `'unsafe-inline'`.

Conferir em produção:

    curl -sI https://cartas.anterosistemas.com.br/ | grep -i -E "content-security-policy|x-content-type|x-frame|referrer|permissions|strict-transport"

**Se um recurso parar de carregar depois de mudar a CSP**, o navegador diz
exatamente qual diretiva bloqueou (console: "violates the following Content
Security Policy directive"). Os domínios legítimos estão tabelados no
cabeçalho de `src/config/securityHeaders.ts`; qualquer adição precisa de
motivo registrado.

Atenção ao adicionar fornecedor novo: script externo, fonte externa ou pixel
de marketing exigirão nova diretiva — e nenhum deles foi previsto nesta fase.

---

## 13. Checklist manual — dispositivos físicos

Não executável por mim: depende de aparelho e rede reais. Preencher com o
resultado observado, não com o esperado.

> Fazer **depois** que o domínio definitivo estiver no ar; antes disso, os
> links e QR Codes ainda apontam para `antero-cartas.vercel.app`.

### Entrada no fluxo

| Item | Android | iPhone |
|---|---|---|
| Tempo até `/criar` mostrar interface | | |
| Skeleton aparece (sem tela branca) | | |
| Nova carta **não** traz dados da carta anterior | | |
| Retomar rascunho é uma escolha explícita | | |

### Fotos

| Item | 1 foto | 3 fotos | 6 fotos |
|---|---|---|---|
| Preview aparece imediatamente | | | |
| Tempo até o upload concluir (Wi-Fi) | | | |
| Tempo até o upload concluir (rede móvel) | | | |
| Erro exibido com clareza quando falha | | | |
| Checkout bloqueia enquanto há upload pendente | | | |

Anotar também, para pelo menos uma foto real de cada aparelho: tamanho
original, resolução original, tamanho depois da compressão e resolução final.

### Checkout e pagamento

| Item | Resultado |
|---|---|
| Painel de simulação **não** aparece em produção | |
| Mensagem de pagamento indisponível aparece | |
| Botão "Voltar" retorna ao formulário | |
| Dados da carta são preservados ao voltar | |
| Tela de sucesso sai do loading (estado terminal) | |
| Tempo aproximado até o estado terminal | |

### Carta pública e compartilhamento

| Item | Resultado |
|---|---|
| QR Code lido pela câmera abre a carta | |
| Link abre no WhatsApp | |
| Preview do WhatsApp mostra a imagem Open Graph | |
| Cadeado de HTTPS válido no navegador | |
| Música do YouTube toca na carta aberta | |
| Fotos aparecem na carta aberta | |

### Rede

| Item | Wi-Fi | Rede móvel |
|---|---|---|
| Landing abre em tempo aceitável | | |
| Upload de foto conclui | | |
| Carta pública abre | | |
