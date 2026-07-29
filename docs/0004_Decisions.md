# 0004 — Decisions · Antero Cartas

Registro de decisões e valores provisórios (claramente marcados) adotados sem
travar o desenvolvimento. Ajustáveis por configuração.

## D1 — Nome e marca
Nome provisório **"Antero Cartas"**. Centralizado em `config/site.ts` para troca
fácil (nome, logotipo textual, domínio).

## D2 — Paleta e tipografia
Adotada a direção da task (vinho/creme/rosa queimado/dourado/grafite), **sem** o
rosa predominante da referência. Fontes: Playfair Display (títulos), Inter
(texto), Dancing Script (título manuscrito da carta). Tokens em `globals.css`.

## D3 — Preços provisórios
Essencial R$ 18,90 / Para Sempre R$ 48,90; plano limitado 365 dias. Em centavos,
em `config/plans.ts`, sobrescrevíveis por env. **Confirmar com a Antero.**

## D4 — Persistência local na Fase 1
Sem banco. Rascunho em `localStorage` **sem imagens** (respeita a regra de não
guardar imagens grandes). Fotos ficam em memória na sessão; ao publicar, a carta
(com fotos comprimidas) é salva por slug. Consequência: uma carta criada só abre
no mesmo navegador — aceitável para demonstração; resolvido na Fase 2 com backend.

## D5 — Pagamento mockado e separado do real
Fase 1 tem apenas seleção de plano visual em **modo demonstração** (`PAYMENT_MODE=mock`),
sem cobrança. Interface `PaymentProvider` e webhook idempotente entram na Fase 2/3.
Nunca tratar compra como paga por retorno do navegador.

## D6 — Sem cronômetro falso de reserva
Não implementamos contador de reserva. Só existirá quando houver reserva real no
backend (Fase 3).

## D7 — Depoimentos fictícios marcados
Depoimentos atuais são exemplos, com etiqueta "demonstração" (`testimonialsAreDemo`).
Nunca publicar fictícios em produção — substituir e definir a flag como `false`.

## D8 — Garantia desligada por padrão
`guarantee.enabled = false` até a Antero confirmar qualquer promessa comercial/legal.

## D9 — Música por YouTube
No MVP, só URL do YouTube. ID extraído e validado; embed montado pelo sistema.
A música inicia após o clique de abertura (restrições de autoplay dos navegadores).

## D10 — "Preciso de inspiração" sem IA
Modelos locais em `content/templates.ts`. Flag `AI_WRITING_ASSISTANT=false`
deixa o caminho pronto para um assistente com LLM no futuro, sem integração agora.

## D11 — QR Code e e-mail
Ficam para a Fase 2 (conforme o faseamento da task). Na Fase 1, a tela de sucesso
mostra o link e o compartilhamento por WhatsApp, e sinaliza o e-mail futuro.

---

## Fase 1.1 — Refinamento funcional e visual

## D12 — Limite de fotos: 3 → 6
Aumentado para **6 fotos** por cartinha. Fonte única em `MAX_CART_PHOTOS`
(`lib/image.ts`), sobrescrevível por `NEXT_PUBLIC_MAX_CART_PHOTOS`. O número não é
repetido pelo projeto — textos de UI e copy derivam da constante.

## D13 — Fotos em carrossel (sem dependência)
As fotos deixam de aparecer lado a lado e passam a um **carrossel próprio**
(`components/card/PhotoCarousel.tsx`), implementado com React + CSS + pointer
events, **sem instalar biblioteca**. Suporta swipe, teclado, indicadores,
crossfade com altura constante e `prefers-reduced-motion`. Usado no preview,
na demonstração e na carta aberta. Justificativa de não usar lib: os requisitos
(1 foto por vez, prev/próxima, dots, swipe, teclado) são plenamente atendidos
com pointer events e opacidade, evitando peso e risco desnecessários.

## D14 — Reordenação simples + capa
Reordenação por botões **← / →** e ação **"capa"** (define a 1ª foto). Sem
drag-and-drop (evita dependência/risco no MVP). A ordem é refletida no carrossel.

## D15 — Autosave de fotos em duas camadas (temporário)
Para manter a ordem/fotos ao atualizar a página, o rascunho passou a persistir as
fotos comprimidas em `localStorage` numa **chave separada** (`antero:draft:media`),
enquanto o texto fica em `antero:draft`. Se as 6 imagens estourarem a cota, a
gravação das fotos é ignorada silenciosamente e **o texto continua salvo** — sem
erro para o usuário. Isto revisa o D4/regra "não guardar imagens grandes": é uma
**solução temporária proporcional** para demonstração (a task 002 §9 autoriza),
substituída por upload real (S3) + backend na **Fase 2**. Limitação conhecida:
6 fotos podem não persistir entre atualizações em navegadores com cota baixa.

## D16 — Temas visualmente distintos por tokens
Os 4 temas passaram a variar por tokens (`content/themes.ts`): tipografia do
título (script/serifada), papel (pautado/pontilhado/liso), moldura das fotos
(fita/limpa), borda e raio da carta, ornamento, divisor e selo do envelope —
sem quatro implementações separadas.

---

## Fase 1.2 — Pesquisa e seleção de música

