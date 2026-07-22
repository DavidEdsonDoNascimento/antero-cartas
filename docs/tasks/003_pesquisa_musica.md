# FASE 1.2 — Pesquisa e seleção de música no YouTube

Antes de iniciar a Fase 2, quero implementar uma etapa intermediária chamada:

**FASE 1.2 — Pesquisa e seleção de música no YouTube**

O objetivo é melhorar a experiência de escolha da música durante a criação da cartinha.

Atualmente, o usuário precisa colar diretamente uma URL do YouTube. Quero que ele também possa pesquisar pelo nome da música, artista ou ambos e receber uma lista de resultados do YouTube para selecionar, semelhante à experiência observada no produto de referência.

Não implemente ainda persistência em banco, pagamentos, upload em nuvem, QR Code ou e-mail.

Leia antes de alterar o código:

* `001_created_project.md`;
* `docs/0001_Product_Brief.md`;
* `docs/0002_MVP_Plan.md`;
* `docs/0003_Architecture.md`;
* `docs/0004_Decisions.md`;
* `docs/0005_ChangeLog.md`;
* os arquivos atuais responsáveis pela personalização, música, preview e carta aberta;
* as regras existentes em `AGENTS.md`, `CLAUDE.md` e `.claude/rules`.

Primeiro, faça uma auditoria breve da implementação atual da música e apresente os impactos técnicos. Depois implemente esta Fase 1.2.

==================================================

1. EXPERIÊNCIA DE BUSCA
   ==================================================

Na Etapa 3 — Personalização, substitua a experiência principal baseada somente em URL por uma interface de pesquisa.

O usuário deve conseguir digitar:

* nome da música;
* nome do artista;
* nome da música e artista juntos.

Exemplos:

* `Perfect Ed Sheeran`;
* `A Thousand Years`;
* `Bruno Mars`;
* `música para aniversário romântica`.

A interface deve conter:

* campo com placeholder como `Digite uma música ou artista`;
* botão de pesquisa;
* suporte a pesquisa ao pressionar Enter;
* estado inicial;
* estado carregando;
* estado sem resultados;
* estado de erro;
* lista de resultados;
* opção de limpar a pesquisa;
* opção de trocar a música selecionada.

A pesquisa automática pode acontecer após o usuário parar de digitar, mas não deve disparar requisições a cada caractere.

Utilize debounce de aproximadamente 500 a 700 ms e exija pelo menos 2 ou 3 caracteres antes da pesquisa.

Evite requisições duplicadas para o mesmo termo.

==================================================
2. RESULTADOS DA PESQUISA
=========================

Exiba inicialmente entre 5 e 8 resultados.

Cada resultado deve mostrar:

* thumbnail;
* título do vídeo;
* nome do canal ou artista;
* indicação visual do YouTube;
* botão ou ação `Selecionar`;
* link opcional `Ver no YouTube`, abrindo em nova aba com segurança.

O título e o canal devem ser tratados como conteúdo externo:

* escapar corretamente;
* não renderizar HTML vindo da API;
* evitar quebra do layout com títulos longos;
* utilizar `rel="noopener noreferrer"` em links externos.

Ao selecionar um resultado:

* salvar o `videoId`;
* salvar a URL canônica do vídeo;
* salvar o título;
* salvar o nome do canal;
* salvar a thumbnail necessária para exibição;
* destacar claramente o resultado selecionado;
* atualizar imediatamente o preview da cartinha;
* permitir ouvir uma prévia;
* permitir remover ou trocar a música.

Não salve a resposta completa da API no estado persistido da cartinha. Salve apenas os dados mínimos necessários da música escolhida.

==================================================
3. INTEGRAÇÃO COM YOUTUBE DATA API
==================================

Utilize a API oficial do YouTube, sem scraping da página do YouTube e sem serviços não oficiais.

Implemente a pesquisa em uma rota server-side do Next.js, por exemplo:

`GET /api/youtube/search?q=TERMO`

A chave da API deve existir somente no servidor:

`YOUTUBE_API_KEY=`

Nunca utilizar prefixo `NEXT_PUBLIC_` nessa chave.

Nunca enviar a chave ao navegador.

A rota interna deve chamar o endpoint oficial de busca do YouTube com parâmetros proporcionais ao produto, incluindo:

