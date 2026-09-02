# Task 016 — Revisão visual V1

| Campo | Valor |
|---|---|
| **Status** | `IN_PROGRESS` |
| **Prioridade** | `ALTA` (contém subtarefa crítica de acessibilidade já resolvida — ver PR 1) |
| **Origem** | Auditoria visual completa (investigação, sem código) registrada em `claude-reports/latest.md` na sessão de 2026-09-01 |
| **Última revisão** | 2026-09-01 — PR 1 mergeado (`#5`); ajuste antecipado do FAB "Ver preview" na branch `fix/mobile-preview-fab-overlap` |
| **Base analisada** | `master` @ `142b90f` |

Documento guarda-chuva da fase visual do produto. Não é um handoff de uma
única pendência técnica (como as tarefas 014/015) — é o roteiro de uma série
de PRs pequenos, cada um independente e visualmente verificável, que juntos
executam a auditoria. **Um arquivo por PR não seria proporcional aqui**: o
roteiro inteiro precisa ser lido em conjunto para as dependências entre PRs
fazerem sentido.

## Objetivo do produto

O Antero Cartas deve transmitir romantismo, carinho, emoção, simplicidade e
confiança para pagar, com aparência profissional e sensação de produto
especial — sem parecer infantil ou exageradamente rosa. O objetivo comercial
da V1 é aumentar confiança e conversão sem criar um redesign complexo ou
difícil de manter.

## Diagnóstico (resumo)

Não existe um design system real: existem tokens de cor em `globals.css` e,
por cima, ~200 decisões visuais improvisadas nas classes de cada componente.
A auditoria mediu 125 pares de contraste nas telas públicas e na paleta
compartilhada; 73 falhavam WCAG AA antes do PR 1. Direção recomendada:
**"Papel & Tinta"** — romantismo por materialidade (papel, tinta, selo), não
por saturação de rosa. Detalhes completos, com três direções comparadas,
ficam em `claude-reports/latest.md` (não versionado — se precisar
recuperá-lo, rode a auditoria de novo ou peça o arquivo).

## Checklist de PRs

Ordem de dependência: 1-3 são independentes entre si; 4 é a fundação que
5-8 exigem mergeada antes de começar (evita conflito massivo); 9 fecha o
ciclo.

- [x] **PR 1 — Correções críticas de contraste e acessibilidade dos temas
      públicos.** `DONE` (mergeado em `master` via PR `#5`).
      Corrigiu as 29 falhas de contraste dos 4 temas (Delicado chegava a
      1,08:1 no botão "Abrir minha carta"), o indicador de foco global
      (falhava contra metade das superfícies do site) e o `font-script` que
      nunca surtia efeito no título da carta (regra CSS fora de `@layer`
      vencia a utility do Tailwind v4). Ver seção "PR 1 — detalhes" abaixo.
- [x] **Ajuste antecipado — FAB "Ver preview" cobrindo o CTA final no
      mobile.** `DONE` (branch `fix/mobile-preview-fab-overlap`). Puxado para
      fora da ordem porque a sobreposição podia impedir a conclusão da
      cartinha (o CTA final ficava parcialmente coberto e clicável só na
      metade de cima) — risco direto de conversão, não dava para esperar o
      PR 4. Escopo mínimo: reserva de espaço real no fim da jornada, derivada
      da geometria do botão. Ver seção "Ajuste antecipado — FAB" abaixo. O
      resto do que o PR 6 tem para esse botão (focus trap / Escape do drawer
      de preview e do modal de inspiração) **continua no PR 6**.
- [ ] **PR 2 — Correção do salto de layout do `demoCart`.** `PENDING`.
      Abrir o demo da landing desloca o `h1` do hero em 296px no desktop
      (`items-center` recentra a linha do grid quando a coluna do demo
      cresce ~592px) e tira o CTA principal da dobra.
- [ ] **PR 3 — Melhorias localizadas da música em Extras.** `PENDING`.
      Separar clara e explicitamente "Selecionar" / "Ouvir prévia" / "Ver no
      YouTube" nos resultados de busca — hoje a prévia só existe DEPOIS de
      selecionar, então a escolha é feita às cegas.
- [ ] **PR 4 — Fundação visual compartilhada.** `PENDING`. Tokens de cor de
      texto (fim da escala de opacidade improvisada), tipografia, botões,
      inputs, cards, espaçamento. Bloqueia os PRs 5-8.
- [ ] **PR 5 — Landing.** `PENDING`. Depende do PR 4.
- [ ] **PR 6 — Jornada de criação.** `PENDING`. Depende do PR 4. Inclui o
      FAB "Ver preview" que hoje cobre o CTA "Finalizar minha cartinha" no
      mobile, e os dois overlays sem focus trap/Escape (modal de inspiração
      e drawer de preview).
- [ ] **PR 7 — Checkout e estados finais.** `PENDING`. Depende do PR 4.
      Risco alto (pagamento) — sem alterar lógica de pedido, idempotência,
      polling ou webhook; só apresentação.