## D17 — Busca oficial via YouTube Data API v3
A pesquisa usa a **API oficial** (search.list), sem scraping nem serviços não
oficiais. Feita numa rota server-side (`/api/youtube/search`) que devolve só o
formato interno `MusicSearchResult`, nunca a resposta bruta do Google.

## D18 — Chave somente no servidor
`YOUTUBE_API_KEY` **nunca** usa prefixo `NEXT_PUBLIC_` e não vai ao cliente
(verificado: ausente em `.next/static`). A UI conhece apenas a flag booleana
`NEXT_PUBLIC_YOUTUBE_SEARCH_ENABLED`.

## D19 — Pesquisa principal + colar link como alternativa
A busca é a opção principal; colar URL continua disponível (música ausente na
busca, API indisponível, cota atingida, ou link já em mãos). Ambos convergem para
a mesma estrutura `SelectedMusic` (`source: "search" | "manual"`).

## D20 — Modos mock / real / disabled
`YOUTUBE_SEARCH_MODE` separa busca real, mock (lista local marcada como
demonstração, sem chave) e desativada. O modo real **nunca** faz fallback
silencioso para resultados falsos; sem chave, retorna erro claro.

## D21 — Cache em memória temporário
Cache por termo normalizado, em memória e **por instância**, com TTL
configurável e tamanho limitado. É perdido em reinicializações e **não** substitui
Redis/cache compartilhado — suficiente para o protótipo. Redis fica para produção.

## D22 — Cota da API como limitação
A YouTube Data API tem cota diária (busca ~100 unidades). Mitigações: debounce,
mínimo de caracteres, dedupe, `maxResults` limitado e cache. Ao estourar, a rota
responde `429` e a UI sugere colar o link — sem quebrar a criação.

## D23 — Sem extração/hospedagem de áudio
O produto apenas **incorpora o player oficial** do YouTube. Não extrai áudio, não
faz download, não cria player próprio a partir do conteúdo e não contorna
anúncios/controles. A reprodução **depende da disponibilidade** do vídeo no YouTube
(nota exibida na UI e no FAQ).

## D24 — Rate limiting best-effort
`lib/rateLimit.ts` traz a abstração + um limitador em memória por instância
(best-effort). Não é proteção definitiva em serverless; produção deve usar store
compartilhado (ex.: Redis) atrás da mesma interface. Registrar termos de busca em
analytics exigirá uma estratégia de privacidade antes — por ora não são enviados.

## D25 — Testes com Vitest
Adicionado **Vitest** (devDependency) para cobrir as funções puras de música e o
serviço de busca (fetch injetável, sem rede). Justificativa: a fase introduz
integração externa e lógica pura crítica. Comandos: `npm test` / `npm run test:watch`.

## D26 — Persistência definitiva dos metadados fica para a Fase 2
Os metadados da música (`SelectedMusic`) hoje vivem no rascunho local. A
persistência definitiva (backend/Prisma) entra na Fase 2, mantendo a mesma forma.

---

## Fase 2 — Persistência, upload e publicação

## D27 — PostgreSQL hospedado (Neon/Supabase), não Docker local
O usuário optou por um Postgres **hospedado** em vez de subir Postgres via
Docker Compose localmente (Docker Desktop estava instalado mas não em
execução no ambiente de desenvolvimento no momento da implementação).
Consequência: `DATABASE_URL`/`DIRECT_URL` apontam para o provedor escolhido;
`DIRECT_URL` existe para migrations rodarem fora de um pooler/PgBouncer (comum
nesses provedores) — se o provedor não usar pooler, pode repetir `DATABASE_URL`.

## D28 — Storage de fotos em disco local (não S3 nesta fase)
O usuário optou por armazenar as fotos em **disco local**, atrás da interface
`StorageProvider` (`put/delete/getPublicUrl/read`), em vez de configurar um
bucket S3-compatible agora. Upload passa pelo **servidor Next**
(`multipart/form-data`), justificativa: sem infraestrutura S3 configurada neste
ambiente; mantém o produto 100% executável localmente sem custos/contas
externas. Limitações documentadas: tamanho de payload e tempo de execução da
rota ficam sujeitos ao runtime/hospedagem escolhida; em serverless (ex.:
Vercel) o disco não é persistente entre deploys — a troca para S3/R2 é feita
implementando a mesma interface, sem tocar no domínio.

> **Superada por D39** (Fase 2.1): o provider de produção passou a ser o
> Supabase Storage. O disco local continua sendo o padrão em desenvolvimento.

## D29 — Prisma 7: driver adapter + `prisma.config.ts`
A versão instalada (Prisma 7) mudou convenções relevantes: o gerador é
`prisma-client` (saída em `src/generated/prisma`, TS puro, gitignored); as
URLs de conexão **não** ficam mais em `schema.prisma` (`datasource.url`) — vão
para `prisma.config.ts` (usado pela CLI) e para um **driver adapter**
(`@prisma/adapter-pg`) instanciado em runtime (`lib/db.ts`). Isso evitou usar
convenções obsoletas da v5/v6 encontradas em treinamento anterior — confirmado
lendo a documentação/erros da própria CLI instalada antes de escrever o schema.

