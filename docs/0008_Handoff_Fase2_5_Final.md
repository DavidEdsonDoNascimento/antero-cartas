# 0008 — Handoff final · Fase 2.5 (Preparação para Produção) · 2026-07-29

> Este é o **handoff definitivo** da Fase 2.5 (seção 14 da task
> `docs/tasks/011_fase_2_5.md`). Substitui o parcial
> `docs/0007_Handoff_Fase2_5_Parcial.md`, que fica no repositório como
> registro histórico da sessão de 2026-07-24.

## 1. Resumo

O trabalho **técnico** da Fase 2.5 está concluído. O que resta são quatro
ações que dependem de você (DNS, DSN do Sentry, autorização para apagar dados
de teste, testes em celular) — nenhuma delas bloqueada por código.

A Fase 3 **não** foi iniciada: não existe pagamento real, webhook nem e-mail
real. Nenhum serviço pago foi contratado, nenhum projeto Supabase novo foi
criado e o projeto `antero-atendimentos` não foi tocado.

## 2. Estado final

| Item | Estado |
|---|---|
| Branch | `master` (única do repositório), rastreando `origin/master` |
| Working tree | limpo |
| Git vs. remoto | sincronizados, mesmo commit |
| URL pública atual | `https://antero-cartas.vercel.app` (**temporária**) |
| Domínio definitivo | `cartas.anterosistemas.com.br` — na Vercel, aguardando DNS |
| Deploy | Production, `Ready` |
| Testes | **211/211 passando** com banco local (`RUN_DB_TESTS=true`) |
| Fase 3 | não iniciada |

### Commits desta sessão (2026-07-29)

Todos já em `origin/master`:

| Hash | Mensagem |
|---|---|
| `f2b3c18` | `feat: add sitemap, open graph image and social metadata` |
| `54c4944` | `feat: add cookieless analytics with private url redaction` |
| `e8f101c` | `feat: add optional sentry monitoring with data sanitization` |
| `06840ac` | `feat: add security headers with a csp built from real origins` |
| `77cfc9d` | `fix: hide dev email viewer route in production` |

Commit imediatamente anterior (fim da sessão de 2026-07-24): `c331dfe`.
A esta lista soma-se o commit de documentação desta própria sessão, criado
depois deste arquivo.

Da sessão anterior (2026-07-24), já no remoto: `chore: configure local
supabase development`, `chore: prepare safe production cleanup and Vercel env
separation`, `fix: validate public urls and qr code generation`, `chore:
prepare vercel production deployment`, `docs: document upload size tests and
vercel build command`, `fix: prevent mock payment flow in production`, `fix:
add terminal states to pending order polling`, `docs: document phase 2.5
deployment and pending work`.

## 3. URLs

| Uso | URL |
|---|---|
| Produção (atual) | `https://antero-cartas.vercel.app` |
| Produção (definitiva, pendente de DNS) | `https://cartas.anterosistemas.com.br` |
| Sitemap | `/sitemap.xml` |
| Robots | `/robots.txt` |
| Imagem Open Graph | `/opengraph-image` (PNG 1200x630) |
| Repositório | `github.com/DavidEdsonDoNascimento/antero-cartas` |

Confirmado no smoke test: **nenhuma URL de produção contém `localhost`,
placeholder ou string vazia.** O `sitemap.xml` publicado usa o domínio da
Vercel — passará ao domínio definitivo automaticamente no deploy seguinte à
troca de `NEXT_PUBLIC_SITE_URL`, porque tudo deriva dessa variável.

## 4. Domínio

`cartas.anterosistemas.com.br` foi **adicionado ao projeto `antero-cartas`**
na Vercel nesta sessão. A propriedade do domínio já está verificada — o apex
`anterosistemas.com.br` está na mesma conta Vercel desde 2026-04-29.

Descoberta relevante: o DNS do domínio **não** está na Vercel. Os nameservers
apontam para a **Cloudflare** (`mustafa.ns.cloudflare.com`,
`sarah.ns.cloudflare.com`), então os registros que `vercel dns ls` lista para
esse domínio não são autoritativos. O apex e o `www` pertencem a outro projeto
(`dnsistemas`); criar `cartas.` não conflita com eles.

