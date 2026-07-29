import type { CartPublishedEmailInput, EmailProvider, RenderedEmail } from "./EmailProvider";
import { renderCartPublishedEmail } from "./render";

/**
 * Provedor de e-mail real via Resend (task 013, seção 12). Sem SDK — só uma
 * chamada REST (`POST /emails`), mesma disciplina de dependências já usada
 * para Supabase Storage (D40) e Mercado Pago: a superfície usada é pequena e
 * estável, e o SDK oficial não traria nada que o `fetch` já não resolva.
 */
const RESEND_API = "https://api.resend.com/emails";

export interface ResendOptions {
  apiKey?: string;
  /** Remetente completo, ex.: "Antero Cartas <cartas@anterosistemas.com.br>". */
  from?: string;
  fetchImpl?: typeof fetch;
}

interface ResendErrorBody {
  message?: string;
  name?: string;
}

export function createResendEmailProvider(options: ResendOptions = {}): EmailProvider {
  return {
    name: "resend",

    async sendCartPublished(input: CartPublishedEmailInput): Promise<RenderedEmail> {
      const apiKey = (options.apiKey ?? process.env.RESEND_API_KEY)?.trim();
      if (!apiKey) throw new Error("RESEND_API_KEY não configurada.");
      const from = (options.from ?? process.env.EMAIL_FROM)?.trim();
      if (!from) throw new Error("EMAIL_FROM não configurada.");
      const fetchImpl = options.fetchImpl ?? fetch;

      const rendered = renderCartPublishedEmail(input);

      const res = await fetchImpl(RESEND_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ResendErrorBody;
        throw new Error(`Resend recusou o envio: ${body.message ?? `HTTP ${res.status}`}`);
      }

      return rendered;
    },
  };
}
