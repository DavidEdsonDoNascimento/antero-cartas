// @vitest-environment jsdom
/**
 * Confiabilidade do rascunho na jornada de criação — regressões.
 *
 * A prioridade aqui é uma só: o que a pessoa escreveu não pode se perder, e o
 * checkout não pode receber dados antigos. Cada caso reproduz um defeito visto
 * no código (auditoria de 2026-11-01): debounce cancelado ao sair da tela,
 * nenhuma nova tentativa depois de uma falha, salvamentos concorrentes, resposta
 * de foto substituindo a carta inteira e avanço ao checkout com o salvamento
 * falho. Só a rede é simulada: localStorage, estado e componentes são reais.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Cart, CartMedia } from "@/lib/types";

const patchCart = vi.fn();
const fetchCart = vi.fn();
const createDraft = vi.fn();
const removePhoto = vi.fn();
const reorderPhotos = vi.fn();
const uploadPhoto = vi.fn();
const routerPush = vi.fn();

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/card/CardPreview", () => ({ CardPreview: () => null }));
vi.mock("./MusicPicker", () => ({ MusicPicker: () => null }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  patchCart: (...args: unknown[]) => patchCart(...args),
  fetchCart: (...args: unknown[]) => fetchCart(...args),
  createDraft: (...args: unknown[]) => createDraft(...args),
  removePhoto: (...args: unknown[]) => removePhoto(...args),
  reorderPhotos: (...args: unknown[]) => reorderPhotos(...args),
  uploadPhoto: (...args: unknown[]) => uploadPhoto(...args),
}));
vi.mock("@/lib/image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image")>()),
  createPhotoReader: (file: File) => ({ prefetch: () => {}, read: async () => file }),
  preparePhotoForUpload: async (file: File) => ({ blob: file, original: false }),
}));

const { CreateFlow } = await import("./CreateFlow");
const { ApiClientError } = await import("@/lib/api");
const { resetCartInitPrefetch } = await import("@/lib/draftInit");

const SESSION = { cartId: "cart-1", editToken: "tok" };

function media(id: string, position: number): CartMedia {
  return {
    id,
    cartId: "cart-1",
    type: "photo",
    url: `/api/media/carts/cart-1/${id}.jpg`,
    storageKey: `carts/cart-1/${id}.jpg`,
    position,
    framing: null,
    createdAt: "2026-11-01T00:00:00.000Z",
  };
}

/** Carta que já passa pela validação de todas as etapas. */
const CART: Cart = {
  id: "cart-1",
  slug: null,
  status: "DRAFT",
  recipientType: "mae",
  recipientName: "",
  occasion: "aniversario",
  title: "Para você",
  message: "Mensagem antiga",
  senderName: "Lucas",
  signature: "",
  theme: "romantico",
  music: null,
  relationshipStartDate: null,
  showRelationshipCounter: false,
  planType: null,
  media: [],
  expiresAt: null,
  publishedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;

const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
const text = () => container.textContent ?? "";

function button(label: string | RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) =>
    typeof label === "string" ? b.textContent?.includes(label) : label.test(b.textContent ?? ""),
  );
  if (!found) throw new Error(`Botão não encontrado: ${label}\n${text()}`);
  return found;
}

async function click(label: string | RegExp) {
  await act(async () => button(label).click());
}

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const messageField = () => container.querySelector("textarea") as HTMLTextAreaElement;

/** Abre o editor retomando um rascunho, na etapa 1. */
async function openEditor(cart: Cart = CART) {
  localStorage.setItem("antero:session", JSON.stringify(SESSION));
  fetchCart.mockResolvedValue({ cart });
  await act(async () => root.render(<CreateFlow />));
  await tick();
  await click("Continuar esse rascunho");
}

