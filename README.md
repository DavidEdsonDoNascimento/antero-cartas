# Antero Cartas

Cartinhas digitais para surpreender alguém especial. Um produto da **Antero Sistemas**.

Crie uma cartinha com mensagem, fotos, música e contador de tempo. Ela abre no
celular por um link privado, como um envelope — sem app, sem cadastro.

> Status: **Fase 3 — venda real, em andamento** (`docs/tasks/013_fase_3.md`).
> Produção está no ar em `https://cartas.anterosistemas.com.br` com domínio,
> Sentry e Analytics ativos (Fase 2.5 concluída). Pagamento real (Mercado
> Pago, Pix + cartão) e e-mail real (Resend) já estão implementados e
> testados, mas **ainda não ativados** — produção continua em
> `PAYMENT_MODE=mock`/`EMAIL_MODE=mock` até a validação em sandbox e
> autorização explícita (ver `docs/0006_Runbook_Producao.md`, seções 14–16).
> Veja o faseamento em [`docs/0002_MVP_Plan.md`](docs/0002_MVP_Plan.md).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 +
PostgreSQL · Zod · Vitest.

## Como executar (primeira vez)

O gerenciador oficial é o **pnpm** (versão fixada em `packageManager` no
`package.json`; com Corepack, `corepack enable` já usa a certa). Não use npm
nem yarn — um segundo lockfile quebra a reprodutibilidade e a detecção da
Vercel.

```bash
pnpm install
cp .env.example .env.local
```

Edite `.env.local` e preencha pelo menos `DATABASE_URL` (e `DIRECT_URL`, se o
seu provedor usar pooler) com um banco PostgreSQL — veja "Configurar o banco"
abaixo. As demais variáveis já vêm com padrões que funcionam em desenvolvimento
(pagamento e e-mail em modo mock, busca de música em modo mock, storage em disco).

```bash
pnpm db:generate   # gera o cliente Prisma
pnpm db:migrate    # cria as tabelas no banco
pnpm db:seed       # (opcional) dados de exemplo
pnpm dev
```
Acesse http://localhost:3000.

## Configurar o banco (PostgreSQL)

Qualquer Postgres serve. Para um banco hospedado gratuito (Neon, Supabase,
Railway...):
1. Crie um projeto/banco no provedor escolhido.
2. Copie a connection string para `DATABASE_URL` em `.env.local`.
3. Se o provedor oferecer uma conexão **direta** (sem pooler/PgBouncer),
   coloque-a em `DIRECT_URL` — é a que as migrations usam. Se não houver
   pooler, repita o mesmo valor de `DATABASE_URL`.
4. Rode `pnpm db:migrate` para criar as tabelas.

> Use um banco **de desenvolvimento/teste**, nunca compartilhe credenciais de
> produção neste arquivo.

## Configurar o storage de fotos

Em desenvolvimento o padrão é o **disco local** (`STORAGE_PROVIDER=local`), que
grava em `.data/uploads` e serve por `/api/media`. Não precisa configurar nada.

Para produção use o **Supabase Storage** — o disco local não sobrevive a deploy
serverless (disco efêmero) nem funciona com múltiplas instâncias:

1. No painel do Supabase, em **Project Settings → API**, copie:
   - a **Project URL** → `SUPABASE_URL`
   - a chave **`service_role`** → `SUPABASE_SERVICE_ROLE_KEY`
2. Crie o bucket (idempotente, pode rodar de novo sem problema):
   ```bash
   pnpm storage:setup
   ```
3. Ative o provider em `.env.local`:
   ```
   STORAGE_PROVIDER=supabase
   ```

> A `service_role` **ignora RLS** e vale como acesso total ao projeto: mantenha-a
> só no servidor, nunca com prefixo `NEXT_PUBLIC_`, e nunca no repositório.

O bucket é **público para leitura** e a privacidade da foto vem da chave, que
termina em um UUID de 122 bits — mesmo modelo do slug da carta. Por isso **não
crie policies de SELECT/list em `storage.objects`** para este bucket: sem elas,
a chave anônima lê apenas URLs que já conhece e não consegue enumerar as fotos
das cartinhas. Detalhes em `docs/0004_Decisions.md` (D39–D44).

