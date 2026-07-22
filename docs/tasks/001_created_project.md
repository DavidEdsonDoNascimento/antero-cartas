Quero criar um novo produto digital da Antero Sistemas, provisoriamente chamado “Antero Cartas”.

Atue como Product Engineer Sênior, UX Designer orientado a conversão e desenvolvedor Full Stack responsável por transformar esta ideia em um MVP navegável, demonstrável, comercializável e preparado para receber pagamentos reais.

==================================================
1. CONTEXTO DO PRODUTO
==================================================

O produto permite que uma pessoa crie uma cartinha digital para surpreender alguém especial.

O público inclui pessoas que desejam presentear:

- namorado ou namorada;
- marido ou esposa;
- mãe ou pai;
- filho ou filha;
- amigo ou amiga;
- familiares;
- professores;
- outras pessoas especiais.

A cartinha funciona como uma lembrança digital acessada por um link privado. Ela pode conter:

- título;
- mensagem;
- nome do remetente;
- nome do destinatário;
- até 3 fotografias;
- música;
- contador de tempo juntos;
- tema visual;
- animação de envelope sendo aberto.

A principal dor do cliente é não saber como preparar uma surpresa ou o que escrever.

Por isso, o produto deve ajudar a pessoa a criar uma experiência emocional em poucos minutos, mesmo quando ela não tem ideias.

O objetivo comercial é criar um produto de pagamento único por cartinha, capaz de gerar vendas recorrentes mensalmente para a Antero Sistemas.

==================================================
2. REFERÊNCIA FUNCIONAL
==================================================

Leia antes de implementar:

- AGENTS.md;
- CLAUDE.md;
- todos os arquivos dentro de .claude/rules;
- docs/referencia/passo-a-passo.md;
- todos os prints dentro de docs/referencia.

Os materiais mostram um produto usado apenas como referência funcional.

IMPORTANTE:

- Não copie o código do produto de referência.
- Não copie sua marca, logotipo, textos, ilustrações ou identidade visual.
- Não replique o layout pixel a pixel.
- Não use seus depoimentos, números, preços ou alegações comerciais.
- Crie uma experiência própria e original para a Antero Sistemas.
- Preserve apenas os conceitos úteis do fluxo: criação guiada, preview, planos, pagamento e abertura da carta.

==================================================
3. PRINCÍPIOS OBRIGATÓRIOS
==================================================

O projeto deve seguir estes princípios:

1. MVP-first:
   implemente apenas o necessário para demonstrar, vender e entregar uma cartinha.

2. Demo-first:
   a primeira versão precisa estar visualmente apresentável e navegável antes de construirmos integrações complexas.

3. Mobile-first:
   a maior parte dos clientes criará e abrirá a carta pelo celular.

4. Sem cadastro:
   o comprador não deve criar conta para montar ou comprar uma carta.

5. Poucos passos:
   a pessoa deve conseguir montar a cartinha em aproximadamente 3 minutos.

6. Uma decisão principal por tela:
   evite formulários longos e excesso de informações.

7. Preview imediato:
   toda alteração deve aparecer no preview da cartinha.

8. Conversão sem manipulação:
   não usar urgência falsa, avaliações falsas, compradores falsos ou contadores inventados.

9. Arquitetura proporcional:
   não criar microsserviços, filas ou abstrações complexas sem necessidade real no MVP.

10. Código preparado para evolução:
    pagamento, e-mail e armazenamento devem possuir interfaces simples que permitam trocar os provedores futuramente.

==================================================
4. OBJETIVO DA PRIMEIRA ENTREGA
==================================================

A primeira entrega deve permitir que eu apresente o produto a possíveis clientes e percorra este fluxo completo:

1. Entrar na landing page.
2. Clicar em “Criar minha cartinha”.
3. Escolher destinatário e ocasião.
4. Criar título e mensagem.
5. Adicionar fotos, música e contador, caso deseje.
6. Informar quem está enviando.
7. Visualizar a carta pronta.
8. Escolher um plano.
9. Simular ou realizar o pagamento.
10. Abrir a carta por um link exclusivo.
11. Clicar no envelope.
12. Ver a carta abrir e a música iniciar.
13. Compartilhar o link pelo WhatsApp.
14. Receber o link por e-mail quando o pagamento for confirmado.

A primeira versão deve funcionar ponta a ponta com um modo de pagamento mockado claramente separado do modo de produção.

