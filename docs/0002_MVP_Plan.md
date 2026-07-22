# 0002 — MVP Plan · Antero Cartas

O trabalho é dividido em fases curtas. **Não construir todas de uma vez.**

## Fase 1 — Protótipo navegável ✅ (esta entrega)
Objetivo: ficar apresentável para uma demonstração comercial, ponta a ponta,
com dados locais e **sem pagamento real**.

- [x] Identidade visual (tokens de cor, tipografia, animações)
- [x] Landing page com todas as seções + SEO
- [x] Fluxo de criação em 4 etapas
- [x] Preview fiel em tempo real (desktop sticky / mobile drawer)
- [x] Carta fechada (envelope) e aberta com música e `prefers-reduced-motion`
- [x] Dados locais (localStorage) com autosave e "Salvo"
- [x] Upload de até 6 fotos com validação e compressão no cliente
- [x] Música por URL do YouTube (extração segura do ID)
- [x] Contador de tempo juntos
- [x] 4 temas visuais
- [x] Seleção de plano (visual, modo demonstração)
- [x] Compartilhamento por WhatsApp (link com mensagem)
- [x] Páginas de termos e privacidade
- [x] Responsividade mobile-first, estados de loading/erro/vazio

## Fase 1.1 — Refinamento funcional e visual ✅
Consolidação da experiência antes da persistência (sem backend).

- [x] Limite de fotos 3 → **6** via constante central `MAX_CART_PHOTOS`
- [x] **Carrossel** de fotos (preview, demonstração e carta aberta), sem dependência
- [x] Gestão de fotos: adicionar, remover, miniaturas, definir capa, reordenar
- [x] Ordem das fotos mantida no autosave (localStorage em duas camadas)
- [x] Revisão do preview (desktop sticky / drawer mobile, sem scroll horizontal)
- [x] Carta aberta revisada (carrossel em destaque, música discreta, sem erro visual)
- [x] Temas visualmente distintos dirigidos por tokens
- [x] Revisão do fluxo de 4 etapas e casos-limite (1..6 fotos, msg longa, mobile, reduced-motion)

## Fase 2 — Persistência e infraestrutura mínima
- [ ] Banco de dados (Prisma + PostgreSQL) com o modelo de `lib/types.ts`
- [ ] Rascunho no backend + rota de criação/atualização
- [ ] Upload seguro para storage S3-compatible (substitui data URL local)
- [ ] Carta pública servida pelo backend por slug
- [ ] Geração de QR Code
- [ ] `MockPaymentProvider` + webhook idempotente + estados de pagamento
- [ ] `EmailProvider` mock + página de sucesso completa

## Fase 3 — Venda real
- [ ] `RealPaymentProvider` (Pix e cartão) atrás da interface `PaymentProvider`
- [ ] Webhook de confirmação (nunca confiar no retorno do navegador)
- [ ] Publicação após confirmação real
- [ ] E-mail real de entrega (link + QR Code)
- [ ] Tratamento de falhas (pending/failed/refunded/expired)
- [ ] Variáveis de ambiente de produção + termos/privacidade revisados

## Fase 4 — Melhorias posteriores (apenas documentar)
Assistente de IA, WhatsApp Cloud API, painel admin, cupons, afiliados, temas
premium, agendamento, senha, vídeo, i18n, edição pós-compra, recuperação de
carrinho, campanhas sazonais.

## Critérios de aceite do MVP
Ver seção 22 da task. Estado atual da Fase 1 cobre: mobile+desktop, sem cadastro,
criação em 4 etapas, autosave, preview fiel, até 6 fotos em carrossel, validação de YouTube,
contador opcional, seleção de plano, conclusão em modo mock, publicação local,
link exclusivo, envelope por interação, música após abertura, botão de WhatsApp,
estados de loading/erro/vazio, sem números/urgência falsos e sem cópia da referência.
Pendentes para Fase 2: QR Code e envio real por e-mail.
