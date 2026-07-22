import type { Metadata } from "next";
import { CreateFlow } from "@/components/create/CreateFlow";

export const metadata: Metadata = {
  title: "Criar minha cartinha",
  description:
    "Monte sua cartinha digital em quatro etapas simples: para quem é, mensagem, personalização e assinatura.",
};

export default function CriarPage() {
  return (
    <main className="min-h-dvh bg-creme">
      <CreateFlow />
    </main>
  );
}