==================================================
5. FLUXO OTIMIZADO DE CRIAÇÃO
==================================================

Não replique todas as etapas da referência. Reduza o fluxo para quatro etapas de criação.

ETAPA 1 — Para quem e por quê

Campos:

- tipo de destinatário;
- nome do destinatário;
- ocasião.

Tipos iniciais:

- namorado(a);
- esposo(a);
- mãe;
- pai;
- amigo(a);
- filho(a);
- outra pessoa especial.

Ocasiões iniciais:

- declaração de amor;
- aniversário;
- aniversário de namoro ou casamento;
- agradecimento;
- pedido de desculpas;
- Dia das Mães;
- Dia dos Pais;
- amizade;
- outra ocasião.

Ao selecionar destinatário e ocasião, personalize sugestões e textos da próxima etapa.

ETAPA 2 — Título e mensagem

Campos:

- título;
- mensagem.

Recursos:

- contador de caracteres;
- validação;
- salvamento automático;
- preview em tempo real;
- botão “Preciso de inspiração”;
- modelos de mensagem conforme destinatário e ocasião;
- opção de inserir um modelo e depois editá-lo.

No MVP, “Preciso de inspiração” deve funcionar com modelos preparados no próprio sistema, sem depender obrigatoriamente de uma API de IA.

Deixe preparada uma feature flag para um futuro assistente de escrita com LLM:

AI_WRITING_ASSISTANT=false

Não faça a integração real com IA antes do restante do fluxo estar pronto.

ETAPA 3 — Personalização

Recursos opcionais:

- upload de até 3 fotografias;
- remoção e reordenação das fotografias;
- contador de tempo juntos;
- data inicial do relacionamento ou vínculo;
- música por URL do YouTube;
- seleção de tema visual.

No MVP, aceite somente URLs válidas do YouTube para música. Extraia o ID do vídeo com segurança. Nunca aceite HTML de embed fornecido pelo usuário.

Explique que a música começará depois que o destinatário clicar para abrir o envelope, respeitando as restrições de reprodução automática dos navegadores.

Temas iniciais:

- Romântico;
- Elegante;
- Delicado;
- Celebração.

ETAPA 4 — Assinatura e revisão

Campos:

- nome de quem está enviando;
- pequena frase de assinatura opcional.

Mostrar:

- resumo da carta;
- preview completo;
- botão para editar cada parte;
- CTA “Finalizar minha cartinha”.

==================================================
6. PREVIEW DA CARTA
==================================================

No desktop:

- formulário à esquerda;
- preview fixo ou sticky à direita.

No celular:

- formulário em tela cheia;
- botão “Ver preview”;
- preview em modal, drawer ou tela própria;
- não comprimir formulário e preview lado a lado.

O preview deve representar fielmente o resultado final.

Exibir no preview:

- título;
- destinatário;
- fotos;
- mensagem;
- contador;
- assinatura;
- música, quando adicionada;
- tema escolhido.

O preview precisa ser rápido e não deve recarregar a página a cada alteração.

==================================================
7. EXPERIÊNCIA DA CARTA RECEBIDA
==================================================

Criar uma rota pública não indexável:

/c/[slug]

O slug deve ser longo, único e difícil de adivinhar.

A página da carta começa mostrando:

- fundo temático;
- envelope fechado;
- nome do destinatário;
- frase curta como “Uma surpresa foi preparada para você”;
- botão ou interação “Abrir minha carta”.

Depois do clique:

1. animar a abertura do envelope;
2. revelar a carta;
3. carregar e iniciar a música, quando existir;
4. exibir título, fotos, mensagem, contador e assinatura;
5. permitir ativar ou pausar a música;
6. permitir compartilhar o link;
7. funcionar corretamente em telas pequenas.

Não indexar cartas em mecanismos de busca:

- definir noindex;
- não colocar cartas em sitemap;
- não criar galeria pública;
- não expor dados de outras cartas.

A animação deve ser bonita, mas leve. Respeite prefers-reduced-motion.

==================================================
8. LANDING PAGE
==================================================

Crie uma landing page original e orientada a conversão.

Seções obrigatórias:

1. Barra superior curta
   - pagamento único;
   - sem mensalidade;
   - entrega digital.

2. Hero
   - promessa emocional clara;
   - explicação simples;
   - CTA principal;
   - exemplo visual da carta;
   - mensagem de que não é necessário instalar aplicativo.