* `part=snippet`;
* `type=video`;
* `q`;
* `maxResults`;
* `regionCode=BR`;
* `relevanceLanguage=pt`;
* `safeSearch=strict` ou `moderate`;
* `videoEmbeddable=true`, caso suportado pela configuração usada;
* `videoSyndicated=true`, caso seja útil para reduzir resultados não reproduzíveis.

Analise os parâmetros atuais documentados pela API antes de implementar. Não presuma parâmetros ou formatos obsoletos.

Normalize a resposta para um formato interno simples:

```ts
type MusicSearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
};
```

Não retorne a resposta bruta do Google para o cliente.

==================================================
4. VALIDAÇÃO DA ROTA
====================

A rota de pesquisa deve:

* aceitar somente método GET;
* validar e normalizar o termo;
* remover espaços duplicados;
* impor tamanho mínimo e máximo;
* limitar a quantidade de resultados;
* utilizar timeout;
* tratar resposta inválida;
* tratar chave ausente;
* tratar cota excedida;
* tratar indisponibilidade da API;
* não registrar a chave;
* não registrar dados desnecessários;
* devolver erros em formato consistente;
* nunca derrubar a página de criação.

Utilize Zod apenas se ele já estiver instalado ou se houver justificativa real para adicioná-lo nesta etapa.

Não instale o SDK completo do Google apenas para fazer uma requisição HTTP simples, caso `fetch` seja suficiente.

==================================================
5. COTA, DEBOUNCE E CACHE
=========================

A API do YouTube possui limites de uso. Portanto:

* não pesquisar a cada tecla;
* não pesquisar termos com poucos caracteres;
* não repetir imediatamente a mesma busca;
* limitar resultados;
* cancelar requisições anteriores com `AbortController`;
* evitar condições de corrida;
* manter um pequeno cache no servidor por termo normalizado;
* aplicar TTL configurável;
* limitar o crescimento desse cache.

Criar configurações centralizadas, por exemplo:

```env
YOUTUBE_API_KEY=
YOUTUBE_SEARCH_ENABLED=true
YOUTUBE_SEARCH_MAX_RESULTS=6
YOUTUBE_SEARCH_CACHE_TTL_SECONDS=3600
```

A implementação do cache nesta fase pode ser simples e em memória.

Documente que esse cache:

* funciona por instância;
* pode ser perdido em reinicializações;
* não substitui Redis ou cache compartilhado em produção;
* é suficiente para o protótipo e início do MVP.

Não criar Redis nesta fase.

==================================================
6. MODO MOCK E DESENVOLVIMENTO
==============================

A Fase 1.2 deve continuar executável mesmo sem uma chave do YouTube configurada.

Crie uma separação clara entre:

* busca real;
* busca mockada;
* busca desabilitada.

Sugestão:

```env
YOUTUBE_SEARCH_MODE=mock
```

Valores aceitos:

* `mock`;
* `real`;
* `disabled`.

No modo `mock`:

* retornar uma pequena lista local de músicas fictícias ou vídeos de demonstração definidos em arquivo de conteúdo;
* não fingir que esses resultados vieram da API real;
* exibir discretamente que a busca está em modo demonstração;
* permitir testar seleção, preview, troca e remoção.

No modo `real`:

* exigir `YOUTUBE_API_KEY`;
* utilizar a rota server-side;
* nunca fazer fallback silencioso para resultados falsos;
* se a chave estiver ausente, mostrar uma mensagem clara para desenvolvimento.

No modo `disabled`:

* ocultar ou desabilitar a pesquisa;
* manter disponível a opção de colar URL manualmente.

Não incluir chaves reais no repositório.

Atualize `.env.example`.

==================================================
7. MANTER A OPÇÃO DE COLAR LINK
===============================

Não remova a funcionalidade atual de colar uma URL do YouTube.

A interface pode possuir duas opções:

* `Pesquisar música`;
* `Colar link do YouTube`.

A pesquisa deve ser a opção principal.

O link manual funciona como alternativa quando:

* a música não aparece na busca;
* a API está indisponível;
* a cota foi atingida;
* o usuário já possui o link.

Reaproveite a validação e a extração segura de `videoId` já existentes.

Quando uma URL for informada:

* validar domínio;
* extrair o ID com segurança;
* rejeitar formatos inválidos;
* atualizar a mesma estrutura de música utilizada pela pesquisa;
* não manter dois modelos de dados incompatíveis.

==================================================
8. MODELO DE DADOS DA MÚSICA
============================

Revise o estado atual da cartinha para suportar os metadados da música.

