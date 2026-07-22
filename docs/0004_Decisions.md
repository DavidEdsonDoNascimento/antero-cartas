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