3. Como funciona
   - criar;
   - personalizar;
   - pagar e compartilhar.

4. Para quem é
   - mostrar diferentes destinatários e ocasiões.

5. Demonstração
   - mostrar envelope fechado e carta aberta;
   - permitir visualizar uma carta fictícia de demonstração.

6. Benefícios
   - pronta em poucos minutos;
   - link exclusivo;
   - fotos e música;
   - funciona no celular;
   - não exige cadastro.

7. Planos
   - plano com duração limitada;
   - plano permanente.

8. Depoimentos
   - usar apenas depoimentos fictícios claramente marcados como demonstração durante o desenvolvimento;
   - preparar estrutura para substituir por depoimentos reais;
   - nunca publicar depoimentos fictícios em produção.

9. Garantia
   - deixar texto configurável;
   - não afirmar garantia legal ou comercial sem confirmação da Antero.

10. Perguntas frequentes
    - pelo menos 8 perguntas.

11. CTA final
    - repetir a ação principal.

A página deve possuir SEO para termos relacionados a:

- cartinha digital;
- carta de amor online;
- presente digital;
- surpresa para namorado;
- surpresa para namorada;
- homenagem digital;
- carta para mãe;
- carta para pai.

Não faça keyword stuffing.

==================================================
9. COPY E POSICIONAMENTO
==================================================

A linguagem deve ser:

- emocional;
- simples;
- acolhedora;
- brasileira;
- direta;
- sem parecer infantil;
- sem exageros comerciais.

Crie textos originais.

Sugestões de posicionamento que podem orientar a copy:

- “Uma surpresa simples que vira lembrança.”
- “Transforme suas palavras em uma experiência especial.”
- “Você escolhe as lembranças. A gente ajuda a transformar em presente.”
- “Crie, personalize e envie em poucos minutos.”

Esses textos são direcionamentos e podem ser melhorados.

Centralize os textos comerciais em arquivos de configuração para facilitar testes futuros.

==================================================
10. IDENTIDADE VISUAL
==================================================

A identidade deve combinar o aspecto emocional das cartas com o posicionamento premium da Antero Sistemas.

Não copiar o rosa predominante da referência.

Direção inicial:

- vinho profundo;
- creme;
- rosa queimado;
- dourado discreto;
- grafite;
- bastante espaço em branco.

Sugestão de paleta inicial, centralizada em tokens:

- vinho: #681D35;
- creme: #FFF9F4;
- rosa queimado: #D98C9F;
- dourado: #C6A15B;
- grafite: #211D1E;
- branco: #FFFFFF.

Utilizar:

- fonte serifada elegante em títulos;
- fonte sans-serif legível em textos e formulários;
- bordas suaves;
- sombras discretas;
- animações pequenas;
- componentes acessíveis;
- contraste adequado.

O nome, logotipo, paleta e valores devem ser fáceis de alterar por configuração.

==================================================
11. PLANOS E CHECKOUT
==================================================

Preparar dois planos de pagamento único.

PLANO 1 — Essencial

- carta disponível por um período configurável;
- link e QR Code exclusivos;
- fotos, música e contador;
- valor configurável.

PLANO 2 — Para Sempre

- carta sem expiração programada;
- link e QR Code exclusivos;
- fotos, música e contador;
- valor configurável;
- destaque visual como opção recomendada.

Não hardcode preços em vários componentes. Criar configuração centralizada.

Exemplo:

PLAN_LIMITED_PRICE
PLAN_PERMANENT_PRICE
PLAN_LIMITED_DURATION_DAYS

O checkout deve coletar somente os dados realmente necessários:

- e-mail;
- nome;
- celular, quando necessário;
- CPF somente se exigido pelo provedor de pagamento ou emissão fiscal.

Não armazenar dados de cartão.

Métodos previstos:

- Pix;
- cartão de crédito.

Criar uma interface PaymentProvider.

Implementar inicialmente:

- MockPaymentProvider para desenvolvimento e demonstração;
- estrutura para RealPaymentProvider;
- webhook idempotente;
- estados pending, paid, failed, refunded e expired.

Nunca tratar uma compra como paga apenas porque o navegador retornou para a página de sucesso. A confirmação deve vir do provedor ou do modo mock controlado.

Não implementar cronômetro falso de reserva. Só mostrar tempo de reserva quando existir uma reserva real no backend.

==================================================
12. ENTREGA POR E-MAIL E WHATSAPP
==================================================

Após a confirmação do pagamento:

