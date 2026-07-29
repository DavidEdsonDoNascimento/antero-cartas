import { describe, it, expect } from "vitest";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "./securityHeaders";

const PROD = {
  isProduction: true,
  supabaseUrl: "https://abcdefgh.supabase.co",
  sentryDsn: "https://chave@o123456.ingest.us.sentry.io/7654321",
};

/** Extrai os valores de uma diretiva da política. */
function directive(policy: string, name: string): string[] {
  const found = policy
    .split("; ")
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) return [];
  return found.split(" ").slice(1);
}

describe("Content-Security-Policy — recursos do produto", () => {
  it("permite as fotos do bucket do Supabase", () => {
    expect(directive(buildContentSecurityPolicy(PROD), "img-src")).toContain(
      "https://abcdefgh.supabase.co",
    );
  });

  it("permite a miniatura e o player do YouTube", () => {
    const policy = buildContentSecurityPolicy(PROD);
    expect(directive(policy, "img-src")).toContain("https://i.ytimg.com");
    expect(directive(policy, "frame-src")).toContain("https://www.youtube.com");
  });

  it("permite o QR Code (data:) e o preview local da foto (blob:)", () => {
    const imgSrc = directive(buildContentSecurityPolicy(PROD), "img-src");
    expect(imgSrc).toContain("data:");
    expect(imgSrc).toContain("blob:");
  });

  it("libera os domínios do Payment Brick só com paymentMode 'real'", () => {
    const real = buildContentSecurityPolicy({ ...PROD, paymentMode: "real" });
    expect(directive(real, "script-src")).toContain("https://*.mercadopago.com");
    expect(directive(real, "script-src")).toContain("https://*.mlstatic.com");
    expect(directive(real, "connect-src")).toContain("https://*.mercadopago.com");
    expect(directive(real, "frame-src")).toContain("https://*.mercadopago.com");
    expect(directive(real, "style-src")).toContain("https://*.mercadopago.com");
    expect(directive(real, "font-src")).toContain("https://*.mlstatic.com");
  });

  it("não cita o Mercado Pago em modo mock (nada do Brick é carregado)", () => {
    const mock = buildContentSecurityPolicy({ ...PROD, paymentMode: "mock" });
    expect(mock).not.toContain("mercadopago.com");
    expect(mock).not.toContain("mlstatic.com");
  });

  it("permite o envio de erro ao host do DSN do Sentry", () => {
    expect(directive(buildContentSecurityPolicy(PROD), "connect-src")).toContain(
      "https://o123456.ingest.us.sentry.io",
    );
  });

  it("não cita o Sentry quando não há DSN configurado", () => {
    const policy = buildContentSecurityPolicy({ ...PROD, sentryDsn: undefined });
    expect(policy).not.toContain("sentry.io");
  });

  it("não precisa de domínio externo para o analytics em produção (same-origin)", () => {
    const policy = buildContentSecurityPolicy(PROD);
    expect(policy).not.toContain("va.vercel-scripts.com");
    expect(directive(policy, "connect-src")).toContain("'self'");
  });

  it("permite upload e chamadas de API pela própria origem", () => {
    expect(directive(buildContentSecurityPolicy(PROD), "connect-src")).toContain("'self'");
  });
});

describe("Content-Security-Policy — restrições", () => {
  it("nunca usa curinga irrestrito", () => {
    const policy = buildContentSecurityPolicy(PROD);
    for (const part of policy.split("; ")) {
      const values = part.split(" ").slice(1);
      expect(values).not.toContain("*");
      expect(values).not.toContain("https:");
    }
  });

  it("bloqueia enquadramento, plugin, base e envio de formulário para fora", () => {
    const policy = buildContentSecurityPolicy(PROD);
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
  });

  it("não permite 'unsafe-eval' em produção", () => {
    expect(directive(buildContentSecurityPolicy(PROD), "script-src")).not.toContain(
      "'unsafe-eval'",
    );
  });

  it("força https em produção", () => {
    expect(buildContentSecurityPolicy(PROD)).toContain("upgrade-insecure-requests");
  });

  it("cai para o curinga do próprio Supabase se SUPABASE_URL faltar no build", () => {
    const policy = buildContentSecurityPolicy({ ...PROD, supabaseUrl: undefined });
    expect(directive(policy, "img-src")).toContain("https://*.supabase.co");
  });

  it("ignora SUPABASE_URL malformada em vez de emitir política inválida", () => {
    const policy = buildContentSecurityPolicy({ ...PROD, supabaseUrl: "não-é-url" });
    expect(directive(policy, "img-src")).toContain("https://*.supabase.co");
  });
});

describe("Content-Security-Policy — desenvolvimento", () => {
  const DEV = { ...PROD, isProduction: false };

  it("libera o que o HMR e o analytics de debug precisam, só fora de produção", () => {
    const policy = buildContentSecurityPolicy(DEV);
    expect(directive(policy, "script-src")).toContain("'unsafe-eval'");
    expect(directive(policy, "connect-src")).toContain("ws:");
    expect(directive(policy, "script-src")).toContain("https://va.vercel-scripts.com");
  });

  it("não força https em desenvolvimento — quebraria o http local", () => {
    expect(buildContentSecurityPolicy(DEV)).not.toContain("upgrade-insecure-requests");
  });
});

describe("buildSecurityHeaders", () => {
  it("entrega os headers exigidos pela seção 9.4", () => {
    const keys = buildSecurityHeaders(PROD).map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Strict-Transport-Security",
      ]),
    );
  });

  it("só envia HSTS em produção (o ambiente local é http)", () => {
    const dev = buildSecurityHeaders({ ...PROD, isProduction: false });
    expect(dev.map((header) => header.key)).not.toContain("Strict-Transport-Security");
  });

  it("não usa preload no HSTS — seria praticamente irreversível", () => {
    const hsts = buildSecurityHeaders(PROD).find(
      (header) => header.key === "Strict-Transport-Security",
    );
    expect(hsts?.value).not.toContain("preload");
    expect(hsts?.value).toContain("includeSubDomains");
  });

  it("nega câmera e microfone sem afetar o upload por <input type=file>", () => {
    const permissions = buildSecurityHeaders(PROD).find(
      (header) => header.key === "Permissions-Policy",
    );
    expect(permissions?.value).toContain("camera=()");
    expect(permissions?.value).toContain("microphone=()");
  });

  it("usa nosniff e referrer conservador", () => {
    const headers = buildSecurityHeaders(PROD);
    expect(headers.find((h) => h.key === "X-Content-Type-Options")?.value).toBe("nosniff");
    expect(headers.find((h) => h.key === "Referrer-Policy")?.value).toBe(
      "strict-origin-when-cross-origin",
    );
  });
});
