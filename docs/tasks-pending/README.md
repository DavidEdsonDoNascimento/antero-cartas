# Tarefas pendentes

Tarefas técnicas **conhecidas, analisadas e deliberadamente adiadas**. Cada
documento aqui é um handoff autossuficiente: descreve o comportamento atual,
por que foi adiado, o que fazer quando for retomado e como saber que ficou
pronto — sem exigir uma nova auditoria do zero nem acesso a relatórios
temporários.

Este diretório existe para que "adiar" seja uma decisão registrada, com
gatilho de retomada, e não algo que simplesmente se perde.

## Como usar

- **Uma tarefa por arquivo.** Nada de arquivo agregador com várias pendências.
- **Numeração contínua com `docs/tasks/`.** Aquele diretório vai até `013`, e
  os arquivos daqui seguem a partir de `014`. É proposital: quando uma tarefa
  é concluída, ela pode ser movida para `docs/tasks/` sem colidir com nada.
- **Ao concluir:** atualize o `Status` para `DONE`, registre o que foi feito e
  mova o documento para a estrutura já existente do projeto (normalmente
  `docs/tasks/`). Não há migração em massa dos documentos antigos prevista —
  a convergência acontece tarefa a tarefa, conforme cada uma é concluída.
- **Ao retomar:** mude o `Status` para `IN_PROGRESS` antes de começar.

## Campos de cada documento

| Campo | O que registra |
|---|---|
| **Status** | `PENDING`, `DEFERRED`, `IN_PROGRESS` ou `DONE` |
| **Prioridade** | `BAIXA`, `MÉDIA` ou `ALTA` |
| **Motivo do adiamento** | por que não foi feito agora — a decisão, não a desculpa |
| **Gatilho de retomada** | o evento concreto que reabre a tarefa |
| **Critérios de aceite** | como saber, objetivamente, que ficou pronto |

### Status

- `PENDING` — reconhecida, ainda não analisada a fundo.
- `DEFERRED` — analisada, com solução desenhada, adiada por decisão explícita.
- `IN_PROGRESS` — em implementação agora.
- `DONE` — concluída; atualizar e mover para a estrutura existente.

### Prioridade

- `BAIXA` — melhoria; nada quebra sem ela.
- `MÉDIA` — risco real e conhecido, com gatilho definido e contorno viável.
- `ALTA` — precisa entrar antes do próximo marco relevante.

A prioridade é do **documento inteiro**. Uma tarefa `MÉDIA` pode conter uma
subtarefa `ALTA` isolada — quando isso acontece, ela vem destacada no topo do
documento.

## Índice

| # | Tarefa | Status | Prior. | Motivo do adiamento | Gatilho de retomada | Documento |
|---|---|---|---|---|---|---|
| 014 | Cobrança aberta e retomada do Pix | `DEFERRED` | `MÉDIA` | Priorizar refinamento visual e validação comercial da V1; o risco exige uma sequência incomum e tem contorno manual | Antes de anunciar; primeiras 10 vendas; relato de cobrança duplicada; antes do upgrade de plano; antes de aumentar tráfego | [`014_cobranca_aberta_e_retomada_pix.md`](014_cobranca_aberta_e_retomada_pix.md) |
| 015 | Limpeza de fotos após expiração | `DEFERRED` | `MÉDIA` | Nenhuma cartinha do Essencial chega perto de 365 dias no curto prazo | Antes de a primeira cartinha do Essencial se aproximar dos 365 dias; ou antes, se custo/privacidade/volume de Storage pesarem | [`015_limpeza_de_fotos_apos_expiracao.md`](015_limpeza_de_fotos_apos_expiracao.md) |
| 016 | Revisão visual V1 | `IN_PROGRESS` | `ALTA` | — (não é uma tarefa adiada; é o roteiro em execução da fase visual, com checklist de PRs) | PR 1 concluído; retomar ao iniciar o PR 2 ou o PR 3 | [`016_revisao_visual_v1.md`](016_revisao_visual_v1.md) |

> **Atenção:** a tarefa 014 contém uma subtarefa de prioridade **ALTA** —
> corrigir a regra que derruba a cartinha quando uma cobrança duplicada é
> estornada. Ela deve ser resolvida **antes de qualquer divulgação
> comercial**, mesmo que o restante da 014 continue adiado.
