<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Project execution rules

- This project uses pnpm. Never use npm or yarn.
- Execute safe development commands without asking for permission.
- Do not ask before running install, lint, typecheck, tests, build, or Prisma Client generation.
- Run commands directly and report their results afterward.
- Use reasonable judgment and continue without interrupting for minor decisions.
- Ask only before destructive operations, production changes, deployments, real financial transactions, database resets, git push, merge, or force operations.
- Never expose environment variable values or secrets.
- Never create a real Mercado Pago charge without explicit authorization.