1. marcar a carta como publicada;
2. gerar slug público;
3. gerar QR Code;
4. enviar e-mail ao comprador;
5. exibir página de sucesso;
6. oferecer compartilhamento pelo WhatsApp.

O e-mail deve conter:

- confirmação da compra;
- link da cartinha;
- QR Code;
- botão para abrir;
- botão ou instrução para compartilhar;
- informação sobre a duração do plano.

Para o MVP, o WhatsApp pode funcionar através de um link de compartilhamento com mensagem preenchida.

Não integrar WhatsApp Cloud API na primeira fase, salvo se toda a jornada principal já estiver concluída e testada.

Criar uma interface EmailProvider e uma implementação mock para desenvolvimento.

==================================================
13. MODELO DE DADOS MÍNIMO
==================================================

Crie um modelo proporcional ao MVP.

Entidade Cart:

- id;
- slug;
- status;
- recipientType;
- recipientName;
- occasion;
- title;
- message;
- senderName;
- signature;
- theme;
- musicUrl;
- musicVideoId;
- relationshipStartDate;
- showRelationshipCounter;
- planType;
- expiresAt;
- publishedAt;
- createdAt;
- updatedAt.

Entidade CartMedia:

- id;
- cartId;
- type;
- url;
- storageKey;
- position;
- createdAt.

Entidade Order:

- id;
- cartId;
- customerName;
- customerEmail;
- customerPhone opcional;
- customerDocument opcional;
- planType;
- amount;
- paymentMethod;
- provider;
- providerPaymentId;
- status;
- paidAt;
- createdAt;
- updatedAt.

Use enum para status e planos.

Status sugeridos da carta:

- DRAFT;
- AWAITING_PAYMENT;
- PAID;
- PUBLISHED;
- EXPIRED;
- CANCELLED.

==================================================
14. STACK
==================================================

Antes de escolher ou alterar tecnologias, verifique o que já existe no repositório.

Se o projeto estiver vazio, utilize uma stack simples:

- Next.js com App Router;
- TypeScript;
- Tailwind CSS;
- componentes acessíveis;
- React Hook Form;
- Zod;
- Prisma;
- PostgreSQL;
- armazenamento S3-compatible ou serviço equivalente;
- geração de QR Code;
- testes unitários e de fluxo crítico.

Não fixe versões sem verificar compatibilidade.

Não instalar bibliotecas duplicadas ou desnecessárias.

Não criar backend separado no MVP se as rotas server-side do Next.js atenderem adequadamente.

==================================================
15. ROTAS SUGERIDAS
==================================================

Rotas públicas:

- /
- /criar
- /checkout/[cartId]
- /pedido/[orderId]/sucesso
- /c/[slug]
- /demonstracao
- /termos
- /privacidade

Rotas internas/API:

- criação e atualização de rascunho;
- upload seguro;
- criação de pedido;
- criação de pagamento;
- webhook de pagamento;
- consulta de status;
- envio ou reenvio de e-mail.

==================================================
16. SALVAMENTO DO RASCUNHO
==================================================

A criação não pode ser perdida ao atualizar a página.

Estratégia:

- salvar localmente durante o preenchimento;
- criar rascunho no backend quando necessário;
- fazer autosave com debounce;
- exibir estado “Salvo” discretamente;
- permitir retomar a carta na mesma sessão.

Não exigir login.

Não armazenar imagens grandes diretamente no localStorage.

==================================================
17. UPLOAD E SEGURANÇA
==================================================

Para fotografias:

- máximo de 3;
- validar MIME type;
- limitar tamanho;
- comprimir no cliente quando apropriado;
- utilizar upload seguro;
- gerar nomes não previsíveis;
- permitir remoção;
- não aceitar SVG ou arquivos executáveis;
- não confiar apenas na extensão.

Para textos:

- escapar conteúdo;
- impedir injeção de HTML;
- limitar tamanho;
- preservar quebras de linha;
- permitir emojis.

Para música:

- aceitar apenas domínios e formatos permitidos;
- extrair o identificador do vídeo;
- nunca renderizar HTML arbitrário do usuário.

==================================================
18. LGPD E PRIVACIDADE
==================================================

Aplicar minimização de dados.

Criar:

- página de privacidade;
- página de termos;
- consentimento adequado no checkout;
- política de retenção configurável;
- proteção das rotas e dados internos;
- noindex nas cartas;
- logs sem conteúdo completo das mensagens;
- mecanismo administrativo futuro para exclusão.

