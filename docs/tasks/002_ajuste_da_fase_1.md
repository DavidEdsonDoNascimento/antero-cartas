Antes de iniciar a Fase 2, quero realizar uma etapa intermediária chamada:

FASE 1.1 — Refinamento funcional e visual do protótipo

O objetivo é consolidar a experiência da Fase 1 antes de criar persistência, upload real, QR Code e e-mail.

Não implemente nenhuma funcionalidade de backend da Fase 2 nesta etapa.

Leia novamente:

- 001_created_project.md;
- docs/0001_Product_Brief.md;
- docs/0002_MVP_Plan.md;
- docs/0003_Architecture.md;
- docs/0004_Decisions.md;
- docs/0005_ChangeLog.md;
- todos os arquivos relevantes da implementação atual.

Primeiro, faça uma auditoria breve da Fase 1 e identifique impactos das alterações solicitadas. Depois implemente os ajustes abaixo.

==================================================
1. ALTERAR O LIMITE DE FOTOS
==================================================

Atualmente o produto aceita até 3 fotografias.

Altere para aceitar até 6 fotografias.

Atualize todos os pontos relacionados:

- tipos;
- constantes;
- validações;
- textos da interface;
- contador de fotos;
- mensagens de erro;
- preview;
- carta aberta;
- dados salvos no localStorage;
- documentação;
- critérios de aceite.

Não espalhe o número 6 pelo projeto. Crie uma constante central configurável, como:

MAX_CART_PHOTOS = 6

==================================================
2. CARROSSEL DE FOTOS
==================================================

As fotografias não devem aparecer todas lado a lado na carta.

Implemente um carrossel leve, elegante, mobile-first e acessível.

O carrossel deve funcionar:

- no preview durante a criação;
- na demonstração;
- na carta final aberta;
- no desktop;
- no celular.

Comportamentos obrigatórios:

- uma fotografia principal por vez;
- navegação anterior e próxima;
- indicadores da posição;
- suporte a swipe no celular, se puder ser implementado sem adicionar dependência pesada;
- teclado no desktop;
- texto acessível nos controles;
- preservar proporção da imagem;
- evitar cortes ruins;
- não alterar bruscamente a altura da carta;
- respeitar prefers-reduced-motion;
- funcionar corretamente com 1, 2 ou até 6 imagens.

Não instalar uma biblioteca de carrossel sem antes verificar se a implementação com React, CSS e pointer events é suficiente.

Se instalar uma dependência, justifique objetivamente no relatório final.

==================================================
3. GERENCIAMENTO DAS FOTOS
==================================================

Melhore a experiência das imagens durante a criação.

Permitir:

- adicionar até 6 fotos;
- remover uma foto individualmente;
- visualizar miniaturas;
- definir qual será a primeira foto;
- reordenar as fotos.

Para reordenação:

- priorize uma solução simples;
- pode utilizar botões “mover para esquerda” e “mover para direita” no MVP;
- não implemente drag-and-drop complexo se ele adicionar muita dependência ou risco;
- a ordem escolhida deve ser mantida no autosave e refletida no carrossel.

==================================================
4. REVISÃO DO PREVIEW
==================================================

Revise o preview para garantir que represente fielmente a carta final.

No desktop:

- manter preview sticky;
- garantir que o carrossel caiba sem prejudicar o formulário;
- evitar scroll horizontal;
- manter boa leitura de mensagens longas.

No celular:

- revisar o drawer/modal de preview;
- garantir que ele seja fácil de fechar;
- impedir perda dos dados digitados;
- garantir que o carrossel seja utilizável por toque;
- evitar que a música ou o preview iniciem ações indesejadas.

O preview não deve tocar música automaticamente.

==================================================
5. CARTA ABERTA
==================================================

Revise a experiência da rota /c/[slug].

Após a abertura do envelope:

- mostrar o carrossel de fotos em posição de destaque;
- manter título e mensagem legíveis;
- evitar que mensagens longas deformem o layout;
- deixar os controles de música discretos e fáceis de usar;
- mostrar contador apenas quando ativado;
- mostrar assinatura com destaque apropriado;
- garantir boa aparência para cartas sem foto e sem música;
- garantir boa aparência com 6 fotos e uma mensagem longa.

A música só pode tentar iniciar após a interação de abertura do envelope.

Se o navegador bloquear a reprodução:

- não gerar erro visual;
- mostrar um botão claro para iniciar a música;
- manter a carta utilizável normalmente.

==================================================
6. TEMAS
==================================================

Revise os quatro temas existentes:

- Romântico;
- Elegante;
- Delicado;
- Celebração.

Eles precisam parecer visualmente distintos, não apenas mudar uma cor.

Cada tema pode variar:

- fundo;
- tipografia de destaque;
- ornamentos;
- borda da carta;
- estilo dos controles;
- detalhes do envelope.

Não criar quatro implementações separadas. Manter os temas dirigidos por configuração/tokens.

==================================================
7. FLUXO DE CRIAÇÃO
==================================================

Faça uma revisão funcional das quatro etapas.

Verifique:

- validação antes de avançar;
- possibilidade de voltar sem perder dados;
- autosave;
- restauração após atualizar;
- contador de caracteres;
- estados de erro;
- texto dos CTAs;
- indicador de progresso;
- experiência em telas pequenas;
- tratamento de campos opcionais;
- revisão final antes da seleção do plano.

Não aumentar o número de etapas.

==================================================
8. RESPONSIVIDADE E CASOS-LIMITE
==================================================

Teste pelo menos estes cenários:

1. Carta somente com título, mensagem e assinatura.
2. Carta com uma fotografia.
3. Carta com seis fotografias.
4. Carta com mensagem longa.
5. Carta com contador, mas sem música.
6. Carta com música, mas sem fotos.
7. Carta com todos os recursos.
8. Atualização da página no meio da criação.
9. Tela mobile estreita.
10. Usuário com prefers-reduced-motion.

Corrija problemas encontrados que estejam dentro da Fase 1.1.

==================================================
9. O QUE NÃO FAZER AGORA
==================================================

Nesta etapa, não implementar:

- Prisma;
- PostgreSQL;
- armazenamento S3;
- upload real para backend;
- pagamento real;
- API de pagamento;
- webhook;
- QR Code;
- e-mail real ou mock;
- autenticação;
- painel administrativo;
- IA;
- WhatsApp Cloud API;
- testes end-to-end pesados.

O armazenamento das imagens pode continuar temporariamente conforme a estratégia local atual da Fase 1.

Caso o uso de até 6 imagens crie limitações importantes no localStorage, documente claramente o problema e aplique uma solução temporária proporcional para demonstração, sem construir a infraestrutura da Fase 2.

==================================================
10. DOCUMENTAÇÃO
==================================================

Atualize:

- docs/0002_MVP_Plan.md;
- docs/0003_Architecture.md, somente se necessário;
- docs/0004_Decisions.md;
- docs/0005_ChangeLog.md;
- README.md;
- 001_created_project.md, apenas se ele estiver sendo mantido como especificação ativa.

Registre a decisão:

- limite alterado de 3 para 6 fotos;
- fotos exibidas em carrossel;
- reordenação simples;
- infraestrutura real de upload continua na Fase 2.

==================================================
11. VALIDAÇÃO
==================================================

Ao terminar:

- execute TypeScript typecheck;
- execute ESLint;
- execute build;
- teste todas as rotas;
- valide noindex da carta;
- verifique o fluxo completo;
- verifique que o localStorage não causa erros de hidratação;
- informe se alguma nova dependência foi instalada e por quê.

Entregue um relatório com:

1. o que foi alterado;
2. arquivos principais modificados;
3. como testar o carrossel;
4. casos-limite testados;
5. limitações temporárias;
6. pendências reais para a Fase 2.

Pare ao concluir a Fase 1.1. Não inicie a Fase 2 automaticamente.