## D30 — Token de edição em vez de login
Confirma e implementa o mecanismo já prescrito pela task: token de 256 bits
gerado no servidor, só o **hash SHA-256** é persistido, o token cru vive
apenas no `localStorage` do comprador. Nunca vai para a URL. Comparação via
`timingSafeEqual`. Sem JWT (desnecessário para este caso de uso). Limitação
aceita e documentada: editar/finalizar a compra só funciona no navegador onde
a cartinha foi criada — não há recuperação por e-mail nesta fase.

## D31 — Slug com ≥128 bits de entropia
O comprimento padrão de `generateSlug()` subiu de 22 para 26 caracteres
(alfabeto de 33 símbolos) para atingir os ≥128 bits exigidos pela task. Afeta
apenas os slugs gerados a partir de agora; não há slugs antigos em produção.

## D32 — Preço sempre calculado no servidor
`POST /api/orders` recebe apenas `planType` do cliente; o valor em centavos
vem de `config/plans.ts` no servidor (`PLAN_LIMITED_PRICE`/`PLAN_PERMANENT_PRICE`,
agora lidas preferencialmente de env **sem** prefixo `NEXT_PUBLIC_`, caindo para
as públicas se ausentes). Testado explicitamente (envio de `amount` adulterado
no payload é ignorado).

## D33 — Confirmação mock idempotente via `updateMany` condicional
Em vez de "ler depois escrever" (sujeito a corrida), a confirmação usa
`prisma.order.updateMany({ where: { id, status: "PENDING" }, ... })` como trava
atômica: só a chamada que efetivamente muda o status segue para publicar a
carta e dispersar o e-mail; chamadas concorrentes ou repetidas recebem o
resultado já resolvido, sem duplicar slug, pedido ou e-mail.

## D34 — E-mail mock como outbox (`EmailDelivery`)
Em vez de enviar e-mail diretamente dentro da transação de pagamento
(acoplando disponibilidade do "envio" à publicação), o mock registra a intenção
em `EmailDelivery` com `@@unique([orderId, type])` e só então "renderiza" o
e-mail. Isso separa publicação de entrega (a publicação nunca falha por causa
do e-mail) e garante um único envio por pedido mesmo sob confirmações
concorrentes — proporcional ao pedido da task, sem fila externa.

## D35 — QR Code nunca bloqueia a publicação
`generateQrDataUrl` sempre retorna `string | null` e nunca lança. Se a geração
falhar, a carta é publicada normalmente e a tela de sucesso/e-mail simplesmente
omitem a imagem do QR Code (o link continua disponível em texto).

## D36 — Dependências novas: Prisma, Zod, qrcode, tsx
- **Prisma + `@prisma/client` + `@prisma/adapter-pg` + `pg`**: obrigatórios
  para o requisito explícito de banco relacional da Fase 2.
- **Zod**: validação central das rotas (a task pedia para reusar se já
  instalado; nesta fase é a primeira necessidade real de validação de payloads
  externos, então foi instalada).
- **qrcode**: geração local do QR Code (sem serviço externo); verificado que
  nada equivalente já existia no projeto antes de instalar.
- **tsx** (dev): o gerador `prisma-client` da v7 produz TypeScript puro com
  imports relativos sem extensão explícita — o executor nativo de TS do Node
  (`--experimental-strip-types`) não resolve esse padrão (só bundlers como o do
  Next resolvem). `tsx` é o padrão de facto do ecossistema Prisma para scripts
  de seed em TS; usado **somente** em `db:seed`.

## D37 — Rota de e-mails de desenvolvimento bloqueada em produção
`GET /api/dev/emails` (visualizador do outbox) checa `NODE_ENV === "production"`
e recusa incondicionalmente, além da flag `DEV_EMAILS_ENABLED`. Não é um painel
administrativo completo — apenas leitura, sem autenticação própria (aceitável
por ser inacessível em produção por construção).

## D38 — Testes de integração exigem opt-in explícito
`server/phase2.integration.test.ts` só roda com `RUN_DB_TESTS=true` **e**
`DATABASE_URL` definida — nunca por padrão. Isso impede `npm test` de tocar
acidentalmente em qualquer banco (de teste, dev ou produção) sem intenção
explícita do desenvolvedor, e documenta a recomendação de usar um banco/branch
dedicado a testes, nunca o de produção.

---

# Fase 2.1 — Storage de produção

## D39 — Supabase Storage como provider de produção
Escolhido entre Supabase Storage, Cloudflare R2 e AWS S3. Decisivo: o banco já
está no Supabase, então não entra provedor, conta nem painel novo — mesma
origem de credenciais e mesmo ciclo de vida do projeto. Tem CDN na frente e
free tier de 1 GB, suficiente com folga para fotos comprimidas (~150–400 KB
cada, até 6 por cartinha). R2 (sem custo de egress) e S3 continuam viáveis:
bastaria mais uma implementação de `StorageProvider`, sem tocar no domínio —
exatamente o que D28 previu.

Implementado em `server/storage/supabaseStorage.ts`, selecionado por
`STORAGE_PROVIDER=supabase`. O disco local segue como padrão em dev.

