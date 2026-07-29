# 0008 — Handoff final · Fase 2.5 (Preparação para Produção) · 2026-07-29

> Este é o **handoff definitivo** da Fase 2.5 (seção 14 da task
> `docs/tasks/011_fase_2_5.md`). Substitui o parcial
> `docs/0007_Handoff_Fase2_5_Parcial.md`, que fica no repositório como
> registro histórico da sessão de 2026-07-24.

## 1. Resumo

O trabalho **técnico** da Fase 2.5 está concluído, **incluindo o domínio
definitivo**, que entrou no ar em 2026-07-29 com certificado válido, e o
**Sentry**, configurado, reimplantado e parcialmente validado no mesmo dia
(seção 7).

Os dados de teste em produção foram removidos com sua autorização (seção 12).

Resta uma ação que depende de você — rodar o checklist em aparelho físico
(seção 13) — nenhuma bloqueada por código. A validação ponta a ponta do
Sentry também tem um item pendente de confirmação sua (seção 7), sem bloquear
nenhuma outra parte da fase.

A Fase 3 **não** foi iniciada: não existe pagamento real, webhook nem e-mail
real. Nenhum serviço pago foi contratado, nenhum projeto Supabase novo foi
criado e o projeto `antero-atendimentos` não foi tocado.

## 2. Estado final

| Item | Estado |
|---|---|
| Branch | `master` (única do repositório), rastreando `origin/master` |
| Working tree | limpo |
| Git vs. remoto | sincronizados, mesmo commit |
| URL pública | **`https://cartas.anterosistemas.com.br`** (definitiva, no ar) |
| Certificado | Let's Encrypt, válido até 2026-10-27 |
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
| Produção (definitiva) | `https://cartas.anterosistemas.com.br` |
| Alias da plataforma | `https://antero-cartas.vercel.app` (mesmo deployment) |
| Sitemap | `/sitemap.xml` |
| Robots | `/robots.txt` |
| Imagem Open Graph | `/opengraph-image` (PNG 1200x630) |
| Repositório | `github.com/DavidEdsonDoNascimento/antero-cartas` |

Confirmado: **nenhuma URL gerada pela aplicação contém `localhost`,
placeholder, string vazia ou `.vercel.app`.** Canonical, `og:url`, `og:image`,
`twitter:image`, `sitemap.xml`, `robots.txt`, o link de compartilhamento por
WhatsApp e o QR Code usam todos o domínio definitivo.

O alias `antero-cartas.vercel.app` continua respondendo — é o padrão da
plataforma e aponta para o mesmo deployment. Não é problema: o que importa é
que a aplicação não o gera.

## 4. Domínio

**Concluído em 2026-07-29.** `https://cartas.anterosistemas.com.br` é a URL
pública definitiva.

Sequência executada:

1. Subdomínio adicionado ao projeto `antero-cartas` na Vercel.
2. Registro `CNAME cartas -> 0d681018f5545bb0.vercel-dns-017.com` criado na
   **Cloudflare** por você, com proxy desligado (DNS only).
3. DNS validado: `vercel domains verify` retorna `configured-correctly` /
   `configuredBy: CNAME`; resolvedores públicos (Google e Cloudflare) devolvem
   os IPs da Vercel (`64.29.17.65`, `216.198.79.65`) — confirmando que o proxy
   está mesmo desligado.
4. Certificado emitido pela Let's Encrypt (CN `cartas.anterosistemas.com.br`,
   cadeia confiável, válido até 2026-10-27). A emissão levou alguns minutos: o
   handshake TLS falhou nas primeiras tentativas e depois estabilizou em
   **20/20 requisições bem-sucedidas** em duas stacks TLS distintas (schannel
   do curl e a do Node).
5. `NEXT_PUBLIC_SITE_URL` trocada em Production às 19:15:26 UTC.
6. Novo deployment de produção criado às **19:15:43 UTC** — posterior à troca
   da variável, como exigido (a URL é lida em build time).

Ponto de atenção registrado para o futuro: o DNS de `anterosistemas.com.br`
está na **Cloudflare**, não na Vercel. Os registros que `vercel dns ls` lista
para esse domínio não são autoritativos.

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

