# 0001 — Product Brief · Antero Cartas

## Problema
Muitas pessoas querem preparar uma surpresa emocional para alguém especial, mas
travam em duas coisas: **não sabem por onde começar** e **não sabem o que escrever**.
Ferramentas genéricas (cartão físico, mensagem de texto) não criam uma experiência
memorável nem permitem juntar fotos, música e uma linha do tempo do relacionamento.

## Público
Pessoas que desejam presentear alguém querido:
namorado(a), esposo(a), mãe, pai, filho(a), amigo(a), familiares, professores e
outras pessoas especiais. Perfil majoritariamente **mobile**, sem paciência para
cadastros ou formulários longos.

## Proposta de valor
Uma **cartinha digital** criada em ~3 minutos, acessível por um **link privado**,
que abre no celular como um envelope. Pode conter título, mensagem, até 6 fotos,
música, contador de tempo juntos e um tema visual. Sem app, sem cadastro.
Ajudamos quem não tem ideias com **modelos de mensagem prontos**.

## Jornada
1. Landing page → "Criar minha cartinha".
2. Etapa 1: para quem e por quê (destinatário + ocasião).
3. Etapa 2: título e mensagem (com inspiração por modelos).
4. Etapa 3: personalização (fotos, música, contador, tema).
5. Etapa 4: assinatura e revisão.
6. Escolha de plano.
7. Pagamento (mock na Fase 1/2 → real na Fase 3).
8. Publicação: link exclusivo + QR Code + e-mail.
9. Destinatário abre o envelope, a música toca e a carta se revela.
10. Compartilhamento por WhatsApp.

## Monetização
Produto de **pagamento único por cartinha** (sem mensalidade), com dois planos:
- **Essencial** — disponível por período configurável (padrão 365 dias).
- **Para Sempre** — sem expiração, destacado como recomendado.
Objetivo comercial: vendas recorrentes mês a mês para a Antero Sistemas.

## Métricas (camada de analytics já preparada)
Funil: `landing_viewed` → `create_started` → `recipient_selected` →
`message_completed` → `personalization_completed` → `checkout_started` →
`plan_selected` → `payment_created` → `payment_confirmed` → `cart_published` →
`cart_opened` → `whatsapp_share_clicked`. Nenhum evento carrega dados pessoais
ou o conteúdo da carta.

## Escopo (MVP)
Fluxo ponta a ponta: landing → criação em 4 etapas → preview fiel → plano →
pagamento (mock claramente separado do real) → carta pública com envelope,
música e compartilhamento.

## Não escopo (documentado para depois)
Assistente de escrita com IA, WhatsApp Cloud API, painel administrativo, cupons,
afiliados, temas premium, agendamento de envio, carta com senha, vídeo, múltiplos
idiomas, edição pós-compra, recuperação de carrinho e campanhas sazonais.

## Princípios de conversão
Sem urgência falsa, sem avaliações falsas, sem compradores inventados, sem
contadores fictícios. Depoimentos ficam **marcados como demonstração** até serem
substituídos por reais.