Utilize uma estrutura semelhante a:

```ts
type SelectedMusic = {
  videoId: string;
  youtubeUrl: string;
  title?: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  source: "search" | "manual";
};
```

Evite espalhar campos soltos de música por vários componentes.

Garanta compatibilidade com rascunhos antigos que armazenem apenas:

* `musicUrl`;
* `musicVideoId`.

Ao restaurar um rascunho antigo:

* fazer migração simples em memória;
* não quebrar a criação;
* preencher os metadados opcionais quando possível;
* não exigir uma nova pesquisa.

Não crie banco de dados nesta fase.

==================================================
9. SELEÇÃO E PRÉVIA
===================

Depois que o usuário selecionar uma música, mostrar um cartão resumido com:

* thumbnail;
* título;
* canal;
* botão `Ouvir prévia`;
* botão `Trocar música`;
* botão `Remover música`.

A prévia deve utilizar o player oficial incorporado do YouTube.

Não:

* extrair áudio do YouTube;
* fazer download do vídeo ou áudio;
* ocultar ou modificar indevidamente o player;
* criar um player de áudio próprio a partir do conteúdo do YouTube;
* tentar contornar anúncios, controles ou restrições do YouTube.

No preview da criação:

* não iniciar automaticamente;
* exibir a música selecionada;
* permitir iniciar a prévia somente após interação;
* evitar que a música continue tocando ao trocar de etapa sem que isso esteja claro;
* pausar ou destruir corretamente o player quando necessário.

Na carta aberta:

* continuar tentando iniciar a música somente depois do clique no envelope;
* tratar bloqueio de autoplay;
* mostrar botão para tocar quando necessário;
* manter controles de pausa;
* não gerar erro visual caso o vídeo não possa ser incorporado.

A API do player possui evento para casos de bloqueio de autoplay. Considere esse comportamento, mas não adicione complexidade além do necessário.

==================================================
10. VÍDEOS INDISPONÍVEIS
========================

Uma música selecionada pode se tornar:

* privada;
* removida;
* bloqueada por região;
* proibida para incorporação;
* indisponível posteriormente.

A interface deve lidar com isso de maneira segura.

Nesta fase:

* priorize resultados incorporáveis;
* trate erros do player;
* mostre mensagem como `Esta música não está disponível. Escolha outra.`;
* permita trocar ou remover a música;
* não impedir o restante da criação da cartinha;
* não prometer disponibilidade permanente da música.

Adicionar uma observação curta na interface e no FAQ:

`A reprodução depende da disponibilidade do vídeo no YouTube.`

==================================================
11. ACESSIBILIDADE E MOBILE
===========================

A busca deve funcionar bem no celular.

Verifique:

* campo e botão com tamanho adequado para toque;
* resultado com thumbnail sem overflow;
* títulos truncados visualmente, mas disponíveis para leitores de tela;
* estado selecionado perceptível sem depender apenas de cor;
* navegação por teclado;
* foco visível;
* `aria-live` para carregamento, erros e quantidade de resultados;
* botões com nomes acessíveis;
* modal ou player de prévia fácil de fechar;
* ausência de scroll horizontal.

Não utilizar hover como única forma de interação.

==================================================
12. ANALYTICS
=============

Adicionar eventos à camada existente:

* `music_search_started`;
* `music_search_completed`;
* `music_search_failed`;
* `music_selected`;
* `music_removed`;
* `music_preview_played`.

Não enviar:

* texto completo pesquisado;
* nome do cliente;
* conteúdo da carta;
* URL completa com parâmetros;
* qualquer chave ou dado sensível.

Caso seja necessário identificar tendências futuramente, documente uma estratégia de privacidade antes de registrar termos de busca.

==================================================
13. TESTES
==========

Como esta etapa adiciona uma integração externa e funções puras importantes, implemente testes proporcionais.

Priorize testes para:

* normalização do termo;
* validação de tamanho;
* transformação da resposta do YouTube;
* extração de `videoId`;
* URL manual válida e inválida;
* modo mock;
* modo disabled;
* chave ausente no modo real;
* resposta vazia;
* erro de cota;
* timeout;
* cancelamento de busca anterior;
* migração do formato antigo de música.

Antes de instalar Vitest ou outra biblioteca, verifique o que já existe no projeto.

Caso instale uma dependência de testes:

* justifique;
* configure apenas o necessário;
* não crie infraestrutura pesada;
* documente os comandos.

