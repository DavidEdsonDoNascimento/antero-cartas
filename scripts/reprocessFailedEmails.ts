/**
 * Reprocessa entregas de e-mail com status FAILED (task 013, seção 12).
 *
 * Sem fila/Redis: o outbox (`EmailDelivery`) já modela o problema — este
 * script administrativo simples é o "mecanismo mais simples compatível com
 * o outbox atual" pedido pela task, proporcional ao volume inicial.
 *
 * SEGURO POR PADRÃO: sem --confirm, só LISTA o que seria reenviado (dry run).
 *
 *   npx tsx scripts/reprocessFailedEmails.ts
 *   npx tsx scripts/reprocessFailedEmails.ts --confirm
 *
 * Contra o banco remoto (produção), carregue as credenciais explicitamente:
 *   npx tsx scripts/reprocessFailedEmails.ts --env-file .env.production.reference --confirm
 *
 * Nunca reprocessa além de MAX_ATTEMPTS (evita reenvio infinito de um
 * destinatário permanentemente inválido) nem um pedido que não esteja mais
 * PAID/publicado (carta removida, pedido estornado etc.).
 */
import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";
import type { DbCartRow } from "../src/lib/cartMapping";

const { values } = parseArgs({
  options: {
    "env-file": { type: "string", default: ".env.local" },
    confirm: { type: "boolean", default: false },
  },
});

loadEnv({ path: values["env-file"] });
loadEnv({ path: ".env" });

const MAX_ATTEMPTS = 5;

async function main(): Promise<void> {
  const confirm = values.confirm === true;

  const { prisma } = await import("../src/lib/db");
  const { dbToDomainCart } = await import("../src/lib/cartMapping");
  const { buildPublicCartUrl } = await import("../src/lib/publicUrl");
  const { generateQrDataUrl } = await import("../src/server/qrcode");
  const { getEmailProvider } = await import("../src/server/email");

  const failed = await prisma.emailDelivery.findMany({
    where: { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
    include: { order: { include: { cart: { include: { media: { orderBy: { position: "asc" } } } } } } },
  });

  console.log(`Encontradas ${failed.length} entregas com falha (attempts < ${MAX_ATTEMPTS}).`);
  for (const delivery of failed) {
    console.log(
      `- ${delivery.id} | pedido ${delivery.orderId} | destinatário ${delivery.recipient} | tentativas ${delivery.attempts}`,
    );
  }

  if (!confirm) {
    console.log("\nDry run — nada foi reenviado. Rode com --confirm para reenviar de verdade.");
    await prisma.$disconnect();
    return;
  }

  const provider = getEmailProvider();
  let sent = 0;
  let skipped = 0;
  let failedAgain = 0;

  for (const delivery of failed) {
    const order = delivery.order;
    if (!order || order.status !== "PAID" || !order.cart.slug) {
      console.log(`- ${delivery.id}: pedido não está mais em estado válido para reenvio, pulando.`);
      skipped++;
      continue;
    }

    const cart = dbToDomainCart(order.cart as unknown as DbCartRow);
    const publicUrl = buildPublicCartUrl(cart.slug!);
    const qrCodeDataUrl = await generateQrDataUrl(publicUrl);
    const planLabel = cart.planType === "PERMANENT" ? "Para Sempre" : "Essencial";

    try {
      const rendered = await provider.sendCartPublished({
        to: delivery.recipient,
        customerName: order.customerName,
        cartTitle: cart.title || "Antero Cartas",
        publicUrl,
        qrCodeDataUrl,
        planLabel,
        expiresAt: cart.expiresAt,
      });
      await prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          payload: JSON.stringify(rendered),
          attempts: { increment: 1 },
          sentAt: new Date(),
        },
      });
      console.log(`- ${delivery.id}: reenviado com sucesso.`);
      sent++;
    } catch (err) {
      await prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { attempts: { increment: 1 } },
      });
      console.error(`- ${delivery.id}: falhou de novo —`, err instanceof Error ? err.message : err);
      failedAgain++;
    }
  }

  console.log(`\nResumo: ${sent} reenviados, ${failedAgain} falharam de novo, ${skipped} pulados.`);
  await prisma.$disconnect();
}

void main();