## Scripts
- `pnpm dev` — ambiente de desenvolvimento
- `pnpm build` — build de produção
- `pnpm start` — sobe o build
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript (`tsc --noEmit`)
- `pnpm test` — testes unitários (Vitest) · `pnpm test:watch`
- `pnpm db:generate` — gera o cliente Prisma (`src/generated/prisma`)
- `pnpm db:migrate` — aplica migrations em desenvolvimento (`prisma migrate dev`)
- `pnpm db:push` — sincroniza o schema sem gerar migration (protótipos rápidos)
- `pnpm db:seed` — popula dados de exemplo (nenhum dado real)
- `pnpm db:studio` — abre o Prisma Studio para inspecionar o banco
- `pnpm storage:setup` — cria/corrige o bucket de fotos no Supabase Storage

Em produção, use `db:generate` no build e uma migration explícita
(`prisma migrate deploy`, não incluído nos scripts por não ser usado ainda
nesta fase) antes de subir uma nova versão.

## Testes

- **Unitários** (`pnpm test`): rodam sempre, sem precisar de banco — cobrem
  música, token de edição, slug, expiração, validação de imagem, schemas etc.
- **Integração** (banco real): desligados por padrão. Rode com:
  ```bash
  RUN_DB_TESTS=true pnpm test
  ```
  Use um banco de **teste** (não o de desenvolvimento nem produção) — os testes
  criam e removem dados reais. Cobrem o fluxo completo: rascunho → token →
  upload/reordenação de fotos → pedido → confirmação mock idempotente →
  publicação → consulta pública → e-mail único → expiração.

## Busca de música (YouTube)

Na Etapa 3 o usuário pode **pesquisar** por música/artista ou **colar o link** do
YouTube. A busca usa a YouTube Data API v3 por uma rota server-side
(`/api/youtube/search`); a chave fica **somente no servidor**.

**Modos** (`YOUTUBE_SEARCH_MODE`):
- `mock` (padrão) — lista local de demonstração, funciona **sem chave**;
- `real` — usa a API (exige `YOUTUBE_API_KEY`);
- `disabled` — oculta a busca; mantém a opção de colar link.

**Rodar em modo real** — configure a chave e reinicie:
1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie ou
   selecione um projeto.
2. Em **APIs e serviços → Biblioteca**, habilite a **YouTube Data API v3**.
3. Em **APIs e serviços → Credenciais**, crie uma **Chave de API**.
4. **Restrinja a chave**: em *Restrições de API*, permita apenas a *YouTube Data
   API v3*; em *Restrições de aplicativo*, limite por referenciador/IP conforme o
   ambiente. Nunca exponha a chave no cliente.
5. No `.env.local`: `YOUTUBE_API_KEY=SUA_CHAVE` e `YOUTUBE_SEARCH_MODE=real`.
6. **Modo disabled**: `YOUTUBE_SEARCH_ENABLED=false` (e
   `NEXT_PUBLIC_YOUTUBE_SEARCH_ENABLED=false`).
7. **Erros de cota**: a API tem cota diária (busca custa ~100 unidades). Se
   estourar, a rota responde `429` e a interface sugere colar o link — sem quebrar
   a criação.

> A chave nunca deve usar o prefixo `NEXT_PUBLIC_`. O app não extrai nem hospeda
> áudio: apenas incorpora o player oficial do YouTube.

## Como testar o fluxo completo

1. `/` — landing. Clique no envelope da demonstração para vê-lo abrir.
2. `/criar` — monte a cartinha nas 4 etapas (o preview atualiza em tempo real).
   Na Etapa 3, adicione até **6 fotos** (upload real), defina a **capa** e
   reordene (← / →). Atualize a página no meio: o rascunho é recuperado do
   backend (não mais só do navegador).
3. Escolha um plano e clique em **Continuar para o pagamento** → vai para
   `/checkout/[cartId]`.
4. Preencha nome, e-mail e aceite os termos → **Continuar**. Na tela seguinte,
   clique em **Simular pagamento aprovado** (ou falha/expiração, para testar
   esses estados).
5. Você é levado a `/pedido/[orderId]/sucesso`: link público, QR Code, botão de
   WhatsApp e aviso de "e-mail enviado" (mock).