==================================================
14. SEGURANÇA E ABUSO
=====================

Como a rota será pública, aplique proteções proporcionais:

* limite de tamanho do termo;
* limite de resultados;
* cache;
* debounce no cliente;
* timeout;
* resposta normalizada;
* não exposição da chave;
* cabeçalhos apropriados;
* mensagem genérica para erros internos.

Prepare uma abstração simples para rate limiting futuro.

Se for possível aplicar um limitador leve sem infraestrutura externa e sem causar problemas em ambiente serverless, faça-o. Caso contrário:

* não implemente uma falsa proteção em memória como se fosse definitiva;
* documente a necessidade de rate limiting compartilhado antes da produção;
* mantenha o escopo desta fase proporcional.

==================================================
15. DOCUMENTAÇÃO
================

Atualize:

* `README.md`;
* `.env.example`;
* `docs/0002_MVP_Plan.md`;
* `docs/0003_Architecture.md`;
* `docs/0004_Decisions.md`;
* `docs/0005_ChangeLog.md`;
* `001_created_project.md`, caso ele continue sendo a especificação ativa.

Registre as decisões:

* busca oficial via YouTube Data API;
* chave somente no servidor;
* pesquisa principal com URL manual como alternativa;
* modo mock disponível;
* cache em memória temporário;
* cota da API como limitação;
* nenhuma extração ou hospedagem de áudio;
* reprodução dependente da disponibilidade do YouTube;
* persistência definitiva dos metadados ficará para a Fase 2.

Inclua no README as instruções para:

1. criar ou selecionar um projeto no Google Cloud;
2. habilitar a YouTube Data API;
3. criar uma chave;
4. restringir a chave de forma adequada;
5. configurar `YOUTUBE_API_KEY`;
6. executar em modo mock;
7. executar em modo real;
8. verificar erros de cota.

Não coloque a chave real na documentação.

==================================================
16. O QUE NÃO FAZER NESTA FASE
==============================

Não implementar agora:

* Prisma;
* PostgreSQL;
* S3;
* upload real;
* pagamento;
* webhook;
* QR Code;
* envio de e-mail;
* Redis;
* autenticação;
* painel administrativo;
* YouTube OAuth;
* criação de playlists;
* upload de vídeos;
* download ou extração de áudio;
* Spotify;
* Apple Music;
* IA;
* WhatsApp Cloud API.

Não iniciar a Fase 2 automaticamente.

==================================================
17. CRITÉRIOS DE ACEITE
=======================

A Fase 1.2 estará concluída quando:

* o usuário puder pesquisar por música ou artista;
* a busca retornar resultados em formato visual;
* cada resultado mostrar thumbnail, título e canal;
* o usuário puder selecionar uma música;
* a seleção atualizar o preview;
* o usuário puder ouvir uma prévia;
* o usuário puder trocar ou remover a música;
* a opção de colar URL continuar funcionando;
* a chave não aparecer no cliente;
* o modo mock funcionar sem chave;
* erros e ausência de resultados forem tratados;
* buscas anteriores forem canceladas corretamente;
* a API não for chamada a cada tecla;
* houver cache simples;
* a carta aberta continuar funcionando;
* a experiência funcionar no celular;
* não houver scraping;
* não houver download ou extração de áudio;
* lint, typecheck, build e testes passarem.

==================================================
18. VALIDAÇÃO FINAL
===================

Ao concluir:

* execute o typecheck;
* execute ESLint;
* execute os testes;
* execute o build;
* faça smoke test das rotas;
* teste o modo mock;
* teste o modo real quando houver chave disponível;
* teste o modo disabled;
* teste pesquisa, seleção, troca e remoção;
* teste URL manual;
* teste no mobile;
* confirme que `YOUTUBE_API_KEY` não está no bundle do navegador;
* confirme que a carta continua com `noindex`;
* confirme que não houve regressão no carrossel de fotos;
* atualize a documentação.

Entregue um relatório contendo:

1. auditoria da implementação anterior;
2. arquitetura adotada;
3. dependências instaladas e justificativas;
4. arquivos principais criados ou modificados;
5. como configurar a API;
6. como testar em modo mock;
7. como testar em modo real;
8. como a cota está sendo protegida;
9. limitações conhecidas;
10. pendências para a Fase 2.

Pare ao concluir a Fase 1.2. Não inicie a Fase 2.
