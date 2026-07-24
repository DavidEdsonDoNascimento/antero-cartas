/**
 * Configuração central da marca e textos comerciais.
 * Nome, logotipo e copy ficam aqui para facilitar testes e troca rápida.
 * Nada de valores comerciais espalhados pelos componentes.
 */

import { getAppEnv } from "@/lib/appEnv";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/**
 * Valida a URL pública em produção (task 011, D54): protocolo https,
 * não-vazia, bem formada e nunca localhost/loopback — link/QR Code errado
 * é irrecuperável depois de enviado. Roda só no servidor (nunca no bundle
 * do cliente) e só quando APP_ENV=production — de propósito NÃO usa
 * NODE_ENV: `npm run build`/`npm start` sempre rodam com
 * NODE_ENV=production, inclusive localmente, e isso quebraria um build
 * local de verificação com `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
 * (mesmo raciocínio do guard em src/lib/appEnv.ts, D49).
 */
function validatePublicUrlInProduction(rawUrl: string): void {
  if (typeof window !== "undefined") return;
  if (getAppEnv() !== "production") return;

  if (!rawUrl.trim()) {
    throw new Error("NEXT_PUBLIC_SITE_URL vazia em produção.");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`NEXT_PUBLIC_SITE_URL malformada em produção: "${rawUrl}".`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL deve usar https em produção (recebido "${parsed.protocol}").`,
    );
  }
  if (LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL aponta para "${parsed.hostname}" em produção — configure o domínio real.`,
    );
  }
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cartas.anterosistemas.com.br";
validatePublicUrlInProduction(siteUrl);

export const site = {
  name: "Antero Cartas",
  company: "Antero Sistemas",
  tagline: "Uma surpresa simples que vira lembrança",
  description:
    "Crie uma cartinha digital com mensagem, fotos, música e contador de tempo. Ela abre no celular por um link exclusivo — sem app, sem cadastro. Pronta em poucos minutos.",
  // Ajuste para o domínio real quando publicar. Também usada para montar o
  // link público da carta e o QR Code (ver src/lib/publicUrl.ts) — a mesma
  // variável cobre as duas responsabilidades (task 011, D54; antes também
  // existia NEXT_PUBLIC_APP_URL, removida por duplicar a mesma URL com um
  // fallback diferente e mais arriscado).
  url: siteUrl,
  // Número usado nos links de ajuda por WhatsApp (somente dígitos, com DDI).
  whatsappSupport: process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT ?? "5599999999999",
} as const;

/**
 * Frases de posicionamento reaproveitáveis (podem ser refinadas depois).
 */
export const positioning = {
  heroTitle: "Transforme suas palavras em uma",
  heroHighlight: "experiência inesquecível",
  heroSubtitle:
    "Uma cartinha digital com a sua mensagem, fotos e música. Ela abre no celular por um link só de vocês — sem instalar nada, sem criar conta.",
  heroCta: "Criar minha cartinha",
  topbar: ["Pagamento único", "Sem mensalidade", "Entrega digital na hora"],
  closingTitle: "Pronto para preparar a surpresa?",
  closingSubtitle:
    "Você escolhe as lembranças. A gente ajuda a transformar tudo em um presente que emociona.",
} as const;

/**
 * Texto de garantia. Configurável — não afirmamos garantia legal/comercial
 * sem confirmação da Antero. Deixe `enabled: false` até validar.
 */
export const guarantee = {
  enabled: false,
  title: "Feito com cuidado",
  text: "Se algo não sair como esperado com a sua cartinha, fale com a gente pelo WhatsApp e vamos ajudar você.",
} as const;