/** Salvamento bem-sucedido: devolve a carta com um `updatedAt` novo, como o servidor. */
function serverAccepts() {
  let n = 0;
  return async () => ({
    cart: { ...CART, updatedAt: `2026-11-01T00:00:${String(++n % 60).padStart(2, "0")}.000Z` },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  resetCartInitPrefetch();
  patchCart.mockImplementation(serverAccepts());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("status do salvamento", () => {
  it('não mostra "Salvando…" quando nada está sendo salvo', async () => {
    await openEditor();
    await tick(5000);

    expect(text()).not.toContain("Salvando");
    expect(patchCart).not.toHaveBeenCalled();
  });

  it("vai de salvando para salvo", async () => {
    await openEditor();
    await click("Próxima etapa");
    await type(messageField(), "Mensagem nova");
    expect(text()).toContain("Salvando");

    await tick(1000);

    expect(text()).not.toContain("Salvando");
    expect(text()).toContain("Salvo");
  });

  it('tocar de novo na opção já escolhida não deixa "Salvando…" preso na tela', async () => {
    await openEditor();
    await click("Mãe");
    await tick(5000);

    expect(text()).not.toContain("Salvando");
    expect(patchCart).not.toHaveBeenCalled();
  });

  it("voltar ao texto já salvo não dispara salvamento nem fica em andamento", async () => {
    await openEditor();
    await click("Próxima etapa");
    await type(messageField(), "Mensagem antiga!");
    await type(messageField(), "Mensagem antiga");
    await tick(5000);

    expect(patchCart).not.toHaveBeenCalled();
    expect(text()).not.toContain("Salvando");
    // O texto desfeito não pode voltar como "recuperado" na próxima visita.
    expect(localStorage.getItem("antero:draft:unsynced")).toBeNull();
  });

  it("avisa leitores de tela do erro e da recuperação, não de cada salvamento", async () => {
    await openEditor();
    await click("Próxima etapa");
    await type(messageField(), "Primeira versão");
    await tick(1000);

    const live = () => container.querySelector('[data-save-announcer="true"]');
    expect(live()?.getAttribute("role")).toBe("status");
    expect(live()?.textContent).toBe("");

    patchCart.mockRejectedValue(new ApiClientError("unauthorized", "Token inválido.", 401));
    await type(messageField(), "Segunda versão");
    await tick(1000);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível salvar");

    patchCart.mockImplementation(serverAccepts());
    await click("Tentar de novo");
    await tick();
    expect(live()?.textContent).toContain("salvas");
  });
});

describe("digitação rápida seguida de navegação", () => {
  it("sair da tela antes do fim do debounce ainda envia o último texto", async () => {
    await openEditor();
    await click("Próxima etapa");
    await type(messageField(), "Escrevi e saí correndo");

    await tick(100); // bem antes do fim do debounce de 700 ms
    await act(async () => root.unmount());
    await tick(5000);
    root = createRoot(container);

    expect(patchCart).toHaveBeenCalledTimes(1);
    expect(patchCart.mock.calls[0][2]).toMatchObject({ message: "Escrevi e saí correndo" });
  });

  it("guarda o texto no aparelho antes de qualquer resposta do servidor", async () => {
    patchCart.mockReturnValue(new Promise(() => {})); // rede pendurada
    await openEditor();
    await click("Próxima etapa");
    await type(messageField(), "Guardado já");

    expect(localStorage.getItem("antero:draft:unsynced")).toContain("Guardado já");
  });
});

describe("retomada após interrupção", () => {
  it("recupera o texto que nunca chegou ao servidor e o sincroniza", async () => {
    patchCart.mockReturnValue(new Promise(() => {})); // aba fecha com a rede pendurada
    await openEditor();
    await click("Próxima etapa");
    await type(messageField(), "Texto que quase se perdeu");
    await act(async () => root.unmount());

    // Nova visita: o servidor ainda tem a versão antiga.
    root = createRoot(container);
    resetCartInitPrefetch();
    patchCart.mockReset();
    patchCart.mockImplementation(serverAccepts());
    await openEditor();
    await click("Próxima etapa");

    expect(messageField().value).toBe("Texto que quase se perdeu");
    expect(text()).toContain("Recuperamos");
    await tick(1000);
    expect(patchCart.mock.lastCall?.[2]).toMatchObject({ message: "Texto que quase se perdeu" });
    expect(localStorage.getItem("antero:draft:unsynced")).toBeNull();
  });

  it("texto que chegou ao servidor, sem resposta, não é tratado como recuperado", async () => {
    const message = "Chegou, só a resposta se perdeu";
    patchCart.mockReturnValue(new Promise(() => {}));
    await openEditor();
    await click("Próxima etapa");
    await type(messageField(), message);
    await act(async () => root.unmount());

    root = createRoot(container);
    resetCartInitPrefetch();
    patchCart.mockReset();
    await openEditor({ ...CART, message });

    expect(text()).not.toContain("Recuperamos");
    expect(localStorage.getItem("antero:draft:unsynced")).toBeNull();
    await tick(5000);
    expect(patchCart).not.toHaveBeenCalled();
  });

  it("carta que sumiu do servidor: o texto não salvo abre numa carta nova, com aviso", async () => {
    localStorage.setItem("antero:session", JSON.stringify(SESSION));
    localStorage.setItem(
      "antero:draft:unsynced",
      JSON.stringify({ cartId: "cart-1", patch: { message: "Salvo só aqui" } }),
    );
    fetchCart.mockRejectedValue(new ApiClientError("not_found", "Não encontrado.", 404));
    createDraft.mockImplementation(async (patch: { message: string }) => ({
      cart: { ...CART, id: "cart-2", ...patch },
      editToken: "tok2",
    }));

    await act(async () => root.render(<CreateFlow />));
    await tick();
    await click("Próxima etapa");

    expect(messageField().value).toBe("Salvo só aqui");
    expect(text()).toContain("Recuperamos");
    expect(JSON.parse(localStorage.getItem("antero:session")!).cartId).toBe("cart-2");
  });

  it("não aplica alterações guardadas de outra carta", async () => {
    localStorage.setItem(
      "antero:draft:unsynced",
      JSON.stringify({ cartId: "outra", patch: { message: "De outra carta" } }),
    );
    await openEditor();
    await click("Próxima etapa");

    expect(messageField().value).toBe("Mensagem antiga");
    expect(localStorage.getItem("antero:draft:unsynced")).toBeNull();
  });

  it("uma falha de rede ao retomar mantém a sessão, em vez de abandonar o rascunho", async () => {
    localStorage.setItem("antero:session", JSON.stringify(SESSION));
    fetchCart.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => root.render(<CreateFlow />));
    await tick();

    expect(createDraft).not.toHaveBeenCalled();
    expect(localStorage.getItem("antero:session")).not.toBeNull();
    expect(text()).toContain("Tentar novamente");

    fetchCart.mockResolvedValue({ cart: CART });
    await click("Tentar novamente");
    await tick();
    expect(text()).toContain("Continuar esse rascunho");
  });
});

describe("falhas e novas tentativas", () => {
  it("tenta de novo sozinho depois de uma falha de rede", async () => {
    patchCart.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await openEditor();
    await click("Próxima etapa");
    await type(messageField(), "Sobrevive à queda");

    await tick(10_000);

    expect(patchCart).toHaveBeenCalledTimes(2);
    expect(patchCart.mock.calls[1][2]).toMatchObject({ message: "Sobrevive à queda" });
    expect(text()).toContain("Salvo");
    expect(localStorage.getItem("antero:draft:unsynced")).toBeNull();
  });

  it("erro definitivo não repete sozinho: explica e oferece tentar de novo", async () => {
    patchCart.mockRejectedValue(new ApiClientError("unauthorized", "Token inválido.", 401));
    await openEditor();
    await click("Próxima etapa");
    await type(messageField(), "Texto importante");

    await tick(60_000);

    expect(patchCart).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Não foi possível salvar");
    expect(messageField().value).toBe("Texto importante");
    // O texto continua guardado para a próxima visita.
    expect(localStorage.getItem("antero:draft:unsynced")).toContain("Texto importante");

    patchCart.mockImplementation(serverAccepts());
    await click("Tentar de novo");
    await tick();
    expect(patchCart).toHaveBeenCalledTimes(2);
    expect(text()).toContain("Salvo");
  });
});

describe("ordem dos salvamentos", () => {
  it("nunca há dois salvamentos em andamento e o último texto vence", async () => {
    const first = deferred<{ cart: Cart }>();
    patchCart.mockReturnValueOnce(first.promise);
    await openEditor();
    await click("Próxima etapa");

    await type(messageField(), "versão 1");
    await tick(800);
    expect(patchCart).toHaveBeenCalledTimes(1);

    await type(messageField(), "versão 2");
    await tick(800);
    await type(messageField(), "versão 3");
    await tick(800);
    expect(patchCart).toHaveBeenCalledTimes(1); // v2 e v3 esperam a v1 terminar
    expect(text()).toContain("Salvando");

    first.resolve({ cart: { ...CART, updatedAt: "2026-11-01T00:01:00.000Z" } });
    await tick(800);

    expect(patchCart).toHaveBeenCalledTimes(2); // v2 foi absorvida pela v3
    expect(patchCart.mock.calls[1][2]).toMatchObject({ message: "versão 3" });
    expect(text()).toContain("Salvo");
  });

  it('resposta de um texto antigo não anuncia "Salvo" enquanto há texto novo pendente', async () => {
    const first = deferred<{ cart: Cart }>();
    const second = deferred<{ cart: Cart }>();
    patchCart.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await openEditor();
    await click("Próxima etapa");

    await type(messageField(), "antigo");
    await tick(800);
    await type(messageField(), "novo");
    first.resolve({ cart: { ...CART, updatedAt: "2026-11-01T00:01:00.000Z" } });
    await tick(800);

    expect(text()).toContain("Salvando");
    expect(text()).not.toContain("✓ Salvo");
    expect(localStorage.getItem("antero:draft:unsynced")).toContain("novo");

    second.resolve({ cart: { ...CART, updatedAt: "2026-11-01T00:02:00.000Z" } });
    await tick();
    expect(text()).toContain("Salvo");
  });

  it("a resposta de um salvamento nunca sobrescreve o que está na tela", async () => {
    const first = deferred<{ cart: Cart }>();
    patchCart.mockReturnValueOnce(first.promise);
    await openEditor();
    await click("Próxima etapa");

    await type(messageField(), "digitando");
    await tick(800);
    await type(messageField(), "digitando mais");
    first.resolve({ cart: { ...CART, message: "digitando" } });
    await tick();

    expect(messageField().value).toBe("digitando mais");
  });
});

describe("fotos durante a edição da mensagem", () => {
  const withPhotos: Cart = { ...CART, media: [media("m1", 0), media("m2", 1)] };

  it("a resposta de uma remoção não desfaz o texto recém-digitado", async () => {
    const removal = deferred<{ cart: Cart }>();
    removePhoto.mockReturnValue(removal.promise);
    await openEditor(withPhotos);
    await click("Próxima etapa");
    await type(messageField(), "Texto novo antes de remover a foto");
    await click("Próxima etapa"); // vai às fotos antes do debounce terminar

    await act(async () => {
      (container.querySelector('[aria-label="Remover foto 1"]') as HTMLButtonElement).click();
    });
    // O servidor responde com a carta como a conhecia: texto antigo.
    removal.resolve({ cart: { ...withPhotos, media: [media("m2", 0)] } });
    await tick();
    await click("Voltar");

    expect(messageField().value).toBe("Texto novo antes de remover a foto");
    await tick(1000);
    expect(patchCart.mock.lastCall?.[2]).toMatchObject({
      message: "Texto novo antes de remover a foto",
    });
  });

  it("reordenar que falha desfaz só as fotos, nunca o texto", async () => {
    const order = deferred<{ cart: Cart }>();
    reorderPhotos.mockReturnValue(order.promise);
    await openEditor(withPhotos);
    await click("Próxima etapa");
    await type(messageField(), "Texto novo antes de reordenar");
    await click("Próxima etapa");

    await act(async () => {
      (container.querySelector('[aria-label="Definir foto 2 como capa"]') as HTMLButtonElement).click();
    });
    order.reject(new ApiClientError("server", "Erro.", 500));
    await tick();
    await click("Voltar");

    expect(messageField().value).toBe("Texto novo antes de reordenar");
  });

  it("reordenar que falha não desfaz o que mudou enquanto a resposta não vinha", async () => {
    const order = deferred<{ cart: Cart }>();
    reorderPhotos.mockReturnValue(order.promise);
    await openEditor(withPhotos);
    await click("Próxima etapa");
    await click("Próxima etapa");

    await act(async () => {
      (container.querySelector('[aria-label="Definir foto 2 como capa"]') as HTMLButtonElement).click();
    });
    await click("Mostrar contador de tempo juntos");
    order.reject(new ApiClientError("server", "Erro.", 500));
    await tick();

    expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    const srcs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs[0]).toContain("m1"); // as fotos, sim, voltaram à ordem anterior
  });
});

describe("fotos que não chegaram ao servidor", () => {
  const photoError = () => new ApiClientError("server", "Erro.", 500);

  async function selectPhoto(upload: Promise<unknown> | Error) {
    uploadPhoto.mockImplementationOnce(() =>
      upload instanceof Error ? Promise.reject(upload) : upload,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await tick();
  }

  beforeEach(() => {
    URL.createObjectURL = () => "blob:x";
    URL.revokeObjectURL = () => {};
  });

  const atPhotos = () => text().includes("Personalize a cartinha");

  it("não deixa sair da etapa enquanto a foto está sendo enviada", async () => {
    const upload = deferred<{ cart: Cart }>();
    await openEditor();
    await click("Próxima etapa");
    await click("Próxima etapa");
    await selectPhoto(upload.promise);

    await click("Próxima etapa");
    expect(atPhotos()).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Aguarde o envio");

    upload.resolve({ cart: { ...CART, media: [media("m1", 0)] } });
    await tick();
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await click("Próxima etapa");
    expect(atPhotos()).toBe(false);
  });

  it("foto que falhou não segue em silêncio: pede para tentar de novo ou remover", async () => {
    await openEditor();
    await click("Próxima etapa");
    await click("Próxima etapa");
    await selectPhoto(photoError());
    expect(text()).toContain("Falhou");

    await click("Próxima etapa");
    expect(atPhotos()).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("não foi enviada");

    await click("Voltar");
    expect(atPhotos()).toBe(true);

    // Sair é sempre possível: remover a foto é uma decisão consciente.
    await click("Remover");
    await click("Próxima etapa");
    expect(atPhotos()).toBe(false);
  });

  it("tentar de novo com sucesso libera o avanço, com a foto na carta", async () => {
    await openEditor();
    await click("Próxima etapa");
    await click("Próxima etapa");
    await selectPhoto(photoError());

    uploadPhoto.mockResolvedValueOnce({ cart: { ...CART, media: [media("m1", 0)] } });
    await click("Tentar de novo");
    await tick();

    await click("Próxima etapa");
    expect(atPhotos()).toBe(false);
    expect(text()).toContain("1 foto(s)");
  });

  it("nenhuma foto falha chega à escolha de plano", async () => {
    await openEditor();
    await click("Próxima etapa");
    await click("Próxima etapa");
    await selectPhoto(photoError());

    await click("Próxima etapa");
    expect(text()).not.toContain("Finalizar minha cartinha");
    expect(text()).not.toContain("Continuar para o pagamento");
  });
});

describe("avanço ao checkout", () => {
  /** Da etapa 1 até a escolha de plano, com o plano selecionado. */
  async function goToPlan() {
    await click("Próxima etapa");
    await click("Próxima etapa");
    await click("Próxima etapa");
    await click("Finalizar minha cartinha");
    await click("Essencial");
  }

  it("só navega depois que o servidor confirma o plano e o texto", async () => {
    const save = deferred<{ cart: Cart }>();
    patchCart.mockReturnValueOnce(save.promise);
    await openEditor();
    await goToPlan();

    await click("Continuar para o pagamento");
    await tick();

    expect(patchCart.mock.calls[0][2]).toMatchObject({ planType: "LIMITED" });
    expect(routerPush).not.toHaveBeenCalled();

    save.resolve({ cart: { ...CART, planType: "LIMITED" } });
    await tick();
    expect(routerPush).toHaveBeenCalledWith("/checkout/cart-1");
  });

  it("não avança em silêncio quando o salvamento falha, e deixa tentar de novo", async () => {
    patchCart.mockRejectedValue(new ApiClientError("server", "Erro interno.", 500));
    await openEditor();
    await goToPlan();

    await click("Continuar para o pagamento");
    await tick(60_000);

    expect(routerPush).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível salvar");

    patchCart.mockImplementation(serverAccepts());
    await click("Continuar para o pagamento");
    await tick();
    expect(routerPush).toHaveBeenCalledWith("/checkout/cart-1");
  });

  it("sair da tela durante a confirmação não leva ao checkout depois", async () => {
    const save = deferred<{ cart: Cart }>();
    patchCart.mockReturnValueOnce(save.promise);
    await openEditor();
    await goToPlan();
    await click("Continuar para o pagamento");

    await act(async () => root.unmount());
    save.resolve({ cart: { ...CART, planType: "LIMITED" } });
    await tick();
    root = createRoot(container);

    expect(routerPush).not.toHaveBeenCalled();
  });

  it("não reenvia nada quando tudo já está salvo", async () => {
    await openEditor({ ...CART, planType: "LIMITED" });
    await click("Próxima etapa");
    await click("Próxima etapa");
    await click("Próxima etapa");
    await click("Finalizar minha cartinha");

    await click("Continuar para o pagamento");
    await tick();

    expect(patchCart).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith("/checkout/cart-1");
  });

  it("dois toques no botão não navegam nem salvam em dobro", async () => {
    const save = deferred<{ cart: Cart }>();
    patchCart.mockReturnValueOnce(save.promise);
    await openEditor();
    await goToPlan();

    const cta = button("Continuar para o pagamento");
    await act(async () => {
      cta.click();
      cta.click();
    });
    save.resolve({ cart: { ...CART, planType: "LIMITED" } });
    await tick();

    expect(patchCart).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledTimes(1);
  });
});
