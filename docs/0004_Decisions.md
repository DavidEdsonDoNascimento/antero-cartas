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