- [ ] **PR 8 — Tela "Você tem uma cartinha em andamento".** `PENDING`.
      Depende dos PRs 4 e 6.
- [ ] **PR 9 — Revisão final de responsividade e acessibilidade.** `PENDING`.
      Depende de todos os anteriores; consolida os scripts de contraste desta
      auditoria como teste de regressão permanente.

## PR 1 — detalhes (concluído)

**Escopo realizado**, restrito exatamente ao combinado (nenhuma mudança em
landing, criação, checkout, fontes, dependências, textos ou jornada):

- `src/content/themes.ts` — `ThemeConfig` ganhou cinco campos derivados
  (`onEnvelope`, `onEnvelopeMuted`, `onAccent`, `accentOnCard`, `inkMuted`),
  cada um validado contra o par real em que é usado, em vez de reaproveitar
  `envelopeBg`/`accent`/opacidade de `ink` como cor de texto (causa raiz das
  falhas). Único valor de marca alterado: `accent` do tema **Delicado**
  (`#c98aa0` → `#7a3549`) — o `envelopeBg` claro (`#d98c9f`) que dá a
  identidade "rosa suave" ao tema foi mantido.
- `src/components/card/CardExperience.tsx` — kicker, nome do destinatário,
  selo e botão "Abrir minha carta" passam a usar os campos derivados; a aba
  do envelope foi recalculada (82%→50% de mistura) para atingir ≥3:1 contra
  o corpo; o véu do player de música virou um preto fixo (`bg-black/55`, não
  mais relativo ao `envelopeBg`) para funcionar igual em temas com envelope
  claro ou escuro.
- `src/components/card/CardPreview.tsx` — ornamento, divisor, linha
  "Para X", contador e assinatura trocaram opacidade solta por `inkMuted`/
  `accentOnCard`.
- `src/components/card/PhotoCarousel.tsx` — indicadores do carrossel: cor
  ativa/inativa via tokens do tema (não mais `color-mix` com `currentColor`
  arbitrário) e alvo de toque de cada indicador ampliado para 24×24px
  (WCAG 2.2 SC 2.5.8) mantendo o ponto visual pequeno.
- `src/app/globals.css` — indicador de foco trocado por um halo de duas
  cores (anel branco + anel `--color-vinho-deep`), porque nenhuma cor única
  atinge 3:1 contra fundos claros e escuros ao mesmo tempo; e a regra de
  título (`h1-h4`) movida para `@layer base`, resolvendo o `font-script`
  sem `!important` — a cascata de camadas do Tailwind v4 já resolve isso
  (utilities é declarada depois de base).
- `src/lib/contrast.ts` (novo) + `src/lib/contrast.test.ts` (novo) —
  utilitário puro de contraste WCAG (luminância relativa, `over()` para
  simular opacidade, `contrastRatio`), reaproveitável fora desta auditoria.
- `src/content/themes.test.ts` (novo) — 80 verificações automatizadas, uma
  por par semântico real renderizado nos componentes acima (não os campos
  crus do tema isolados), nos 4 temas. Falha o CI se um tema novo ou um
  campo editado sozinho quebrar um par.

**Validação executada:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (453
passando, 0 quebrado), `pnpm build` — todos limpos. Auditoria de contraste
dos 4 temas: **84 de 84 pares OK** (era 55 de 84 antes). Os 4 temas foram
inspecionados de verdade (não só matematicamente) via `/demonstracao`, 390px
e 1440px, fechado e aberto, incluindo navegação só por teclado até o botão
"Abrir minha carta" — capturas ficaram fora do repositório (scratchpad da
sessão), não foram commitadas.

**Fora do escopo do PR 1** (fica para PRs seguintes): o botão
"Compartilhar no WhatsApp" (`#25D366`, 1,98:1) — está em `CardExperience.tsx`
mas é uma cor fixa e igual em todos os temas, agrupada com o mesmo botão em
`OrderSuccessClient.tsx` no PR 7; a duplicação semântica de rótulo entre o
envelope e o botão "Abrir minha carta" (dois controles com o mesmo
`aria-label`) — observação da auditoria, não falha WCAG.

## Ajuste antecipado — FAB "Ver preview" (concluído)

Branch `fix/mobile-preview-fab-overlap`, base `master` @ `0712a71` (pós-merge
do PR 1). Fora da ordem do roteiro porque bloqueava conversão — não dependia
do PR 4 e não podia esperar.

