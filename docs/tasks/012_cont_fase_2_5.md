O deploy inicial na Vercel está aprovado. Continue a Fase 2.5 nesta ordem:

---

## Status desta execução (2026-07-24)

O primeiro deploy de produção (`https://antero-cartas.vercel.app`) foi feito e
validado (build, rotas estáticas, `/c/seed-demonstracao` consultando o banco
remoto). Durante o smoke test manual do passo 2 abaixo, foi encontrado e
corrigido um bug: o painel "simular pagamento" aparecia incondicionalmente no
checkout de produção — o servidor sempre bloqueava a confirmação (403
`mock_disabled`), mas o front não tratava esse bloqueio e a tela de sucesso
ficava presa em "Confirmando seu pagamento…" para sempre (sem estado
terminal). Diagnóstico e correção completos em `docs/0005_ChangeLog.md`
(entrada "[Fase 2.5] — Checkout travava...") e `docs/0006_Runbook_Producao.md`
(seção 3, "Incidente"). Handoff detalhado: `docs/0007_Handoff_Fase2_5_Parcial.md`.

Onde isso deixa os passos abaixo:

- **Passo 1 (`.gitignore`)**: revisado nesta execução — a duplicata que o
  `vercel link` tinha adicionado (`.vercel`/`.env*` repetidos no fim do
  arquivo, sombreando `!.env.example` a nível de padrão) foi removida; o
  arquivo voltou a ficar idêntico ao já commitado, então **não gerou commit
  próprio**. Commits desta sessão: `fix: prevent mock payment flow in
  production`, `fix: add terminal states to pending order polling`, e um
  commit de documentação (ver handoff para os hashes exatos).
- **Passo 2 (smoke test)**: parcialmente concluído. O bug de pagamento mock
  foi encontrado, corrigido e revalidado após novo deploy. Os demais itens da
  lista automatizável (2.1–2.9) e o checklist manual completo **ainda não
  foram percorridos formalmente** — ver pendências no handoff.
- **Passos 3–5**: ainda não iniciados. Continuam válidos como escritos abaixo.

---

## 1. Revisar o `.gitignore`

Mostre primeiro:

* `git status`;
* o diff completo do `.gitignore`;
* confirme que `.vercel` será ignorado;
* confirme que arquivos `.env` reais continuarão ignorados;
* confirme que a exceção `!.env.example` continuará funcionando.

Se a alteração contiver somente regras seguras relacionadas à Vercel e aos arquivos de ambiente, faça um commit pequeno e isolado.

Não versione:

* diretório `.vercel`;
* `.env`;
* `.env.local`;
* arquivos gerados pela Vercel contendo variáveis;
* IDs ou configurações locais desnecessárias;
* qualquer segredo.

## 2. Smoke test seguro de produção

Não tente concluir pagamento mock nem acessar e-mail mock em produção.

A configuração deve continuar sendo:

`ALLOW_MOCK_PAYMENT_CONFIRMATION=false`
`DEV_EMAILS_ENABLED=false`
`PAYMENT_MODE=mock`
`EMAIL_MODE=mock`

Valide automaticamente, quando possível:

1. criação de um rascunho;
2. atualização do rascunho;
3. upload de uma imagem válida;
4. criação de um pedido no estado pendente;
5. bloqueio da rota `mock-confirm`;
6. bloqueio das rotas `/api/dev/*`;
7. ausência de token de edição nas respostas e URLs públicas;
8. ausência de segredos no bundle;
9. logs de erro da Vercel durante o teste.

Não crie backdoor, rota temporária ou mecanismo público de confirmação.

Use dados claramente identificados como teste, preferencialmente com o domínio `@seed.local`.

Registre os IDs exatos gerados no teste. Não remova os registros ainda; prepare uma limpeza baseada somente nesses IDs para minha autorização posterior.

O teste manual em navegador será feito por mim. Entregue um checklist para eu registrar:

* tempo de entrada em `/criar`;
* comportamento do skeleton;
* nova carta sem dados antigos;
* preview imediato;
* upload de uma foto;
* upload de três fotos;
* upload de seis fotos;
* comportamento no checkout;
* mensagem retornada quando a confirmação mock for bloqueada.

## 3. Carta pública e QR Code

Para testar a carta pública antes do pagamento real, não habilite `mock-confirm`.

Verifique se já existe uma carta de teste publicada no banco remoto.

Se existir, apresente apenas as informações não sensíveis necessárias para testar o slug.

Se não existir, proponha um script administrativo local, não exposto como endpoint, que publique somente uma carta de teste específica. Mostre o script e aguarde minha autorização antes de executá-lo.

Não crie nenhuma rota pública para isso.

## 4. Domínio personalizado

Depois dos testes anteriores, adicione ao projeto da Vercel:

`cartas.anterosistemas.com.br`

Não altere DNS automaticamente.

Obtenha da Vercel e me informe exatamente:

* tipo do registro;
* host/nome;
* destino;
* TTL recomendado, caso exista;
* status atual de verificação.

Depois pare nesse checkpoint para que eu configure o DNS manualmente.

Quando eu confirmar a alteração do DNS:

1. valide a propagação;
2. valide o HTTPS;
3. configure a URL pública definitiva como:
   `https://cartas.anterosistemas.com.br`;
4. faça novo deploy;
5. valide canonical, sitemap, metadata, compartilhamento, link público e QR Code;
6. confirme que nenhum link de produção usa `localhost` ou `antero-cartas.vercel.app`.

Não considere QR Codes gerados antes dessa atualização como definitivos.

## 5. Continuação da Fase 2.5

Depois do domínio, continue com:

* Sentry;
* analytics;
* imagem Open Graph;
* headers de segurança;
* documentação;
* runbook;
* checklist de dispositivos físicos.

Não inicie a Fase 3.
