O teste manual do Supabase Storage funcionou, mas identifiquei problemas importantes de experiência no fluxo de criação. Corrija-os antes de avançarmos para domínio ou Fase 3.

## 1. Tela de “Carregando...” ao acessar `/criar`

Ao entrar na página inicial e clicar em “Criar minha cartinha”, sou encaminhado para `/criar`, mas aparece por alguns segundos uma página branca apenas com o texto “Carregando...”.

Isso transmite lentidão e não deve acontecer.

Analise a causa e ajuste para que a transição seja imediata e visualmente consistente com o restante do site.

Possíveis abordagens a avaliar:

* criar o rascunho antecipadamente ao clicar no CTA;
* renderizar imediatamente a estrutura visual do fluxo enquanto a sessão é carregada;
* usar um skeleton fiel à página, em vez de uma tela branca;
* reduzir chamadas sequenciais desnecessárias na inicialização;
* evitar bloquear toda a interface enquanto o rascunho é criado ou recuperado.

Não quero apenas trocar o texto “Carregando...” por um spinner. Quero eliminar ou ocultar a percepção de espera.

## 2. Uma nova carta está reaproveitando dados da anterior

Mesmo depois de concluir e publicar uma cartinha, quando volto à página inicial e clico novamente em “Criar minha cartinha”, a nova criação aparece preenchida com dados anteriores, como o destinatário “esposa”.

O comportamento correto deve ser:

* após concluir/publicar uma carta, a sessão daquela carta deve ser encerrada e removida;
* ao clicar em “Criar minha cartinha” pela página inicial depois de uma compra concluída, deve começar uma carta completamente nova;
* uma carta abandonada e ainda em rascunho pode ser recuperada, mas isso precisa ser uma decisão clara;
* não misturar dados de uma carta publicada com uma nova carta;
* limpar também qualquer cache local legado ou estado persistido relacionado à carta concluída.

Analise todos os pontos em que a sessão é criada, recuperada e limpa:

* CTA da página inicial;
* carregamento de `/criar`;
* conclusão do checkout;
* página de sucesso;
* retorno para criar outra carta;
* dados persistidos no `localStorage`.

Adicione testes cobrindo:

1. continuar uma carta realmente abandonada;
2. não recuperar uma carta publicada;
3. iniciar uma nova carta vazia após concluir outra;
4. não restaurar campos antigos de cache local quando uma nova sessão for criada.

## 3. Demora para a foto aparecer após o upload

O upload para o Supabase funciona, mas há uma demora considerável entre selecionar a foto e ela aparecer na interface.

Melhore a experiência usando preview otimista:

* exibir imediatamente uma prévia local da imagem com `URL.createObjectURL` ou abordagem equivalente;
* mostrar nessa foto um estado visual de upload em andamento;
* substituir a URL temporária pela URL persistida retornada pelo backend quando concluir;
* em caso de falha, remover ou marcar a foto e mostrar uma mensagem clara;
* liberar corretamente a URL temporária com `URL.revokeObjectURL`;
* impedir duplicidade entre a foto otimista e a foto retornada pelo servidor;
* preservar limite, ordenação, capa e remoção das fotos.

Também analise se existe alguma espera desnecessária entre:

* compressão da imagem;
* envio ao backend;
* upload no Supabase;
* persistência no banco;
* atualização do estado da interface.

## Critérios de conclusão

Depois das correções, valide manualmente e com testes:

* clique no CTA e entrada em `/criar` sem tela branca;
* nova carta vazia após publicar uma anterior;
* recuperação apenas de rascunho válido;
* foto aparecendo imediatamente após a seleção;
* persistência da foto após atualizar a página;
* remoção da foto funcionando no banco e no bucket;
* nenhum vazamento de `object URLs`;
* typecheck, lint, testes e build passando.

Não avance para domínio, pagamento real ou e-mail real. Primeiro apresente um diagnóstico curto das causas encontradas e depois implemente as correções.
