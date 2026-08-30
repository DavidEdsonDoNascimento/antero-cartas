# Task 015 — Limpeza de fotos após a expiração da cartinha

| Campo | Valor |
|---|---|
| **Status** | `DEFERRED` |
| **Prioridade** | `MÉDIA` |
| **Motivo do adiamento** | Nenhuma cartinha nova do plano Essencial atingirá 365 dias no curto prazo |
| **Decisão de produto** | Apagar as fotos **15 dias após a expiração**; preservar histórico financeiro e o registro da cartinha |
| **Última revisão** | 2026-08-30 |
| **Base analisada** | `master` @ `20c67c6` |

Handoff autossuficiente. As referências citam **funções e modelos**, não
apenas linhas — números de linha mudam.

---

## 1. Por que foi adiado

A regra de expiração **já funciona** para o que importa ao cliente: uma
cartinha do Essencial deixa de ser servida publicamente depois de 365 dias. O
que não existe é a faxina posterior — e ela só passa a ter efeito prático
quando as primeiras cartinhas do Essencial se aproximarem de um ano de vida.
Até lá, não há nada para limpar.

O custo de adiar é conhecido e cresce devagar: armazenamento acumulado e, mais
relevante, **fotos que continuam publicamente acessíveis** depois que o cliente
acredita que a cartinha "acabou".

---

## 2. Comportamento atual

Fatos confirmados por leitura do código em `20c67c6`.

### Expiração

- **Essencial (`LIMITED`) expira em `paidAt + 365 dias`.** O cálculo é
  `computeExpiresAt` (`src/lib/expiry.ts`), com a duração vindo de
  `PLAN_LIMITED_DURATION_DAYS` (`src/config/plans.ts`), materializada em
  `Cart.expiresAt` no momento da publicação.
- **Para Sempre (`PERMANENT`) usa `expiresAt = NULL`.** A ausência de
  expiração é a ausência de data, não uma flag — `isExpired(null)` é sempre
  `false`.
- **O acesso público da cartinha expirada já é bloqueado.** `getPublicCart`
  (`src/server/cartService.ts`) verifica `isExpired` a cada requisição e
  devolve o estado `expired`. Não há cache de rota envolvido.

### O que a expiração **não** faz

- **`Cart.status` permanece `PUBLISHED`.** O valor `EXPIRED` existe no enum
  `CartStatus` desde a migration inicial e **nenhuma linha de código o
  escreve** — é código morto hoje.
- **As fotos continuam públicas por URL direta.** Em produção o Storage é um
  bucket público do Supabase, servido diretamente pela URL do objeto
  (`src/server/storage/supabaseStorage.ts`). A aplicação não intermedeia essa
  leitura. Quem tiver a URL de uma foto continua acessando indefinidamente,
  mesmo depois de a cartinha expirar. É uma questão de **privacidade**, não só
  de custo.
- **Não existe cron, worker ou rotina de limpeza.** Não há `vercel.json` no
  repositório, nem rota de cron, nem fila, nem script de expiração. A
  expiração é puramente preguiçosa, avaliada na leitura.

---

## 3. Regras que a implementação deve respeitar

- **Registros de pedidos não devem ser excluídos.** `Order` é o histórico
  financeiro.
- **A `Cart` não deve ser excluída.** Além do valor de auditoria, há um motivo
  técnico: em `prisma/schema.prisma`, a relação `Order.cart` **não** tem
  `onDelete: Cascade` (diferente de `CartMedia`). Apagar uma `Cart` com pedido
  pago falharia por constraint — e forçar a cascata destruiria o registro
  financeiro.
- **As fotos devem ser removidas pela API do Storage, nunca apenas por SQL.**
  Apagar as linhas de `CartMedia` sem chamar o Storage deixa os arquivos
  órfãos no bucket, ainda públicos — exatamente o problema que a tarefa existe
  para resolver. Usar `delete(key)` da interface `StorageProvider`.
- **As linhas correspondentes de `CartMedia` devem ser removidas** depois que
  o objeto sair do Storage.
- **Considerar marcar a cartinha como `EXPIRED`**, dando finalmente uso ao
  valor de enum já existente. Isso torna o estado consultável, mas atenção:
  hoje `getPublicCart` devolve `not_found` para qualquer status diferente de
  `PUBLISHED`, então marcar `EXPIRED` sem ajustar essa função mudaria a
  mensagem vista pelo destinatário de "esta cartinha expirou" para "não
  encontrada". Se a marcação entrar, `getPublicCart` deve tratar `EXPIRED`
  explicitamente.
- **Carência: 15 dias após `expiresAt`.** Só entram na limpeza cartinhas com
  `expiresAt < agora - 15 dias`.