**Configurado em Production desde 2026-07-29** (`NEXT_PUBLIC_SENTRY_DSN`,
adicionada manualmente por você só em Production; confirmado ausente em
Preview e Development). Novo deployment (`dpl_3ttrqvkadzK4EW9hioKPbDotgqdq`,
19:58:35 UTC) posterior à criação da variável, embutindo-a no build: CSP em
`connect-src` passou a incluir `https://o4511820149358592.ingest.us.sentry.io`
e o bundle do cliente contém o mesmo host — confirmado por mim contra o
domínio definitivo.

Cobre cliente, servidor e edge. `onRequestError` captura erro não tratado de
rota de API, Server Component e renderização, o que cobre de uma vez falha de
persistência, erro de banco, exceção de API, falha de publicação e falha da
carta pública; o SDK do navegador cobre falha de criação de rascunho, erro de
upload e erro de criação de pedido.

Sanitização em `src/lib/sentryPrivacy.ts` (19 testes). Ver D56 e a seção 9 do
runbook.

### Validação controlada — parcial

`scripts/sentryValidationEvent.ts` (script local, não rota pública, não botão
de teste) enviou um evento identificado. **Confirmado:** DSN, envio e
sanitização funcionam ponta a ponta — `commit` e `origin=phase-2.5-validation`
chegaram corretos, nenhum dado pessoal ou segredo.

O primeiro envio saiu com `environment=local`: bug do script (tag customizada
duplicando o campo nativo, que na real vem de `APP_ENV`/`SENTRY_ENVIRONMENT`),
não do Sentry. Corrigido — o script agora reusa a mesma resolução de ambiente
da aplicação e aborta se `APP_ENV` não resolver para `production` (testado
localmente com DSN falso).

Você rodou o script corrigido fora da sessão do Claude. Confirmado por você:
nenhum arquivo temporário sobrou e as variáveis foram removidas da sessão
depois; `server_name` mostrou sua máquina local, como esperado. **Os valores
exatos desse segundo evento — `environment=production`, `commit`, `origin`,
`flushed` — ainda não foram confirmados com dados reais** (o checklist
recebido trouxe os campos em branco, mesmo padrão do incidente registrado em
`docs/0007_Handoff_Fase2_5_Parcial.md`). Não registro esse item como validado
sem confirmação explícita sua.

**Não comprovado, e não será forçado:** captura de um erro real originado no
runtime serverless da Vercel — o script roda localmente, então `server_name`
nunca vai mostrar a Vercel. Não é motivo para criar rota pública ou forçar
erro em produção.

**Não use `vercel env pull` para obter o DSN** — a Vercel CLI só sabe
entregar o valor escrevendo em arquivo, sem modo somente-memória. Para
qualquer nova validação, copie o valor direto do painel da Vercel e cole
apenas no comando local.

## 8. Analytics

Vercel Web Analytics: gratuito no Hobby, **sem cookie**, sem credencial,
script servido pela própria origem (não abre domínio na CSP).

**Ativado no painel em 2026-07-29 e validado ao vivo em produção.** Navegando
por `/`, `/criar` e `/c/seed-demonstracao`, os três beacons enviados foram:

    {"o":"https://cartas.anterosistemas.com.br/",         ...}
    {"o":"https://cartas.anterosistemas.com.br/criar",    ...}
    {"o":"https://cartas.anterosistemas.com.br/c/[slug]", ...}

O slug real **não aparece em nenhum beacon** — a máscara de D55 funciona de
fato, não só em teste unitário.

Armadilha registrada: o script do Web Analytics ignora navegador automatizado
(`navigator.webdriver` ou `Headless` no user agent) e não envia beacon algum.
Sem mascarar as duas coisas, parece enganosamente que o analytics não funciona.

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
- **Smoke test de produção (somente leitura): 31/31**, executado tanto contra
  `antero-cartas.vercel.app` quanto, depois da troca, contra
  `cartas.anterosistemas.com.br`. Cobre HTTPS, canonical, `og:image`, sitemap
  sem rota privada, robots, os seis headers, `mock-confirm` -> 403,
  `/api/dev/emails` -> 404, resposta de pedido sem token nem e-mail, e nenhum
  segredo nos bundles do cliente.
- **Validação do domínio definitivo: 29/31** — as duas "falhas" foram do meu
  próprio teste, que procurava o botão de compartilhar no HTML do servidor; ele
  só é renderizado depois de abrir o envelope, no cliente. Verificado em
  navegador: o link sai como
  `https://cartas.anterosistemas.com.br/c/seed-demonstracao`, sem token.
