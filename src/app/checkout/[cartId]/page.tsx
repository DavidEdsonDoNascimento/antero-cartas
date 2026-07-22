import type { Metadata } from "next";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";

export const metadata: Metadata = {
  title: "Finalizar cartinha",
  robots: { index: false },
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ cartId: string }>;
}) {
  const { cartId } = await params;
  return <CheckoutClient cartId={cartId} />;
}