## D40 — Sem SDK: API REST do Storage via `fetch`
`@supabase/supabase-js` não foi instalado. A superfície usada é pequena e
estável (POST/DELETE/GET de um objeto e o caminho público do bucket), e o SDK
traria o cliente de auth/realtime/postgrest inteiro para o servidor sem
necessidade. Mesmo critério já aplicado à busca do YouTube (D-Fase 1.2), e
mesma disciplina de dependências das demais decisões.

## D41 — Upload continua passando pelo servidor Next (não URL assinada)
O handoff da Fase 2 sugeria upload direto do navegador por URL assinada. Foi
descartado por dois motivos concretos:
1. **O benefício não se aplica.** URL assinada existe para driblar limites de
   payload; o cliente já comprime para JPEG 1400 px q0.72 (~150–400 KB), muito
   abaixo do limite de uma Route Handler (~4,5 MB em serverless). Server
   Actions têm limite de 1 MB, mas o upload é Route Handler, não Server Action.
2. **Custaria um controle de segurança real.** Com upload direto, o servidor
   deixa de ver os bytes e a validação de **magic bytes** de
   `cartService.addMedia` some — qualquer conteúdo poderia entrar no bucket com
   extensão de imagem. Recuperar isso exigiria verificação assíncrona
   pós-upload, mais complexa do que o problema que resolve.

A troca continua contida: a interface `StorageProvider` não muda, então adotar
URL assinada depois é trocar a implementação de `put` e o caminho do cliente.

## D42 — Bucket público com chave inadivinhável, sem política de listagem
O bucket é **público para leitura**, e não privado com URL assinada de validade
curta. Motivo: URL assinada expira, o que quebra cache/CDN, obriga a re-assinar
a cada render da carta pública e conflita frontalmente com o plano **Para
Sempre** (link sem expiração).

A proteção é a mesma do slug da carta: a chave termina em `randomUUID()`
(122 bits), então a URL é inadivinhável. Complementos obrigatórios:
- **Nenhuma policy de SELECT/list em `storage.objects`** para este bucket —
  sem ela a chave anônima lê apenas URLs que já conhece e não consegue
  enumerar as fotos.
- **Escrita/remoção só com a service role key**, que nunca sai do servidor
  (`SUPABASE_SERVICE_ROLE_KEY`, sem prefixo `NEXT_PUBLIC_`).
- Bucket criado com `file_size_limit` de 10 MB e `allowed_mime_types`
  restrito a JPEG/PNG/WEBP — defesa em profundidade, além da validação da rota.

Aceito conscientemente: quem receber a URL de uma foto continua acessando-a
mesmo depois de a carta expirar. É o mesmo grau de exposição de uma foto
enviada por WhatsApp e não vale o custo de arquitetura de um bucket privado.

## D43 — Remoção de foto no storage é best-effort de verdade
`cartService.removeMedia` já documentava a remoção no storage como
best-effort, mas o `await` sem `try` transformava qualquer falha em HTTP 500 —
inofensivo com disco local, mas não com storage em rede. Como o banco é a fonte
da verdade e a transação já removeu a foto da carta, uma falha de rede na
exclusão do objeto passou a ser registrada em log e ignorada. No pior caso
sobra um objeto órfão no bucket; a alternativa era devolver erro ao usuário por
uma remoção que, para ele, já aconteceu.

## D44 — `npm run storage:setup` em vez de configuração manual
O bucket é criado/corrigido por `scripts/setupStorageBucket.ts` (idempotente),
não por cliques no dashboard: a configuração que importa para a segurança
(público, limite de tamanho, MIME types permitidos) fica versionada e
reproduzível em qualquer ambiente novo.

---

# Fase 2.2 — Ajustes de experiência em /criar (task 008)

## D45 — Prefetch da sessão no CTA em vez de esperar montar /criar
`/criar` é uma rota estática, mas `CreateFlow` só renderizava o editor depois
de uma chamada de rede (retomar ou criar rascunho), mostrando "Carregando…"
em tela branca por alguns segundos. A lógica de decisão foi extraída para
`lib/draftInit.ts` (`resolveCartInit`, testável sem DOM) com um cache de
prefetch (`prefetchCartInit`/`getCartInit`) disparado no hover/clique do CTA
via `CreateCta.tsx` — a navegação client-side do App Router preserva o módulo
em memória, então a rede já está em andamento quando `/criar` monta. Para o
restante dos casos (link direto, atualização de página, rede lenta),
`CreateFlowSkeleton` substitui o texto solto por uma estrutura fiel ao layout
real (StepIndicator, painel do formulário, preview) — nunca mais tela branca.

## D46 — Cache de recuperação local precisa morrer junto com a sessão
Causa raiz do "dados da carta anterior aparecendo na nova": `saveDraft(cart)`
roda a cada autosave (inclusive de uma carta prestes a ser publicada) e grava
o cart inteiro em `antero:draft` como cache de recuperação. Publicar uma carta
só limpava `antero:session`; o cache sobrevivia e, na ausência de sessão, era
tratado como "rascunho legado da Fase 1" a migrar — reintroduzindo campos de
uma carta já concluída. Fix: sempre que uma sessão é encerrada por qualquer
motivo (publicada, token inválido, carta não encontrada), `clearDraft()` roda
junto com `clearSession()` — em `resolveCartInit()` (sessão inválida) e em
`OrderSuccessClient` (publicação). A migração genuína da Fase 1 continua
intacta: só é acionada quando nunca existiu `antero:session`.

