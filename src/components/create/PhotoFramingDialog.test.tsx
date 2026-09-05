// @vitest-environment jsdom
/**
 * Diálogo de ajuste de enquadramento.
 *
 * O que precisa ficar preso aqui é o contrato com quem chama:
 *  - cancelar (botão ou Esc) NUNCA salva;
 *  - "Restaurar padrão" volta ao centro sem zoom, e salvar nesse estado
 *    devolve `null` — a foto volta a ser "sem metadados", igual às antigas;
 *  - salvar devolve valores normalizados e dentro de faixa;
 *  - o teclado consegue tudo o que o arraste consegue.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_FRAMING, type PhotoFraming } from "@/lib/photoFraming";
import { PhotoFramingDialog } from "./PhotoFramingDialog";

let container: HTMLDivElement;
let root: Root;
const onSave = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(framing: PhotoFraming | null = null) {
  act(() => {
    root = createRoot(container);
    root.render(
      <PhotoFramingDialog
        src="https://exemplo/foto.jpg"
        label="Foto 1"
        framing={framing}
        onCancel={onCancel}
        onSave={onSave}
      />,
    );
  });
  // Sem `load` a foto não tem dimensão natural e os eixos ficam inertes —
  // é assim que o componente evita controles que não fazem nada.
  const img = container.querySelector("img")!;
  Object.defineProperty(img, "naturalWidth", { value: 900, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: 1200, configurable: true }); // vertical
  act(() => {
    img.dispatchEvent(new Event("load"));
  });
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!found) throw new Error(`botão "${text}" não encontrado`);
  return found;
}

function slider(id: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`#${id}`)!;
}

/** Range controlado por React: o setter nativo é o único caminho confiável. */
function setSlider(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function photoStyle(): string {
  return container.querySelector("img")!.getAttribute("style") ?? "";
}

describe("abertura e acessibilidade", () => {
  it("abre como diálogo modal, rotulado pelo próprio título", () => {
    render();
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-labelledby")).toBe("ajuste-foto-titulo");
    expect(container.querySelector("#ajuste-foto-titulo")?.textContent).toBe("Ajustar foto");
  });

  it("a moldura é focável e descreve o que fazer", () => {
    render();
    const frame = container.querySelector<HTMLElement>("[role='group']")!;
    expect(frame.tabIndex).toBe(0);
    expect(frame.getAttribute("aria-label")).toBe("Enquadramento de Foto 1");
    expect(container.querySelector("#ajuste-foto-ajuda")?.textContent).toContain("setas");
  });

  it("mostra a foto já com o enquadramento atual", () => {
    render({ x: 0.4, y: 0.1, zoom: 2 });
    expect(photoStyle()).toContain("object-position: 40% 10%");
    expect(photoStyle()).toContain("scale(2)");
  });
});

describe("cancelar", () => {
  it("o botão Cancelar fecha sem salvar", () => {
    render({ x: 0.2, y: 0.2, zoom: 1.5 });
    setSlider(slider("ajuste-foto-zoom"), 2.4); // mexe antes de desistir
    act(() => button("Cancelar").click());

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Esc (evento cancel do <dialog>) também descarta", () => {
    render();
    const dialog = container.querySelector("dialog")!;
    act(() => {
      dialog.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("restaurar padrão", () => {
  it("volta ao centro sem zoom", () => {
    render({ x: 0.1, y: 0.9, zoom: 2.2 });
    act(() => button("Restaurar padrão").click());

    expect(photoStyle()).not.toContain("transform");
    expect(photoStyle()).not.toContain("object-position");
  });

  it("salvar depois de restaurar devolve null — a foto volta a ser 'sem ajuste'", () => {
    render({ x: 0.1, y: 0.9, zoom: 2.2 });
    act(() => button("Restaurar padrão").click());
    act(() => button("Salvar ajuste").click());

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("fica desabilitado quando já não há ajuste nenhum", () => {
    render(null);
    expect(button("Restaurar padrão").disabled).toBe(true);
  });
});

describe("salvar", () => {
  it("devolve os valores normalizados escolhidos", () => {
    render();
    setSlider(slider("ajuste-foto-zoom"), 1.8);
    setSlider(slider("ajuste-foto-y"), 0.15);
    act(() => button("Salvar ajuste").click());

    expect(onSave).toHaveBeenCalledWith({ x: DEFAULT_FRAMING.x, y: 0.15, zoom: 1.8 });
  });

  it("nunca devolve valor fora de faixa, mesmo com o range forçado", () => {
    render();
    setSlider(slider("ajuste-foto-zoom"), 99);
    act(() => button("Salvar ajuste").click());

    const [saved] = onSave.mock.calls[0] as [PhotoFraming];
    expect(saved.zoom).toBeLessThanOrEqual(3);
  });

  it("salvar sem mexer em nada devolve null (não inventa metadados)", () => {
    render(null);
    act(() => button("Salvar ajuste").click());
    expect(onSave).toHaveBeenCalledWith(null);
  });
});

describe("teclado e arraste", () => {
  it("as setas movem a área visível da foto", () => {
    render();
    const frame = container.querySelector<HTMLElement>("[role='group']")!;
    act(() => {
      frame.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      frame.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });

    // Dois passos de 2% para cima a partir do centro.
    expect(photoStyle()).toContain("object-position: 50% 46%");
  });

  it("teclas sem função no editor não são capturadas", () => {
    render();
    const frame = container.querySelector<HTMLElement>("[role='group']")!;
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => {
      frame.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("o eixo sem sobra fica desabilitado: numa foto vertical, o horizontal", () => {
    render(); // 900×1200 numa moldura 4:3 → sobra só na vertical
    expect(slider("ajuste-foto-x").disabled).toBe(true);
    expect(slider("ajuste-foto-y").disabled).toBe(false);
  });

  it("com zoom passa a haver curso nos dois eixos", () => {
    render();
    setSlider(slider("ajuste-foto-zoom"), 2);
    expect(slider("ajuste-foto-x").disabled).toBe(false);
  });
});