Não registrar CPF, mensagem da carta ou dados sensíveis em logs comuns.

==================================================
19. ANALYTICS
==================================================

Preparar uma camada simples de eventos, sem prender o projeto a um fornecedor.

Eventos importantes:

- landing_viewed;
- create_started;
- recipient_selected;
- message_completed;
- personalization_completed;
- checkout_started;
- plan_selected;
- payment_created;
- payment_confirmed;
- cart_published;
- cart_opened;
- whatsapp_share_clicked.

Não incluir dados pessoais ou o conteúdo da carta nos eventos.

==================================================
20. DOCUMENTAÇÃO
==================================================

Criar ou atualizar:

- README.md;
- .env.example;
- docs/0001_Product_Brief.md;
- docs/0002_MVP_Plan.md;
- docs/0003_Architecture.md;
- docs/0004_Decisions.md;
- docs/0005_ChangeLog.md.

O Product Brief deve explicar:

- problema;
- público;
- proposta de valor;
- jornada;
- monetização;
- métricas;
- escopo e não escopo.

O MVP Plan deve dividir o trabalho em fases curtas.

==================================================
21. FASES DE IMPLEMENTAÇÃO
==================================================

FASE 1 — Protótipo navegável

- identidade visual;
- landing page;
- fluxo de quatro etapas;
- preview;
- carta fechada e aberta;
- dados locais;
- responsividade;
- conteúdo demonstrativo;
- nenhum pagamento real.

Essa fase deve ficar apresentável para uma demonstração comercial.

FASE 2 — Persistência e infraestrutura mínima

- banco de dados;
- rascunho;
- upload;
- carta pública;
- QR Code;
- modo mock de pagamento;
- e-mail mock;
- página de sucesso.

FASE 3 — Venda real

- provedor de pagamento;
- Pix e cartão;
- webhook;
- e-mail real;
- publicação após confirmação;
- tratamento de falhas;
- variáveis de ambiente;
- termos e privacidade.

FASE 4 — Melhorias posteriores

Não implementar agora, apenas documentar:

- assistente de escrita com IA;
- WhatsApp Cloud API;
- painel administrativo;
- cupons;
- afiliados;
- temas premium;
- agendamento de envio;
- carta protegida por senha;
- vídeo;
- múltiplos idiomas;
- edição depois da compra;
- recuperação de carrinho;
- campanhas sazonais.

==================================================
22. CRITÉRIOS DE ACEITE DO MVP
==================================================

O MVP estará aprovado quando:

- funcionar no celular e desktop;
- não exigir cadastro;
- permitir concluir a criação em quatro etapas;
- salvar o progresso;
- mostrar preview fiel;
- aceitar até 3 fotos;
- validar URL do YouTube;
- exibir contador opcional;
- permitir selecionar plano;
- completar compra em modo mock;
- publicar uma carta;
- gerar link exclusivo;
- abrir o envelope por interação;
- iniciar música depois da abertura;
- gerar QR Code;
- mostrar botão de WhatsApp;
- preparar envio por e-mail;
- possuir loading, erro e estado vazio;
- não conter números, avaliações ou urgência falsos;
- não copiar visual ou conteúdo do produto de referência;
- possuir README e documentação suficiente para continuar o projeto.

==================================================
23. FORMA DE TRABALHO
==================================================

Antes de escrever código:

1. leia os arquivos de regras;
2. analise o repositório;
3. analise os materiais de referência;
4. liste o que já existe;
5. apresente um plano curto para a Fase 1;
6. identifique decisões que precisam ser registradas;
7. não faça perguntas sobre detalhes que possam ficar configuráveis ou usar valores provisórios claramente marcados.

Depois disso, implemente a Fase 1.

Não tente construir todas as fases de uma só vez.

Ao terminar cada etapa:

- execute lint;
- execute typecheck;
- execute testes existentes;
- corrija erros;
- atualize o changelog;
- informe exatamente o que foi criado;
- informe o que ainda está mockado;
- informe como executar e testar.

Antes de instalar qualquer biblioteca:

- analise o package.json;
- verifique as dependências já existentes;
- instale somente as necessárias para a etapa atual;
- evite instalar bibliotecas que serão utilizadas apenas em fases futuras;
- explique por que cada nova dependência está sendo adicionada.

Comece agora pela leitura do projeto e pela criação do plano da Fase 1.