## D47 — Retomar rascunho é decisão do usuário, não automática
`resolveCartInit()` nunca aplica sozinho um "resume": devolve `{kind:
"resume"}` e quem decide é `ResumeDraftPrompt` (novo componente), com as
opções "Continuar esse rascunho" / "Começar uma cartinha nova". A carta
abandonada não é apagada ao escolher recomeçar — fica órfã em `DRAFT`, mesmo
destino de qualquer rascunho nunca finalizado (não há endpoint de exclusão e
não foi criado um só para isso).

## D48 — Preview otimista de foto, sem tocar no pipeline de upload
`StepPersonalize` mostrava a foto só depois de validar, comprimir e concluir
o upload no Supabase Storage — 100% síncrono com a primeira atualização
visual. Fix: `URL.createObjectURL` cria uma prévia local instantânea (estado
local do componente, nunca em `cart.media`/autosave) com spinner enquanto
valida/comprimir/envia em background; sucesso substitui a prévia pela foto
real vinda do servidor (sem duplicar, já que só uma das duas listas mostra
cada foto por vez), falha marca a prévia com "Falhou" e permite descartar.
Object URLs são revogados no sucesso, na falha, ao descartar e ao desmontar.
Avaliado e descartado paralelizar os uploads de múltiplos arquivos: o
servidor calcula `position` por contagem sem transação (`cartService.addMedia`),
então uploads concorrentes colidiriam na posição — mantido sequencial.

---

# Fase 2.5 — Preparação para produção (task 011)

## D49 — Ambiente local via Supabase CLI + Docker, `APP_ENV` como guarda explícita
Superada a limitação de D27 (Docker Desktop não estava em execução na Fase 2):
agora com Docker disponível, o desenvolvimento passa a usar **Supabase local**
(`npx supabase start`, `supabase/config.toml`) em vez do projeto remoto — banco,
Storage e Studio locais, sem custo e sem tocar em dado de produção. Serviços não
usados pelo produto (Auth, Realtime, Edge Functions, analytics interno do
Supabase, pooler) foram desativados no `config.toml` para reduzir containers e
tempo de start; a política de arquitetura proporcional (`docs/0003`) se aplica
também aqui.

Em vez de comparar `DATABASE_URL`/hostname (frágil, D-anti-pattern citado pela
task), foi criada uma variável explícita `APP_ENV` (`local` | `production` |
`test`, padrão `local`) em `src/lib/appEnv.ts`:
- `assertNotAccidentalProduction()` — chamada em `lib/db.ts` e
  `server/storage/index.ts` — bloqueia com erro claro se `APP_ENV=production`
  rodar sob um processo com `NODE_ENV != "production"` (ou seja, `next dev`
  usando por engano credenciais de produção). Nunca bloqueia produção
  legítima (`NODE_ENV=production` real).
- `assertPrismaCliAllowed()` — chamada em `prisma.config.ts` para todo
  comando do Prisma CLI **exceto `generate`** (checado via `process.argv[2]`
  — `generate` só lê `schema.prisma` e nunca toca o banco, e roda sozinho a
  cada `npm install` via `postinstall`, inclusive na Vercel; exigir
  confirmação ali quebraria todo deploy). Para os demais comandos, exige a
  confirmação explícita adicional `ALLOW_PRISMA_CLI_PRODUCTION=true` sempre
  que `APP_ENV=production`. Isso cobre exatamente o caso que a task pede
  para evitar: `prisma migrate dev`/`db push`/`studio` rodando sem querer
  contra o banco remoto. Em produção
  (Vercel), o passo de build define as duas variáveis só para o comando
  `prisma migrate deploy`.

Testado em `src/lib/appEnv.test.ts` (9 casos): não bloqueia com `APP_ENV=local`
independentemente de `NODE_ENV`; bloqueia a combinação perigosa; não bloqueia
produção real; CLI liberado com a confirmação explícita.

## D50 — Uma única fonte de verdade para o schema: Prisma, não o Supabase CLI
O Supabase CLI tem seu próprio mecanismo de migration (`supabase/migrations/*.sql`
+ tabela `supabase_migrations.schema_migrations`), independente do Prisma
(`prisma/migrations/*` + `_prisma_migrations`). Manter os dois seria exatamente
o "dois históricos divergentes" que a task proíbe. Decisão: **o Prisma continua
sendo a única fonte de verdade do schema** (como já valia para o projeto remoto
desde D29). O Supabase CLI local só orquestra os containers (Postgres, Storage,
Studio) — `supabase/config.toml` desativa o seed SQL do CLI
(`db.seed.enabled = false`) e não populamos `supabase/migrations/`.

Fluxo de recriação local: `npm run supabase:reset` (recria o Postgres vazio,
inclusive apagando os buckets) → `npm run db:migrate` (aplica as migrations do
Prisma) → `npm run storage:setup` (recria o bucket) → `npm run db:seed` (dados
fictícios). Validado de ponta a ponta nesta fase: reset completo seguido do
ciclo acima e de `RUN_DB_TESTS=true npm test` (117/117 passando, incluindo os 7
testes de integração contra o Postgres local).