Registro exato a criar, e passo a passo do que fazer depois: seção 8 de
`docs/0006_Runbook_Producao.md`.

**Não alterei o DNS** — é ação sua, e é irreversível o suficiente para exigir
sua mão.

## 5. Supabase

| Ambiente | Onde | Estado |
|---|---|---|
| Desenvolvimento | Supabase local (Docker, CLI) | funcionando; `127.0.0.1:54321` (API) e `54322` (Postgres) |
| Produção | projeto remoto `antero-cartas` | em uso pela aplicação publicada |

- Nenhum terceiro projeto foi criado; `antero-atendimentos` não foi tocado.
- Plano gratuito mantido; nenhum upgrade.
- Desenvolvimento **não depende** do banco remoto (D49 + `APP_ENV`).
- Guard `assertPrismaCliAllowed`: o Prisma CLI recusa rodar contra produção
  sem `ALLOW_PRISMA_CLI_PRODUCTION=true` passado por comando.

### Migrations

Prisma é a **única fonte de verdade** do schema (D50). O Supabase CLI local só
orquestra os containers. Migrations **nunca** rodam automaticamente no Build
Command da Vercel — é passo manual, documentado na seção 6 do runbook.
Nenhuma migration nova foi criada nesta sessão; o schema não mudou.

### Storage

Bucket público para leitura, chave de objeto terminando em UUID (não
enumerável), sem política de listagem. A `SUPABASE_SERVICE_ROLE_KEY` só existe
no servidor — **confirmado nesta sessão** varrendo os 11 bundles do cliente em
produção (939 KB): nenhuma ocorrência de service role, JWT do Supabase, string
de conexão do banco ou chave da API do YouTube.

## 6. Vercel

- Projeto `antero-cartas` (`prj_0ABNrkawuQGILAUJ3VsRweCpLfim`), branch de
  produção `master`, deploy automático pelo Git.
- **19 variáveis** em Production. **Preview e Development continuam com zero
  variáveis** — confirmado nesta sessão por `vercel env ls`. Sem credencial,
  Preview não alcança o banco de produção; valida só build e páginas que não
  dependem do backend.
- Mocks bloqueados em produção: `ALLOW_MOCK_PAYMENT_CONFIRMATION=false`,
  `DEV_EMAILS_ENABLED=false`, `PAYMENT_MODE=mock`, `EMAIL_MODE=mock`, e
  `NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION` ausente (equivale a `false`).

## 7. Sentry

Implementado e **desligado por falta de DSN** — sem DSN, `init` não é chamado,
nada é enviado e a aplicação funciona igual.

Cobre cliente, servidor e edge. `onRequestError` captura erro não tratado de
rota de API, Server Component e renderização, o que cobre de uma vez falha de
persistência, erro de banco, exceção de API, falha de publicação e falha da
carta pública; o SDK do navegador cobre falha de criação de rascunho, erro de
upload e erro de criação de pedido.

Sanitização em `src/lib/sentryPrivacy.ts` (19 testes). Ver D56 e a seção 9 do
runbook.

**Não validado ponta a ponta** — sem DSN não dá para confirmar recebimento
real. Ao configurar, conferir no painel que o primeiro evento chega **já
sanitizado**.

## 8. Analytics

Vercel Web Analytics: gratuito no Hobby, **sem cookie**, sem credencial,
script servido pela própria origem (não abre domínio na CSP).

Falta **um clique gratuito** no painel (projeto -> Analytics -> Enable) para a
plataforma começar a coletar. O `<Analytics />` já está no `layout.tsx`.

**Limitação:** eventos personalizados exigem plano Pro; no Hobby só o pageview
é coletado. O adapter para os cerca de 25 `track()` do produto está pronto
atrás de `NEXT_PUBLIC_ANALYTICS_CUSTOM_EVENTS_ENABLED` (desligado). Ver D55.

**Privacidade:** as URLs privadas são mascaradas antes do envio — sem isso o
link exclusivo da carta sairia do navegador, porque o Web Analytics registra a
URL completa de cada pageview. 13 testes cobrem isso.

## 9. SEO

