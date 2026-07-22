/**
 * Seed de desenvolvimento (Fase 2).
 * Roda com Node nativo (type-stripping), sem dependências extras:
 *   npm run db:seed
 *
 * Cria: uma carta publicada de demonstração, uma em rascunho, uma expirada
 * e um pedido mock pago. Nenhum dado pessoal real — tudo fictício.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não configurada. Defina em .env.local antes de rodar o seed.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log("Limpando dados de seed anteriores (por marcador de e-mail @seed.local)...");
  const previousOrders = await prisma.order.findMany({
    where: { customerEmail: { endsWith: "@seed.local" } },
    select: { cartId: true },
  });
  const previousCartIds = previousOrders.map((o) => o.cartId);
  await prisma.order.deleteMany({ where: { customerEmail: { endsWith: "@seed.local" } } });
  if (previousCartIds.length) {
    await prisma.cart.deleteMany({ where: { id: { in: previousCartIds } } });
  }
  await prisma.cart.deleteMany({ where: { slug: "seed-demonstracao" } });
  await prisma.cart.deleteMany({ where: { recipientName: "Rascunho de Teste" } });

  // 1) Carta publicada de demonstração
  const published = await prisma.cart.create({
    data: {
      editTokenHash: hashToken(randomBytes(16).toString("hex")),
      slug: "seed-demonstracao",
      status: "PUBLISHED",
      recipientType: "namorada",
      recipientName: "Ana",
      occasion: "declaracao",
      title: "Para o meu amor",
      message: "Cartinha de demonstração criada pelo seed de desenvolvimento.",
      senderName: "Lucas",
      signature: "Com carinho,",
      theme: "romantico",
      planType: "PERMANENT",
      publishedAt: new Date(),
      expiresAt: null,
    },
  });

  // 2) Carta em rascunho (sem plano, sem publicação)
  await prisma.cart.create({
    data: {
      editTokenHash: hashToken(randomBytes(16).toString("hex")),
      slug: null,
      status: "DRAFT",
      recipientType: "amigo",
      recipientName: "Rascunho de Teste",
      title: "Ainda escrevendo...",
    },
  });

  // 3) Carta expirada (publicada, porém com expiresAt no passado)
  const expiredEditToken = randomBytes(16).toString("hex");
  const expired = await prisma.cart.create({
    data: {
      editTokenHash: hashToken(expiredEditToken),
      slug: "seed-expirada",
      status: "PUBLISHED",
      recipientType: "mae",
      recipientName: "Mãe (seed)",
      title: "Cartinha expirada de teste",
      message: "Usada para testar o estado de expiração na rota pública.",
      senderName: "Filho(a) Teste",
      theme: "delicado",
      planType: "LIMITED",
      publishedAt: new Date(Date.now() - 400 * 86_400_000),
      expiresAt: new Date(Date.now() - 35 * 86_400_000),
    },
  });
  void expired;

  // 4) Pedido mock pago, vinculado à carta publicada
  await prisma.order.create({
    data: {
      cartId: published.id,
      customerName: "Comprador Demonstração",
      customerEmail: "comprador@seed.local",
      planType: "PERMANENT",
      amount: 4890,
      currency: "BRL",
      paymentMethod: "MOCK",
      provider: "mock",
      status: "PAID",
      paidAt: new Date(),
    },
  });

  console.log("Seed concluído:");
  console.log(`  - Carta publicada: /c/${published.slug}`);
  console.log(`  - Carta expirada:  /c/seed-expirada (deve mostrar "expirada")`);
  console.log(`  - Carta em rascunho criada (sem link público)`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Falha no seed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