- **Rotina diária é suficiente.** Não há necessidade de reagir em tempo real.
- **A execução deve ser idempotente.** Rodar duas vezes no mesmo dia, ou
  reprocessar uma cartinha já limpa, não pode falhar nem duplicar efeito.
- **Falha ao apagar no Storage não pode eliminar antes a referência
  necessária para nova tentativa.** A ordem importa: primeiro o objeto no
  Storage, só depois a linha de `CartMedia` que guarda a `storageKey`. Se o
  Storage falhar, a linha precisa sobreviver para que a próxima execução tente
  de novo. (Note que isso é o **oposto** da ordem usada na remoção manual de
  foto pelo usuário, que é best-effort e aceita órfão — aqui não podemos
  aceitar.)
- **O job deve ignorar `PERMANENT`.** Cartinhas com `expiresAt IS NULL` nunca
  entram na seleção. Um erro aqui apagaria as fotos de quem pagou justamente
  para não perdê-las.
- **Sem necessidade atual de migration.** `CartStatus.EXPIRED` já existe no
  enum. Só passaria a ser necessária se, no futuro, se decidir por um campo de
  auditoria (por exemplo, registrar quando a limpeza ocorreu).

---

## 4. Gatilho de retomada

Retomar quando ocorrer **o primeiro** destes eventos:

1. **Antes que a primeira cartinha do plano Essencial se aproxime dos 365
   dias.** Este é o prazo natural — convém acompanhar a data de publicação da
   cartinha paga mais antiga.
2. **Antecipar se custo de Storage, privacidade ou volume se tornarem
   relevantes** — por exemplo, ao crescer o número de cartinhas com fotos, ou
   diante de qualquer questionamento sobre retenção de imagens.

---

## 5. Critérios de aceite futuros

- A seleção inclui **somente** cartinhas com `expiresAt` **não nulo** e
  anterior a `agora - 15 dias`.
- Cartinhas `PERMANENT` (`expiresAt IS NULL`) **nunca** são selecionadas.
- Cartinhas expiradas **dentro** da carência não são tocadas.
- Após a execução: os objetos saíram do Storage e as linhas de `CartMedia`
  correspondentes não existem mais.
- **A `Cart` continua existindo** e **os `Order` continuam intactos**.
- Se a marcação de status entrar no escopo: `Cart.status` passa a `EXPIRED` e
  `getPublicCart` continua devolvendo `expired` (não `not_found`) para essa
  cartinha.
- Uma falha do Storage **preserva** a linha de `CartMedia`, e a execução
  seguinte conclui a remoção.
- Rodar o job duas vezes seguidas não falha nem produz efeito diferente.
- O acionamento é protegido por segredo — uma requisição sem credencial válida
  é recusada.

### Testes necessários

- Seleção: expirada além da carência entra; expirada dentro da carência não
  entra; `PERMANENT` nunca entra; cartinha nunca publicada não entra.
- Integração: após o job, Storage e `CartMedia` limpos, `Cart` e `Order`
  preservados.
- Idempotência: segunda execução sobre a mesma cartinha não quebra.
- Falha do Storage: linha de `CartMedia` preservada e retomada bem-sucedida na
  execução seguinte.
- Autorização: acionamento sem segredo válido é recusado.
- Se houver marcação de status: `getPublicCart` de uma cartinha já limpa
  devolve `expired`.

---

## 6. Arquivos provavelmente envolvidos

| Assunto | Arquivo | Observação |
|---|---|---|
| Rotina de limpeza | novo, em `src/server/` | seleção + remoção, testável sem HTTP |
| Acionamento agendado | nova rota de cron em `src/app/api/` | protegida por segredo |
| Agendamento | novo `vercel.json` | **não existe hoje** no repositório |
| Seleção e tratamento de `EXPIRED` | `src/server/cartService.ts` | `getPublicCart` |
| Remoção no Storage | `src/server/storage/` | `StorageProvider.delete` |
| Modelos e enum | `prisma/schema.prisma` | `Cart`, `CartMedia`, `CartStatus.EXPIRED` |
| Variáveis novas | `.env.example` | segredo do cron e, se configurável, a carência |

---

## 7. Distinção importante

Três operações diferentes, deliberadamente separadas:

| Operação | O que faz | Reversível | Existe hoje |
|---|---|---|---|
| **Expirar / bloquear acesso** | `getPublicCart` devolve `expired`; registro e arquivos intactos | Sim | **Sim, funciona** |
| **Excluir fotos do Storage** | remove o objeto do bucket e a linha de `CartMedia` | **Não** | Não — é o escopo desta tarefa |
| **Excluir o registro da cartinha** | `DELETE` na `Cart` | **Não** | Não — e **não deve ser feito** (seção 3) |

Esta tarefa trata **apenas da segunda**.
