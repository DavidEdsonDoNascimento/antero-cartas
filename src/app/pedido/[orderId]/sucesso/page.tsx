import type { Metadata } from "next";
import { OrderSuccessClient } from "@/components/order/OrderSuccessClient";

export const metadata: Metadata = {
  title: "Pedido confirmado",
  robots: { index: false },
};

export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <OrderSuccessClient orderId={orderId} />;
}
