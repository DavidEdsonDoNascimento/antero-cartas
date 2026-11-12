import type { Metadata } from "next";
import "@/styles/presentation.css";
import { CreateFlow } from "@/components/create/CreateFlow";
import { presentationFontVars } from "@/components/presentation/fonts";

export const metadata: Metadata = {
  title: "Criar minha cartinha",
  description:
    "Escreva sua mensagem, veja a cartinha pronta e finalize. Fotos, música e estilos são opcionais.",
};

export default function CriarPage() {
  return (
    <main className={`min-h-dvh bg-creme ${presentationFontVars}`}>
      <CreateFlow />
    </main>
  );
}