**Causa raiz.** O botão "Ver preview" (`CreateFlow.tsx`) é
`position: fixed; bottom: 1rem`, visível abaixo de `lg` (`lg:hidden`). Sendo
`fixed`, ele não ocupa espaço no fluxo: nada empurra o conteúdo para longe
dele. O container da jornada só tinha `py-8` (32px) de padding inferior no
mobile. O botão ocupa a faixa de 16px a 60px acima da borda inferior da
viewport (1rem de recuo + 44px de altura). Quando a página chega ao fim, a
última linha do formulário — a barra "← Voltar" / "Próxima etapa →" (ou
"Finalizar minha cartinha" na etapa 4) — para a 32px da borda, ou seja
**dentro** da faixa do botão, e o botão (fixo, pintado acima do conteúdo
estático) cobre os ~7,5px de baixo do CTA e boa parte da largura dele.
Reproduzido em 360×800, 390×844 e 390×667 nas **etapas 1 a 4** (a tela de
planos não sobrepõe: o CTA ali é centralizado e a caixa de aviso do modo
demonstração já afasta o suficiente).

**Correção (mínima, sem número mágico solto).** Duas variáveis em
`globals.css` (`:root`), cada termo derivado da geometria real do botão:

- `--preview-fab-inset: calc(1rem + env(safe-area-inset-bottom, 0px))` —
  recuo do botão em relação à borda inferior. Passa a posicionar o próprio
  botão também (`bottom-4` → `bottom-[var(--preview-fab-inset)]`), então
  botão e reserva nunca divergem.
- `--preview-fab-reserve: calc(var(--preview-fab-inset) + 2.75rem + 1rem)` —
  recuo + **altura do botão** (`py-3` = 2 × 0.75rem, mais o line-height do
  `text-sm` = 1.25rem → 2.75rem = 44px, confere com o rect medido) +
  **1rem de respiro**. Dá 76px hoje (a área segura vale 0px sem
  `viewport-fit=cover`; entra sozinha no cálculo se o site adotar depois).

`CreateFlow.tsx`: o container passou de `py-8` para
`pt-8 pb-[var(--preview-fab-reserve)]`; `lg:py-12` continua vencendo em
≥1024px (`padding-bottom` computado: 76px no mobile, 48px no desktop —
verificado), onde o botão nem existe. O respiro visível entre o CTA e o
botão fica em ~36px porque o `p-5` do próprio card soma 20px — confortável,
não exagerado.

**Por que a reserva é essa e não maior.** Ela cobre exatamente a faixa
ocupada pelo botão (recuo + altura) mais um respiro de 1rem, tudo em `rem`
e `env()`, sem pixel cravado à toa. Se alguém mudar o `py`/`text-` do botão,
o termo `2.75rem` é o único ponto a rever, e está comentado no CSS.

**Teste de regressão.** `src/components/create/previewFabSpacing.test.ts` (3
asserts). O ambiente de teste (node/jsdom) não faz layout — `calc()`/`env()`
não resolvem e `getBoundingClientRect` devolve zero —, então medir a
sobreposição de verdade ali só com medida falsa. O teste blinda a
**estrutura**: (a) `--preview-fab-reserve` deriva de `--preview-fab-inset`
e mantém os termos `2.75rem` e `env(safe-area-inset-bottom)`; (b) o
container usa `pb-[var(--preview-fab-reserve)]` e ainda reseta com
`lg:py-12`; (c) o FAB posiciona com `bottom-[var(--preview-fab-inset)]` e
segue `lg:hidden`. Remover a reserva, desacoplar as variáveis ou revelar o
botão no desktop quebra um assert.

**Acessibilidade.** O botão já era um `<button>` real: focável por teclado,
recebe o halo de foco de duas cores do PR 1, e a ordem de tabulação é
"Voltar" → CTA primário → "Ver preview" (o botão nunca intercepta o CTA).
Verificado por teclado no navegador headless.

**Fora do escopo — continua no PR 6.** O drawer de preview e o modal de
inspiração seguem sem focus trap / tecla Escape. Nada aqui mexeu nisso, na
jornada, no autosave, na criação da carta ou na navegação entre etapas.

**Validação.** `pnpm lint`, `pnpm typecheck`, `pnpm test` (456 passando, 0
quebrado — +3 do arquivo novo), `pnpm build` — todos limpos. Visual em
navegador headless (CDP, motor de layout real) nas viewports 360×800,
390×844, 390×667, 820×1180 e 1440×900, cobrindo etapas 1–4, tela de planos
e estado com conteúdo longo: **nenhuma sobreposição**, CTA final sempre
inteiro, e o botão livre do último elemento interativo de cada tela.
Capturas antes/depois no scratchpad da sessão (não versionadas, igual ao
PR 1).

## Gatilho de retomada dos próximos PRs

PR 1 mergeado. O ajuste antecipado do FAB "Ver preview" está na branch
`fix/mobile-preview-fab-overlap`, aguardando revisão/merge (não bloqueia os
demais PRs).

Próximo: PR 2 (salto do `demoCart`) ou PR 3 (música), independentes entre si
e do PR 4. Não iniciar os PRs 5-8 antes do PR 4 estar mergeado. Quando o
PR 6 começar, o FAB "Ver preview" já não tem mais o problema de sobreposição
— só falta o focus trap / Escape dos dois overlays.