6. Abra o link `/c/[slug]` — funciona em **qualquer navegador/dispositivo**,
   pois agora vem do banco. Clique no envelope: a carta abre e a música toca.
7. `/demonstracao` — exemplo fictício pronto, sem passar pelo banco.

**Ver os e-mails mock**: em desenvolvimento, acesse
`GET /api/dev/emails` (ou `?orderId=...` para filtrar) — mostra assunto, HTML e
texto do que "seria enviado". Rota bloqueada automaticamente em produção.

**Limitação sem login**: a edição do rascunho e o checkout só funcionam no
navegador onde a cartinha foi criada (o token de edição fica no
`localStorage`). Abrir `/checkout/[cartId]` em outro dispositivo mostra uma
mensagem clara em vez de falhar silenciosamente.

## Limpar dados de desenvolvimento

- **Banco**: `pnpm db:studio` para inspecionar/apagar manualmente, ou
  `pnpm exec prisma migrate reset` para recriar o schema do zero (apaga tudo).
- **Fotos em disco**: apague a pasta `.data/uploads` (gitignored).
- **Sessão do navegador**: no DevTools, remova a chave `antero:session` do
  `localStorage` para forçar a criação de um novo rascunho.

## Produção

A aplicação está publicada na Vercel. O domínio definitivo será
`https://cartas.anterosistemas.com.br` (aguardando o registro DNS; até lá,
`https://antero-cartas.vercel.app`).

- **Observabilidade:** Sentry opcional — sem DSN, `init` não é chamado e nada
  é enviado. Tudo que sai passa por `src/lib/sentryPrivacy.ts`, que descarta o
  corpo da requisição, cookies e cabeçalhos sensíveis e mascara e-mail, CPF,
  telefone, token e URL privada.
- **Analytics:** Vercel Web Analytics — gratuito, sem cookie. As URLs privadas
  (`/c/<slug>`, `/pedido/`, `/checkout/`) são mascaradas antes do envio.
- **Headers:** CSP montada a partir dos domínios reais do código, mais
  nosniff, anti-framing, `Referrer-Policy`, `Permissions-Policy` e HSTS em
  produção — `src/config/securityHeaders.ts`.
- **SEO:** `sitemap.ts` (só rotas públicas indexáveis), `robots.ts`, canonical
  e imagem Open Graph gerada em build.

Procedimentos operacionais (deploy, migrations, DNS, backup, limpeza de dados
de teste, rollback) estão no runbook de produção.

## Documentação
- [`docs/0001_Product_Brief.md`](docs/0001_Product_Brief.md) — problema, público, valor, jornada
- [`docs/0002_MVP_Plan.md`](docs/0002_MVP_Plan.md) — fases e critérios de aceite
- [`docs/0003_Architecture.md`](docs/0003_Architecture.md) — stack e estrutura
- [`docs/0004_Decisions.md`](docs/0004_Decisions.md) — decisões e valores provisórios
- [`docs/0005_ChangeLog.md`](docs/0005_ChangeLog.md) — histórico de mudanças
- [`docs/0006_Runbook_Producao.md`](docs/0006_Runbook_Producao.md) — runbook de produção, checklist manual, Mercado Pago e Resend
- [`docs/0008_Handoff_Fase2_5_Final.md`](docs/0008_Handoff_Fase2_5_Final.md) — estado final da Fase 2.5
- [`docs/tasks/013_fase_3.md`](docs/tasks/013_fase_3.md) — escopo da Fase 3 (pagamento e e-mail reais)

## Configuração central
- `src/config/site.ts` — marca, copy e posicionamento
- `src/config/plans.ts` — planos e preços (centavos; autoritativo no servidor)
- `src/config/flags.ts` — feature flags (`AI_WRITING_ASSISTANT`, `PAYMENT_MODE`)
- `src/config/securityHeaders.ts` — CSP e headers de segurança (função pura, testada)
- `src/lib/limits.ts` — `MAX_CART_PHOTOS` e limites de texto (fonte única)
- `src/content/themes.ts` — temas dirigidos por tokens
- `src/content/*` — destinatários, ocasiões, temas, modelos, FAQ, depoimentos
- `src/server/*` — serviços de backend (carrinho, pedido, storage, pagamento,
  e-mail — todos atrás de interfaces trocáveis)
