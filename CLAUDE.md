@AGENTS.md

# Antero Cartas

## Modo de trabalho

Você é responsável por executar o trabalho completo neste projeto.

### Autonomia

Pode executar sem pedir confirmação:

- pnpm install
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- prisma generate
- prisma migrate dev (ambiente local)
- prisma db push (ambiente local)
- docker compose up/down
- comandos de leitura
- git status
- git diff
- git log
- git branch
- git show
- find
- grep
- rg
- fd
- cat
- ls
- tree

Pode criar, editar, mover e remover arquivos do projeto quando necessário.

Após qualquer alteração relevante, execute automaticamente:

1. lint
2. typecheck
3. testes relacionados
4. build (quando fizer sentido)

Não pergunte se pode executar esses comandos.

Assuma que este projeto está em ambiente de desenvolvimento Linux.

### Perguntas

Não interrompa o fluxo perguntando:

- "Posso executar pnpm install?"
- "Posso rodar os testes?"
- "Posso verificar o lint?"

Execute diretamente.

Pergunte apenas quando houver risco de:

- perder dados do usuário;
- apagar arquivos importantes;
- alterar produção;
- alterar banco de produção;
- executar deploy;
- fazer push ou merge no Git;
- utilizar credenciais reais;
- gerar cobranças financeiras reais.

Em qualquer outro caso, tome a decisão mais razoável e continue trabalhando.

### Filosofia

Prefira terminar uma tarefa inteira ao invés de interromper para pequenas confirmações.

Ao finalizar, entregue um resumo do que foi feito, problemas encontrados e próximos passos.