## D51 — `supabase` como devDependency, não instalação global
Adicionado `supabase@2.109.1` em `devDependencies` (recomendação oficial do
projeto Supabase) em vez de depender de instalação global ou de `npx` sempre
buscando a versão mais recente — fixa a versão do CLI no `package-lock.json`,
reproduzível entre máquinas. Scripts novos: `supabase:start`, `supabase:stop`,
`supabase:status`, `supabase:reset`.

## D52 — Backup local das credenciais remotas fora da convenção de autoload do Next
As credenciais do projeto remoto (antes em `.env.local`) foram preservadas em
`.env.production.reference` — deliberadamente **fora** do padrão
`.env.production.local` que o Next.js autocarrega em qualquer `next build`/
`next start` local (`NODE_ENV=production`). Se o arquivo se chamasse
`.env.production.local`, rodar o build de produção localmente por engano
apontaria de verdade para o banco remoto. `.env.production.reference` só é
usado manualmente (colar no painel da Vercel, ou carregado explicitamente).
`.env.local` passou a ser 100% local (Supabase via Docker).

## D53 — `.env.example` reorganizado e versionado
`.gitignore` ganhou `!.env.example` (só essa exceção ao padrão `.env*`). O
arquivo foi reorganizado por categoria (aplicação, banco, Supabase, storage,
YouTube, pagamento mock, e-mail mock, Sentry, analytics) e os valores padrão
passaram a ser os do Supabase **local** — incluindo a chave `service_role` de
demonstração do Supabase CLI, que é pública/fixa em qualquer instalação local
(documentada pelo próprio Supabase, não é secreta) e permite que
`cp .env.example .env.local && npx supabase start` funcione sem editar nada.

## D54 — `NEXT_PUBLIC_APP_URL` removida; `NEXT_PUBLIC_SITE_URL` validada em produção
As duas variáveis tinham a mesma responsabilidade (montar a URL pública da
carta) com fallbacks diferentes: `site.url` (`NEXT_PUBLIC_SITE_URL`) caía para
o domínio real se ausente; `NEXT_PUBLIC_APP_URL` (só usada em
`app/c/[slug]/page.tsx`, para o botão de WhatsApp da própria carta) caía para
`http://localhost:3000`. Configurar só a primeira em produção deixaria o
compartilhamento da carta apontando para `localhost`. Consolidado numa única
variável (`NEXT_PUBLIC_SITE_URL`) e num único ponto de montagem
(`src/lib/publicUrl.ts#buildPublicCartUrl`), usado tanto pelo e-mail/QR Code
(`orderService.ts`) quanto pelo compartilhamento na carta pública.

Adicionada validação em `src/config/site.ts`: em produção, rejeita URL vazia,
malformada, protocolo não-https e hosts localhost/loopback — um QR Code
gerado com URL errada é irrecuperável depois de impresso/enviado (task 011,
seção 8.3–8.4). A validação usa `APP_ENV` (D49), **não** `NODE_ENV`: como
`npm run build`/`npm start` sempre definem `NODE_ENV=production` (mesmo
localmente), usar `NODE_ENV` quebraria um build local de verificação
apontando para `localhost`. Confirmado nesta fase: build local com
`APP_ENV=production` e URL localhost falha com mensagem clara; com a URL real
(`https://cartas.anterosistemas.com.br`), o mesmo build passa. Testado em
`src/config/site.test.ts` e `src/lib/publicUrl.test.ts`.

## D55 — Vercel Web Analytics, com máscara obrigatória de URL privada
Escolhido o Vercel Web Analytics como destino dos eventos (task 011, seção
9.2). Critérios: gratuito no plano Hobby (50 mil eventos/mês), **sem cookie**
(o visitante é identificado por um hash da requisição, descartado em 24h),
sem credencial nova para gerenciar, e o script é servido pela **própria
origem** (`/_vercel/insights/…`) — o que evita abrir um domínio a mais na CSP.
Alternativas descartadas: Plausible e Simple Analytics são pagos; GoatCounter
tem plano gratuito só para uso não comercial; Umami exigiria hospedar mais um
serviço (fora do escopo) ou uma conta e credencial externas.

**Risco tratado:** o Web Analytics registra a **URL completa** de cada
pageview, e este produto tem identificador privado no caminho — `/c/<slug>` é
o link exclusivo da carta. Sem tratamento, o link privado sairia do navegador
para um terceiro. `beforeSend` (em `src/components/analytics/WebAnalytics.tsx`)
mascara `/c/`, `/pedido/` e `/checkout/` e descarta query string e fragmento
antes do envio. As propriedades de evento passam por
`sanitizeAnalyticsProps`, que filtra por nome de chave (nome, e-mail, CPF,
telefone, título, mensagem, token, slug, URL) e por formato de valor.

**Limitação aceita conscientemente:** eventos personalizados exigem plano Pro
— no Hobby só o pageview é coletado. Como contratar plano pago está fora do
escopo, o encaminhamento dos ~25 `track()` do produto fica atrás de
`NEXT_PUBLIC_ANALYTICS_CUSTOM_EVENTS_ENABLED`, desligado por padrão. O adapter
está pronto: ligar a variável basta, sem tocar em nenhum ponto de chamada.

