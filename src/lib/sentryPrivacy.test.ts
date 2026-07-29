import { describe, it, expect } from "vitest";
import { sanitizeEvent, sanitizeUrl, scrubText, REDACTED } from "./sentryPrivacy";

describe("sanitizeUrl", () => {
  it("mascara o slug da carta — é o link privado", () => {
    expect(sanitizeUrl("https://cartas.anterosistemas.com.br/c/carta-da-ana-x9f2")).toBe(
      "https://cartas.anterosistemas.com.br/c/[slug]",
    );
  });

  it("mascara id de pedido, checkout e rotas de API", () => {
    expect(sanitizeUrl("/pedido/cmrzbq6fp000204l2vjhtgvzv/sucesso")).toBe(
      "/pedido/[orderId]/sucesso",
    );
    expect(sanitizeUrl("/checkout/cmrzbpt5c000104l2")).toBe("/checkout/[cartId]");
    expect(sanitizeUrl("/api/carts/cmrz5xxuo0000x4un/media")).toBe("/api/carts/[id]/media");
    expect(sanitizeUrl("/api/orders/cmrzbq6fp0002/mock-confirm")).toBe(
      "/api/orders/[id]/mock-confirm",
    );
  });

  it("descarta query string e fragmento — é onde token aparece", () => {
    expect(sanitizeUrl("/criar?token=jL2OvxGq8ZNQJDEV2L5iJr166Qj9iZ6C#topo")).toBe("/criar");
  });

  it("preserva a rota, que é o mínimo para diagnosticar", () => {
    expect(sanitizeUrl("/api/carts")).toBe("/api/carts");
  });
});

describe("scrubText", () => {
  it("remove e-mail completo", () => {
    expect(scrubText("falha ao enviar para maria.silva@exemplo.com.br")).toBe(
      `falha ao enviar para ${REDACTED}`,
    );
  });

  it("remove CPF com e sem máscara", () => {
    expect(scrubText("cpf 123.456.789-01 inválido")).toBe(`cpf ${REDACTED} inválido`);
    expect(scrubText("cpf 12345678901 inválido")).toBe(`cpf ${REDACTED} inválido`);
  });

  it("remove telefone com e sem DDI", () => {
    expect(scrubText("contato (11) 99999-8888")).toContain(REDACTED);
    expect(scrubText("contato (11) 99999-8888")).not.toContain("99999");
    expect(scrubText("contato +55 11 999998888")).toContain(REDACTED);
  });

  it("remove authorization bearer e token longo", () => {
    expect(scrubText("Bearer eyJhbGciOiJIUzI1NiJ9.abc")).toBe(REDACTED);
    expect(scrubText("token jL2OvxGq8ZNQJDEV2L5iJr166Qj9iZ6CfN-0OT9847o expirou")).toBe(
      `token ${REDACTED} expirou`,
    );
  });

  it("sanitiza URL embutida em texto livre", () => {
    expect(scrubText("erro ao abrir https://cartas.anterosistemas.com.br/c/segredo")).toBe(
      "erro ao abrir https://cartas.anterosistemas.com.br/c/[slug]",
    );
  });

  it("não destrói texto sem dado pessoal", () => {
    expect(scrubText("falha de rede ao salvar rascunho")).toBe(
      "falha de rede ao salvar rascunho",
    );
  });
});

describe("sanitizeEvent", () => {
  it("descarta o corpo da requisição — é onde a carta viaja", () => {
    const event = sanitizeEvent({
      request: {
        url: "https://cartas.anterosistemas.com.br/api/carts/abc",
        data: {
          title: "Feliz aniversário, amor",
          message: "Todo o texto da carta...",
          senderName: "João",
        },
      },
    });
    expect(event?.request?.data).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("aniversário");
    expect(JSON.stringify(event)).not.toContain("João");
  });

  it("descarta cookies e query_string", () => {
    const event = sanitizeEvent({
      request: {
        cookies: { cart_session: "abc123" },
        query_string: "token=segredo",
      },
    });
    expect(event?.request?.cookies).toBeUndefined();
    expect(event?.request?.query_string).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("segredo");
  });

  it("mantém só cabeçalhos permitidos e remove authorization e cookie", () => {
    const event = sanitizeEvent({
      request: {
        headers: {
          "user-agent": "Mozilla/5.0",
          "content-type": "application/json",
          authorization: "Bearer abc123",
          cookie: "cart_session=xyz",
          "x-cart-edit-token": "jL2OvxGq8ZNQJDEV2L5iJr166Qj9iZ6C",
        },
      },
    });
    expect(event?.request?.headers).toEqual({
      "user-agent": "Mozilla/5.0",
      "content-type": "application/json",
    });
  });

  it("mascara identificador privado no referer permitido", () => {
    const event = sanitizeEvent({
      request: {
        headers: { referer: "https://cartas.anterosistemas.com.br/c/segredo-do-link" },
      },
    });
    expect(event?.request?.headers?.referer).toBe(
      "https://cartas.anterosistemas.com.br/c/[slug]",
    );
  });

  it("limpa a mensagem da exceção", () => {
    const event = sanitizeEvent({
      exception: {
        values: [{ type: "Error", value: "falha ao notificar comprador@exemplo.com" }],
      },
    });
    expect(event?.exception?.values?.[0].value).toBe(`falha ao notificar ${REDACTED}`);
  });

  it("limpa breadcrumbs, inclusive URLs em data", () => {
    const event = sanitizeEvent({
      breadcrumbs: [
        {
          message: "POST para cliente@exemplo.com",
          data: { url: "/api/carts/cmrz5xxuo0000/media", status: "500" },
        },
      ],
    });
    expect(event?.breadcrumbs?.[0].message).toBe(`POST para ${REDACTED}`);
    expect(event?.breadcrumbs?.[0].data?.url).toBe("/api/carts/[id]/media");
    expect(event?.breadcrumbs?.[0].data?.status).toBe("500");
  });

  it("remove user e extra, mas preserva contexts do SDK", () => {
    const event = sanitizeEvent({
      user: { email: "a@b.com", ip_address: "200.1.2.3" },
      extra: { cartBody: "texto da carta" },
      contexts: { browser: { name: "Chrome" } },
    });
    expect(event?.user).toBeUndefined();
    expect(event?.extra).toBeUndefined();
    expect(event?.contexts).toEqual({ browser: { name: "Chrome" } });
  });

  it("sanitiza a URL da requisição", () => {
    const event = sanitizeEvent({
      request: { url: "https://cartas.anterosistemas.com.br/pedido/abc123/sucesso?x=1" },
    });
    expect(event?.request?.url).toBe(
      "https://cartas.anterosistemas.com.br/pedido/[orderId]/sucesso",
    );
  });

  it("descarta o evento em vez de enviá-lo sem limpeza se algo falhar", () => {
    const hostile = {
      get request(): never {
        throw new Error("getter hostil");
      },
    };
    expect(sanitizeEvent(hostile as never)).toBeNull();
  });
});