`sitemap.ts`, `robots.ts` revisado, canonical relativo, `openGraph.url`,
Twitter card `summary_large_image`, e imagem Open Graph 1200x630 gerada em
build com a paleta da marca. Ver D58 e a seção 11 do runbook.

## 10. Headers de segurança

CSP montada a partir dos domínios levantados no código (não por suposição),
mais nosniff, `X-Frame-Options: DENY` + `frame-ancestors 'none'`,
`Referrer-Policy`, `Permissions-Policy` e HSTS só em produção sem `preload`.
Nenhuma diretiva usa `*` nem `https:`. Ver D57.

## 11. Testes

### Executados por mim (Claude), nesta sessão

| Comando | Resultado |
|---|---|
| `npm run lint` | limpo |
| `npm run typecheck` | limpo |
| `npm run build` | limpo |
| `npm test` | 204 passam / 7 pulados (sem banco) |
| `RUN_DB_TESTS=true npm test` | **211/211 passam** (Postgres local) |

Os 7 pulados sem banco são os testes de integração de
`src/server/phase2.integration.test.ts`, que exigem o Postgres local — passam
com `RUN_DB_TESTS=true`.

**61 testes novos** nesta sessão: `sitemap` (5), `analyticsPrivacy` (13),
`sentryPrivacy` (19), `securityHeaders` (20), rota `/api/dev/emails` (4).

### Validações executadas por mim contra ambiente real

- **CSP em navegador (Chromium) contra o build local:** as 5 rotas públicas
  renderizam sem violação e sem erro de página; a miniatura do YouTube
  carrega; e o **controle negativo confirma que a política é aplicada de
  fato** — `fetch` e `iframe` para origem não listada são bloqueados enquanto
  `/api/carts` continua permitido.
- **Smoke test de produção (somente leitura): 31/31.** HTTPS, canonical,
  `og:image`, sitemap sem rota privada, robots, os seis headers,
  `mock-confirm` -> 403, `/api/dev/emails` -> 404, resposta de pedido sem
  token nem e-mail, e nenhum segredo nos bundles do cliente.
- **Logs da Vercel** durante o smoke test: só `info`, nenhum erro.
- **Dry run** da limpeza de dados de teste (leitura apenas) — resultado
  idêntico ao documentado.

### Executado por você

Nada nesta sessão.

### Aguardando ação manual

O checklist de dispositivos físicos (Android, iPhone, Wi-Fi, rede móvel, 1/3/6
fotos, QR Code, WhatsApp, HTTPS, preview da imagem compartilhada) está na
seção 13 de `docs/0006_Runbook_Producao.md`, com campos em branco.

**Nenhum resultado manual foi preenchido por mim.** Os itens do handoff
parcial que estavam como PENDENTE continuam pendentes — eles dependem de
navegador e aparelho reais.

## 12. Dados de teste remotos

Nada foi removido. Dry run repetido nesta sessão, saída **idêntica** à
registrada em 2026-07-24:

| ID | Tipo | Status | Mídia | Pedidos | E-mails |
|---|---|---|---|---|---|
| `cmrzbpfxa000004l211cblj62` | Cart | `DRAFT`, sem slug | 0 | 0 | 0 |
| `cmrzbpt5c000104l2f1nt0n1f` | Cart | `AWAITING_PAYMENT`, sem slug | 0 | 1 | 0 |

O pedido relacionado é `cmrzbq6fp000204l2vjhtgvzv` (`PENDING`, e-mail
`diagnostico.etapa4@seed.local`, nunca confirmado). **0 mídia e 0 e-mail nos
dois** — não há nenhum objeto de Storage a apagar.

Comando de remoção, **a executar somente com sua autorização explícita**:

    npx tsx scripts/cleanupTestData.ts \
      --env-file .env.production.reference \
      --cart-ids cmrzbpt5c000104l2f1nt0n1f,cmrzbpfxa000004l211cblj62 \
      --confirm

Observação: nesta sessão **não criei novos registros em produção**. Os passos
que escrevem no banco (criar rascunho, atualizar, subir foto, criar pedido) já
tinham sido executados em 2026-07-24 e produziram exatamente os IDs acima;
repeti-los geraria uma nova leva de órfãos justamente enquanto a remoção da
leva anterior aguarda autorização.

## 13. Pendências externas (dependem de você)