## D56 — Sentry opcional, com remoção por padrão em vez de lista de bloqueio
A integração (`instrumentation.ts`, `instrumentation-client.ts`) só chama
`init` quando existe DSN. Sem DSN nada é enviado e a aplicação funciona igual
— é o que permite rodar local, em CI e em produção antes de existir a conta,
sem `try/catch` espalhado pelo código.

A sanitização (`src/lib/sentryPrivacy.ts`) **remove por padrão** em vez de
tentar listar o que é perigoso: o corpo da requisição é descartado inteiro
(é por onde a carta viaja — título, mensagem, assinatura — e por onde vão nome,
e-mail e telefone do comprador); cookies e query string são descartados; dos
cabeçalhos só sobrevive uma lista curta de permitidos (`authorization` e
`x-cart-edit-token` caem aqui); e em texto livre (mensagem, exceção,
breadcrumb) e-mail, CPF, telefone, bearer e token longo são substituídos.
`user` e `extra` são removidos; `contexts` é preservado porque o SDK o
preenche com navegador/SO/runtime, que ajuda a diagnosticar sem identificar
ninguém.

Session Replay é filtrado na inicialização: gravaria a tela de criação, isto
é, o texto da carta sendo digitado — nenhuma máscara daria garantia
suficiente. `tracesSampleRate` fica em 0 (a cota gratuita é pequena e nesta
fase só erro interessa) e o upload de source map fica desligado (exigiria
`SENTRY_AUTH_TOKEN`, que não temos e não é necessário para receber erros).

## D57 — CSP com `'unsafe-inline'` em script-src, e por quê
A CSP (`src/config/securityHeaders.ts`) foi montada a partir dos domínios
levantados no código, não por suposição: Supabase Storage (origem derivada de
`SUPABASE_URL`) para as fotos, `i.ytimg.com` para a miniatura,
`www.youtube.com` no `frame-src` para o player, `data:` para o QR Code,
`blob:` para o preview antes do envio, e o host do DSN no `connect-src` quando
o Sentry estiver configurado. Nenhuma diretiva usa `*` nem `https:`.

`script-src` inclui `'unsafe-inline'`. É concessão consciente: o App Router
injeta script inline com os dados de hidratação em toda página, e a única
alternativa suportada é nonce por requisição, que exige middleware e tornaria
**dinâmica toda rota** — inclusive a landing e a `/demonstracao`, hoje
estáticas. Trocar a performance da porta de entrada do produto por essa
diretiva não se justifica com o risco atual: não há login, não há sessão
privilegiada e nenhum conteúdo de terceiro é renderizado como HTML (o texto da
carta é renderizado como texto, e o único embed é o iframe do YouTube, com
origem fixa). Reavaliar se a Fase 3 introduzir área autenticada.

HSTS só em produção e **sem `preload`**: preload é praticamente irreversível e
decidiria pelo domínio inteiro (`anterosistemas.com.br`), não só por este
subdomínio. A chave do ambiente é `APP_ENV`, não `NODE_ENV`, pelo mesmo motivo
de D49/D54.

## D58 — Sitemap só com rota pública indexável
`src/app/sitemap.ts` lista apenas `/`, `/criar` e `/demonstracao`. Ficam de
fora `/c/[slug]`, `/pedido/*` e `/checkout/*` (o link da carta é privado e já
está bloqueado em `robots.ts`) e também `/privacidade` e `/termos`, que
declaram `robots: { index: false }` nas próprias páginas — listá-las
contradiria a marcação. A montagem foi extraída em `buildSitemap` para ser
testável sem depender do ambiente.

A imagem Open Graph é gerada por código (`next/og`) em vez de um PNG
versionado, para acompanhar automaticamente o nome e a tagline de
`src/config/site.ts`. O envelope é desenhado em SVG: o truque de triângulo com
`border` do CSS não é suportado pelo renderizador do `next/og` e saía como um
retângulo cheio. Nenhum dado de usuário é renderizado na imagem — ela é
pública e cacheada por terceiros.

## D59 — `/api/dev/*` responde 404 em produção, não 403/409
Encontrado no smoke test de produção desta fase: `GET /api/dev/emails` já era
bloqueado (nenhum dado vazava), mas respondia 409 com "Indisponível em
produção" — o que confirma a um visitante que o visualizador de e-mails existe
e só está desligado. Passou a responder 404, como se a rota não existisse.

O mapeamento compartilhado de `forbidden_state` **não** foi alterado: ele é
usado por estados legítimos de negócio (carta não editável, carta já
processada), onde 409 está correto. Fora de produção, `DEV_EMAILS_ENABLED=false`
continua devolvendo 409 com mensagem útil — quem lê isso é o desenvolvedor.

---

# Fase 3 — Venda real (task 013)