- **QR Code decodificado** (não apenas gerado): contém exatamente
  `https://cartas.anterosistemas.com.br/c/seed-demonstracao` — sem
  `.vercel.app`, sem `localhost`, sem token, sem barra duplicada.
  Reproduzível com `scripts/checkQrDomain.ts`.
- **Certificado TLS** inspecionado: CN `cartas.anterosistemas.com.br`, emissor
  Let's Encrypt, cadeia confiável, válido até 2026-10-27.
- **Carta pública** aberta em navegador contra o domínio definitivo, sem
  nenhuma violação de CSP.
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

## 12. Dados de teste remotos — REMOVIDOS

Removidos em 2026-07-29, com sua autorização explícita e por ID:

| ID | Tipo | Status |
|---|---|---|
| `cmrzbpfxa000004l211cblj62` | Cart | `DRAFT`, sem slug |
| `cmrzbpt5c000104l2f1nt0n1f` | Cart | `AWAITING_PAYMENT`, sem slug |
| `cmrzbq6fp000204l2vjhtgvzv` | Order | `PENDING`, e-mail `@seed.local` |

Antes de remover: dry run repetido, confirmando **0 mídia e 0 EmailDelivery**
nos dois carts (logo, nenhum objeto de Storage) e **exatamente um** Order
casando com eles — o autorizado.

Totais do banco antes e depois:

| | Antes | Depois | Delta |
|---|---|---|---|
| Cart | 23 | 21 | −2 |
| Order | 10 | 9 | −1 |
| CartMedia | 21 | 21 | 0 |
| EmailDelivery | 5 | 5 | 0 |

Os três IDs não aparecem mais em nenhuma listagem; os 9 Orders restantes são
anteriores e intactos.

A primeira tentativa **abortou** pelo guard D49
(`APP_ENV=production com NODE_ENV != "production"`) em `getStorage()`, antes de
qualquer `delete` — nada foi removido nessa tentativa. Refeita com
`NODE_ENV=production` explícito, que é o caminho indicado pela própria mensagem
do guard para operação administrativa intencional.

### Ainda existem outros registros de aparência de teste

O banco de produção tem vários `Cart` em `DRAFT` sem slug e o par
`cmrzae1sv000104jmifvnoem5` / Order `cmrzaj9et000604jm5tjy5mwc` (`PENDING`).
**Nenhum foi tocado** — a autorização cobria só os três IDs acima. Qualquer
limpeza adicional precisa de nova autorização, com o mesmo procedimento: dry
run, conferência de mídia/e-mail/Storage e comparação de totais antes e depois.

Nesta fase **não criei novos registros em produção**: os passos que escrevem no
banco já tinham sido executados em 2026-07-24 e produziram exatamente os IDs
acima.

## 13. Pendências externas (dependem de você)

| # | O que | Por que preciso de você |
|---|---|---|
| 1 | Rodar o checklist em Android/iPhone e rede móvel | aparelho físico |
| 2 | Confirmar os valores reais do 2º evento de validação do Sentry (`environment=production`, `commit`, `origin`, `flushed`) | só você viu o painel/terminal; não registro "sim" sem confirmação |

Concluídos por você em 2026-07-29: CNAME na Cloudflare, ativação do Web
Analytics, autorização da limpeza dos dados de teste, criação/configuração do
DSN do Sentry em Production, e execução do script de validação corrigido.
Todos validados por mim logo em seguida (Sentry: parcialmente — ver seção 7).

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

### Se você quiser confirmar de vez a validação do Sentry

    Rode scripts/sentryValidationEvent.ts (instruções no próprio arquivo —
    copie o DSN direto do painel da Vercel, nunca via `vercel env pull`) e
    reporte os valores reais de environment, commit, origin e flushed do
    evento no painel do Sentry. Sem essa confirmação, o item fica registrado
    como pendente na seção 7 e 13, sem bloquear o resto da fase.

### Se você quiser comprovar captura de erro real do runtime da Vercel

    Isso só é possível com um erro genuíno de produção — não crie rota
    pública nem force um erro artificialmente. Fica registrado como
    limitação conhecida (seção 7) até que aconteça organicamente.

## 17. Próxima fase recomendada

**Fase 3 — Pagamento e e-mail reais.**

Não iniciar sem nova solicitação sua.