| # | O que | Por que preciso de você |
|---|---|---|
| 1 | Criar o CNAME `cartas` na Cloudflare | acesso ao DNS |
| 2 | Habilitar Web Analytics no painel da Vercel | um clique, gratuito |
| 3 | Criar conta no Sentry e fornecer o DSN | credencial externa |
| 4 | Autorizar a remoção dos dados de teste | alteração destrutiva em produção |
| 5 | Rodar o checklist em Android/iPhone e rede móvel | aparelho físico |

## 14. Limitações e riscos conhecidos

- **Plano gratuito do Supabase:** sem backup automático (só `pg_dump` manual —
  seção 4 do runbook), sem SLA, e o projeto pode ser pausado por inatividade.
- **Sem staging remoto** — decisão consciente (limite de dois projetos
  gratuitos). Preview cobre só build e páginas sem backend.
- **Limite de payload da Vercel (~4,5 MB por requisição)** ainda não validado
  com upload real em produção. O guard de 10 MB do servidor foi testado
  localmente (seção 7 do runbook); o teto da Vercel é menor e só se confirma
  com um upload de fato passando por lá — item do checklist manual.
- **Pagamento e e-mail em modo mock** — produção cria pedido `PENDING` mas não
  confirma pagamento e não publica carta gratuitamente. Uma compra real só
  existe na Fase 3.
- **Eventos personalizados de analytics** não são coletados no plano Hobby.
- **Sentry não validado ponta a ponta** por falta de DSN.
- **`'unsafe-inline'` em `script-src`** — concessão consciente, justificada em
  D57. Reavaliar se a Fase 3 introduzir área autenticada.
- **`npm audit` reporta 18 vulnerabilidades** (3 moderadas, 15 altas), todas
  em dependências de **desenvolvimento** e **pré-existentes** a esta sessão:
  cadeia do `eslint` (`brace-expansion`/`minimatch`), CLI do `prisma`
  (`find-my-way`) e `postcss` interno do `next`. Não foram corrigidas de
  propósito: `npm audit fix --force` rebaixaria o `next` para 9.3.3 e o
  `eslint` para 10.x, o que é destrutivo e fora do escopo da Fase 2.5.
  Nenhuma delas afeta o runtime publicado.

## 15. Itens fora do escopo (confirmados não implementados)

Mercado Pago, Stripe, Pagar.me, Asaas, pagamento real, Pix real, cartão real,
webhook de pagamento, Resend, SendGrid, SES, e-mail transacional real,
recuperação de link por e-mail, painel administrativo, Redis, filas, workers,
cupons, afiliados, WhatsApp Cloud API, assistente de escrita com IA, novos
temas, edição pós-compra, migração para Firebase, upload direto / URL assinada.

Nenhuma rota temporária, backdoor ou mecanismo público de publicação foi
criado. Nenhuma rota que gere erro de propósito foi criada.

## 16. Como retomar

### Se você já criou o DNS

    Leia docs/0008_Handoff_Fase2_5_Final.md, seção 4, e a seção 8 de
    docs/0006_Runbook_Producao.md. O DNS de cartas.anterosistemas.com.br já
    foi configurado na Cloudflare. Valide a propagação e o HTTPS, troque
    NEXT_PUBLIC_SITE_URL em Production para o domínio definitivo, faça novo
    deploy e revalide canonical, sitemap, metadata, compartilhamento, link
    público e QR Code. Confirme que nenhuma URL pública usa localhost nem
    antero-cartas.vercel.app. Não inicie a Fase 3.

### Se você quer apagar os dados de teste

    Leia docs/0008_Handoff_Fase2_5_Final.md, seção 12. Repita o dry run,
    confirme que a saída é exatamente a documentada e só então execute a
    remoção com --confirm. Registre o resultado no changelog.

### Se você tem o DSN do Sentry

    Leia a seção 9 de docs/0006_Runbook_Producao.md. Configure
    NEXT_PUBLIC_SENTRY_DSN em Production, faça novo deploy e confirme no
    painel do Sentry que o primeiro evento chega já sanitizado.

## 17. Próxima fase recomendada

**Fase 3 — Pagamento e e-mail reais.**

Não iniciar sem nova solicitação sua.