## D60 — Webhook como única fonte de verdade, idempotência por `PaymentEvent`
O retorno do navegador, a query string, o redirecionamento e o polling do
front nunca aprovam um pagamento — só `applyMercadoPagoWebhook`
(`src/server/orderService.ts`), chamado pela rota `/api/webhooks/mercadopago`
depois da assinatura validada. Idempotência por `(provider, providerEventId)`
— o `id` da notificação em si, não o id do pagamento, porque o mesmo
pagamento pode gerar várias notificações ao longo do tempo (criado,
atualizado). Inserir de novo o mesmo evento falha por constraint única e a
rota responde 200 sem reprocessar, sem precisar de uma tabela de lock à
parte. O modelo não guarda dado do pagador — só o necessário para decidir e
auditar (`providerPaymentId`, `rawStatus`, `orderId`).

## D61 — Mapeamento de estado com regra explícita contra "fora de ordem"
`mercadoPagoStatus.ts` centraliza a tradução do vocabulário do Mercado Pago
(`approved`, `rejected`, `cancelled` + `status_detail`, `refunded`,
`charged_back`) para o enum interno — nenhuma outra parte do domínio conhece
essas strings. `shouldApplyTransition` só permite avançar (de `PENDING` para
qualquer estado; de `PAID` só para `REFUNDED`/`CHARGED_BACK`) — uma
notificação atrasada de `pending` chegando depois de `approved` já
processado é ignorada, não reabre o pedido. Status desconhecido/futuro do
Mercado Pago cai em `PENDING` por padrão, nunca em `PAID` — mais seguro errar
para "ainda não confirmado" do que publicar por engano.

Além disso, o webhook compara o `providerPaymentId` da notificação com o
salvo no pedido: se não bater, é uma tentativa já superada (ex.: 2º cartão
depois do 1º ser recusado) e é ignorada sem tocar no estado — evita que uma
notificação atrasada da tentativa antiga sobrescreva o resultado da nova.

## D62 — Retry de cartão reaproveita o mesmo pedido; resposta síncrona nunca publica
Ao contrário do Pix (uma cobrança por pedido), cartão pode ser tentado várias
vezes no mesmo pedido (`createCardPaymentAttempt`): cada tentativa sobrescreve
`providerPaymentId`/`paymentMethod` e o pedido volta para `PENDING` — sem
criar uma segunda linha de `Order` por tentativa, mantendo o esquema simples.
A resposta síncrona do Mercado Pago (`approved`/`rejected`/`in_process`) é
usada só para feedback imediato ao comprador ("recusado, tente outro
cartão"); a publicação em si espera sempre o webhook, mesmo quando a resposta
síncrona já diz "aprovado" — ver task 013, seção 9.

## D63 — Pix sem proteção contra clique duplo (limitação aceita)
`createPixPaymentAttempt` não impede uma segunda chamada para o mesmo
pedido — um duplo clique criaria uma segunda cobrança Pix no Mercado Pago, e
se o comprador pagasse a primeira exatamente nesse intervalo, a checagem de
"tentativa superada" (D61) descartaria a notificação dela. Risco considerado
desprezível na prática (a janela é de milissegundos; Pix leva segundos para
confirmar) e mitigado no front (botão desabilitado durante a criação). Não
implementada solução mais robusta (buscar/reaproveitar o Pix em aberto) por
não haver evidência de necessidade — revisitar se acontecer de verdade.

## D64 — Payment Brick via `<script>`, não dependência do projeto
Tokenização seguro de cartão exige o SDK do navegador do Mercado Pago
(`https://sdk.mercadopago.com/js/v2`) — não há como reimplementar isso com
segurança. Carregado por tag `<script>` sob demanda (mesma lógica do iframe
do YouTube), não como pacote npm: número/CVV nunca chegam a este código nem
ao servidor, só o token que o próprio SDK gera. `securityHeaders.ts` só
libera `*.mercadopago.com`/`*.mlstatic.com` quando `PAYMENT_MODE=real` —
domínios confirmados contra exemplos reais do Mercado Pago, não supostos, e
ausentes da CSP em modo mock (nada do Brick é carregado, nada precisa ser
permitido).

## D65 — Template de e-mail único, compartilhado entre mock e Resend
`src/server/email/render.ts` extrai a montagem do e-mail (antes só dentro do
mock) para um módulo puro reusado pelos dois providers — impede que o
conteúdo real divirja silenciosamente do que é visto em desenvolvimento via
`/api/dev/emails`. Adicionado o que a task 013 (seção 12) pede e o template
da Fase 2 não tinha: link de suporte por WhatsApp e aviso explícito para
guardar o link. `RealEmailProvider` (Resend) segue a mesma disciplina de
D40/D-mercadopago: sem SDK, só `fetch` num único endpoint
(`POST /emails`), porque a superfície usada é pequena e estável.

## D66 — Rate limit estendido às rotas de pedido/pagamento
O limitador em memória (`lib/rateLimit.ts`, já usado na busca do YouTube)
passou a valer também para `POST /api/orders` e as duas rotas de tentativa de
pagamento — as três rotas de escrita com efeito financeiro real. Mesma
limitação de sempre: por instância, não compartilhado entre instâncias
serverless (Redis fica fora do escopo, task 013 seção 20). O webhook não
recebe rate limit por IP — sua proteção é a assinatura (D60/D61), e limitar
por IP arriscaria descartar notificações legítimas do Mercado Pago.
