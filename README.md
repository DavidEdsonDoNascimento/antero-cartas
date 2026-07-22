# Antero Cartas

Cartinhas digitais para surpreender alguém especial. Um produto da **Antero Sistemas**.

Crie uma cartinha com mensagem, fotos, música e contador de tempo. Ela abre no
celular por um link privado, como um envelope — sem app, sem cadastro.

> Status: **Fase 1 — protótipo navegável** (dados locais, pagamento mockado).
> Veja o faseamento em [`docs/0002_MVP_Plan.md`](docs/0002_MVP_Plan.md).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4.

## Como executar
```bash
npm install
npm run dev
```
Acesse http://localhost:3000.

Copie `.env.example` para `.env.local` se quiser ajustar marca, preços ou flags
(nenhuma variável é obrigatória na Fase 1).

## Scripts
- `npm run dev` — ambiente de desenvolvimento
- `npm run build` — build de produção
- `npm run start` — sobe o build
- `npm run lint` — ESLint

## Como testar o fluxo
1. `/` — landing. Clique no envelope da demonstração para vê-lo abrir.
2. `/criar` — monte a cartinha nas 4 etapas (o preview atualiza em tempo real).
   Na Etapa 3, adicione até **6 fotos**, defina a **capa** e reordene (← / →).
   Atualize a página no meio: texto e fotos são recuperados pelo autosave.
3. Finalize, escolha um plano (modo demonstração) e veja a tela de sucesso.
4. Abra o link `/c/[slug]` gerado: clique no envelope, a carta abre e a música toca.
5. `/demonstracao` — exemplo fictício pronto, do envelope à carta aberta.

**Carrossel de fotos**: com 2+ fotos aparecem setas, indicadores e swipe (toque).
No desktop, foque o carrossel e use as setas ← / → do teclado. Funciona no preview,
na demonstração e na carta aberta, com 1 a 6 imagens.

> Nesta fase, a cartinha criada fica salva **apenas no navegador** em que foi
> criada. A persistência em backend entra na Fase 2.

## Documentação
- [`docs/0001_Product_Brief.md`](docs/0001_Product_Brief.md) — problema, público, valor, jornada
- [`docs/0002_MVP_Plan.md`](docs/0002_MVP_Plan.md) — fases e critérios de aceite
- [`docs/0003_Architecture.md`](docs/0003_Architecture.md) — stack e estrutura
- [`docs/0004_Decisions.md`](docs/0004_Decisions.md) — decisões e valores provisórios
- [`docs/0005_ChangeLog.md`](docs/0005_ChangeLog.md) — histórico de mudanças

## Configuração central
- `src/config/site.ts` — marca, copy e posicionamento
- `src/config/plans.ts` — planos e preços (em centavos, sobrescrevíveis por env)
- `src/config/flags.ts` — feature flags (`AI_WRITING_ASSISTANT`, `PAYMENT_MODE`)
- `src/lib/image.ts` — `MAX_CART_PHOTOS` (limite de fotos, padrão 6)
- `src/content/themes.ts` — temas dirigidos por tokens
- `src/content/*` — destinatários, ocasiões, temas, modelos, FAQ, depoimentos
