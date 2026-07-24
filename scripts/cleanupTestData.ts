/**
 * Remove cartas de teste (e seus pedidos/e-mails/fotos) por ID explícito.
 *
 * SEGURO POR PADRÃO: sem --confirm, só LISTA o que seria removido (dry run).
 * Não aceita nenhum filtro genérico (data, provider, domínio de e-mail) —
 * só uma lista explícita de IDs de Cart, revisada por quem roda o comando.
 *
 *   npx tsx scripts/cleanupTestData.ts --cart-ids id1,id2,id3
 *   npx tsx scripts/cleanupTestData.ts --cart-ids id1,id2,id3 --confirm
 *
 * Contra o banco remoto (produção), carregue as credenciais explicitamente:
 *   npx tsx scripts/cleanupTestData.ts --env-file .env.production.reference \
 *     --cart-ids id1,id2,id3 --confirm
 *
 * Ordem de remoção (respeita as constraints do schema — Order -> Cart não
 * tem onDelete: Cascade, então teria que ser removido antes do Cart):
 *   1. objetos no Storage de cada CartMedia (best-effort, como D43)
 *   2. EmailDelivery é removido em cascata ao remover o Order
 *   3. Order (removido antes do Cart)
 *   4. CartMedia é removido em cascata ao remover o Cart
 *   5. Cart
 */
import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";

const { values } = parseArgs({
  options: {
    "cart-ids": { type: "string" },
    "env-file": { type: "string", default: ".env.local" },
    confirm: { type: "boolean", default: false },
  },
});

loadEnv({ path: values["env-file"] });
loadEnv({ path: ".env" });

async function main() {
  const raw = values["cart-ids"];
  if (!raw || !raw.trim()) {
    console.error(
      "Uso: npx tsx scripts/cleanupTestData.ts --cart-ids id1,id2,id3 [--confirm] [--env-file .env.production.reference]",
    );
    process.exit(1);
  }
  const cartIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (cartIds.length === 0) {
    console.error("Nenhum ID válido em --cart-ids.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(`DATABASE_URL não configurada (arquivo: ${values["env-file"]}).`);
    process.exit(1);
  }

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { getStorage } = await import("../src/server/storage");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const carts = await prisma.cart.findMany({
    where: { id: { in: cartIds } },
    include: {
      media: true,
      orders: { include: { emailDeliveries: true } },
    },
  });

  const foundIds = new Set(carts.map((c) => c.id));
  const missing = cartIds.filter((id) => !foundIds.has(id));
  if (missing.length) {
    console.warn(`Aviso: IDs não encontrados (ignorados): ${missing.join(", ")}`);
  }

  if (carts.length === 0) {
    console.log("Nada para remover.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n=== ${values.confirm ? "REMOVENDO" : "DRY RUN — o que seria removido"} ===\n`);
  for (const cart of carts) {
    console.log(
      `Cart ${cart.id} | status=${cart.status} | slug=${cart.slug ?? "-"} | ` +
        `media=${cart.media.length} | orders=${cart.orders.length} | ` +
        `emails=${cart.orders.reduce((n, o) => n + o.emailDeliveries.length, 0)}`,
    );
  }

  if (!values.confirm) {
    console.log("\nNenhuma alteração feita (dry run). Rode de novo com --confirm para remover.");
    await prisma.$disconnect();
    return;
  }

  const storage = getStorage();
  for (const cart of carts) {
    for (const media of cart.media) {
      try {
        await storage.delete(media.storageKey);
      } catch (err) {
        console.warn(`Falha ao remover objeto do storage (ignorada): ${media.storageKey}`, err);
      }
    }
  }

  await prisma.order.deleteMany({ where: { cartId: { in: [...foundIds] } } });
  await prisma.cart.deleteMany({ where: { id: { in: [...foundIds] } } });

  console.log(`\nRemovidas ${carts.length} carta(s) e dados associados.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
