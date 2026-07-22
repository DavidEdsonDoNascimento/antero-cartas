Quero encerrar o desenvolvimento de hoje criando um documento de handoff para retomarmos amanhã sem perder contexto.

Crie um arquivo Markdown em:

docs/tasks/007_handoff_fase2.md

Esse documento deve ser um resumo técnico completo do estado atual do projeto.

Não implemente nenhuma funcionalidade nova.

O objetivo é que amanhã, ao abrir uma nova conversa, eu peça apenas para ler esse arquivo e você consiga entender exatamente onde paramos.

O documento deve conter obrigatoriamente:

# 1. Visão geral

- objetivo do Antero Cartas
- proposta do produto
- público alvo
- status atual do MVP

# 2. Arquitetura atual

Explique como o projeto está organizado hoje.

Liste:

- Next.js
- App Router
- Prisma
- PostgreSQL (Supabase)
- Storage
- Providers
- APIs
- entidades
- serviços
- fluxo da aplicação

# 3. O que foi implementado

Separado por fases:

## Fase 1

Tudo que foi desenvolvido.

## Fase 1.1

Tudo que foi desenvolvido.

## Fase 1.2

Tudo que foi desenvolvido.

## Fase 2

Tudo que foi desenvolvido.

# 4. O que foi validado hoje

Liste tudo que foi realmente executado.

Exemplo:

- migrations
- seed
- build
- lint
- testes
- integração
- publicação da carta
- QR Code
- pagamento mock
- e-mail mock
- slug
- Supabase

# 5. Estado atual do banco

Informar:

- migrations existentes
- entidades
- tabelas
- enums
- índices
- dados seed

# 6. Estado do armazenamento

Explicar claramente:

- banco está no Supabase
- fotos ainda estão em .data/uploads
- motivo
- limitações
- impacto em produção

# 7. Problemas conhecidos

Liste tudo que ainda precisa ser resolvido.

Por exemplo:

- storage local
- domínio definitivo
- QR Code usando domínio ainda não publicado
- etc.

# 8. Próximas tarefas

Liste por prioridade.

Exemplo:

1.
2.
3.

Não iniciar nenhuma delas.

# 9. Decisões técnicas

Documente todas as decisões importantes tomadas até agora.

# 10. Variáveis de ambiente

Liste todas utilizadas.

Explique para que serve cada uma.

Não coloque valores reais nem segredos.

# 11. Estrutura do projeto

Explique rapidamente as principais pastas.

# 12. Fluxo completo do usuário

Descreva passo a passo desde a landing até abrir a cartinha.

# 13. Fluxo interno da aplicação

Explique como os dados percorrem:

Landing
→ Criar
→ Autosave
→ Banco
→ Pedido
→ Pagamento Mock
→ Publicação
→ Carta pública

# 14. Checklist da Fase 2

Marque:

✅ concluído

⚠ pendente

❌ não iniciado

# 15. O que deve ser feito amanhã

Finalize com um plano de ação detalhado para a próxima sessão de desenvolvimento.

Não implemente nada.

Apenas gere esse documento.

Depois me informe o caminho do arquivo criado.