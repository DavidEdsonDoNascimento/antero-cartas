# Antero Cartas

Cartinhas digitais para surpreender alguém especial. Um produto da **Antero Sistemas**.

Crie uma cartinha com mensagem, fotos, música e contador de tempo. Ela abre no
celular por um link privado, como um envelope — sem app, sem cadastro.

> Status: **Fase 2 — persistência e infraestrutura mínima** (banco real, upload
> real de fotos, pedido + pagamento mock, publicação, QR Code, e-mail mock).
> **Pagamento real ainda não implementado.**
> Veja o faseamento em [`docs/0002_MVP_Plan.md`](docs/0002_MVP_Plan.md).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 +
PostgreSQL · Zod · Vitest.

## Como executar (primeira vez)

```bash
npm install
cp .env.example .env.local
```

Edite `.env.local` e preencha pelo menos `DATABASE_URL` (e `DIRECT_URL`, se o
seu provedor usar pooler) com um banco PostgreSQL — veja "Configurar o banco"
abaixo. As demais variáveis já vêm com padrões que funcionam em desenvolvimento
(pagamento e e-mail em modo mock, busca de música em modo mock, storage em disco).

```bash
npm run db:generate   # gera o cliente Prisma
npm run db:migrate    # cria as tabelas no banco
npm run db:seed       # (opcional) dados de exemplo
npm run dev
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
4. Rode `npm run db:migrate` para criar as tabelas.

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
   npm run storage:setup
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
- `npm run dev` — ambiente de desenvolvimento
- `npm run build` — build de produção
- `npm run start` — sobe o build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript (`tsc --noEmit`)
- `npm test` — testes unitários (Vitest) · `npm run test:watch`
- `npm run db:generate` — gera o cliente Prisma (`src/generated/prisma`)
- `npm run db:migrate` — aplica migrations em desenvolvimento (`prisma migrate dev`)
- `npm run db:push` — sincroniza o schema sem gerar migration (protótipos rápidos)
- `npm run db:seed` — popula dados de exemplo (nenhum dado real)
- `npm run db:studio` — abre o Prisma Studio para inspecionar o banco
- `npm run storage:setup` — cria/corrige o bucket de fotos no Supabase Storage

Em produção, use `db:generate` no build e uma migration explícita
(`prisma migrate deploy`, não incluído nos scripts por não ser usado ainda
nesta fase) antes de subir uma nova versão.

## Testes

- **Unitários** (`npm test`): rodam sempre, sem precisar de banco — cobrem
  música, token de edição, slug, expiração, validação de imagem, schemas etc.
- **Integração** (banco real): desligados por padrão. Rode com:
  ```bash
  RUN_DB_TESTS=true npm test
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

- **Banco**: `npm run db:studio` para inspecionar/apagar manualmente, ou
  `npx prisma migrate reset` para recriar o schema do zero (apaga tudo).
- **Fotos em disco**: apague a pasta `.data/uploads` (gitignored).
- **Sessão do navegador**: no DevTools, remova a chave `antero:session` do
  `localStorage` para forçar a criação de um novo rascunho.

## Documentação
- [`docs/0001_Product_Brief.md`](docs/0001_Product_Brief.md) — problema, público, valor, jornada
- [`docs/0002_MVP_Plan.md`](docs/0002_MVP_Plan.md) — fases e critérios de aceite
- [`docs/0003_Architecture.md`](docs/0003_Architecture.md) — stack e estrutura
- [`docs/0004_Decisions.md`](docs/0004_Decisions.md) — decisões e valores provisórios
- [`docs/0005_ChangeLog.md`](docs/0005_ChangeLog.md) — histórico de mudanças

## Configuração central
- `src/config/site.ts` — marca, copy e posicionamento
- `src/config/plans.ts` — planos e preços (centavos; autoritativo no servidor)
- `src/config/flags.ts` — feature flags (`AI_WRITING_ASSISTANT`, `PAYMENT_MODE`)
- `src/lib/limits.ts` — `MAX_CART_PHOTOS` e limites de texto (fonte única)
- `src/content/themes.ts` — temas dirigidos por tokens
- `src/content/*` — destinatários, ocasiões, temas, modelos, FAQ, depoimentos
- `src/server/*` — serviços de backend (carrinho, pedido, storage, pagamento,
  e-mail — todos atrás de interfaces trocáveis)
