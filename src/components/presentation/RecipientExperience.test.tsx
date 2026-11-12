// @vitest-environment jsdom
/**
 * Abertura da carta 2.0 (`RecipientExperience`): o próprio envelope é o botão
 * que abre; selo de música discreto no envelope fechado; movimento reduzido,
 * foco, música só depois do gesto e fallback sem JavaScript.
 *
 * Limite do jsdom: ele não transforma Enter/Espaço em `click` num botão. O que
 * se testa aqui é que o controle é um `<button>` nativo e focável (que o
 * navegador ativa com as duas teclas); o teclado de verdade, o toque e o foco
 * visível foram exercitados no Chrome (ver o relatório).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PRESENTATION_IDS, getPreset, type PresentationId } from "@/content/presentation/presets";
import type { LetterContent } from "@/components/letter/LetterSheet";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
const { track } = await import("@/lib/analytics");
const { RecipientExperience } = await import("./RecipientExperience");

const MUSIC: LetterContent["music"] = {
  videoId: "abc123XYZab",
  youtubeUrl: "https://www.youtube.com/watch?v=abc123XYZab",
  title: "Canção",
  source: "manual",
};

const LETTER: LetterContent = {
  title: "Para Ana",
  recipientName: "Ana",
  message: "Mensagem inteira da carta",
  senderName: "Lucas",
  signature: "Com carinho",
  media: [],
  music: MUSIC,
  relationshipStartDate: null,
  showRelationshipCounter: false,
};

let container: HTMLDivElement;
let root: Root;
let reduced = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(track).mockClear();
  reduced = false;
  window.matchMedia = ((q: string) => ({
    matches: q.includes("reduce") && reduced,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof IntersectionObserver;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

interface Options {
  letter?: LetterContent;
  style?: PresentationId;
  preview?: boolean;
}

function element({ letter = LETTER, style = "romantico", preview = false }: Options = {}) {
  return (
    <RecipientExperience
      letter={letter}
      preset={getPreset(style)}
      effect="petalas"
      scene={<div data-testid="scene" />}
      envelope={<div data-testid="envelope" />}
      // Como no uso real: o editor (preview) não passa o botão de compartilhar.
      share={preview ? undefined : <button type="button">Compartilhar que ganhei</button>}
      preview={preview}
      onClose={preview ? () => {} : undefined}
    />
  );
}

function render(options?: Options) {
  act(() => root.render(element(options)));
}

const envelopeButton = () => container.querySelector<HTMLButtonElement>("button.ps-stage__hit")!;
const letterBlock = () => container.querySelector<HTMLElement>(".ps-open")!;
const musicTag = () => container.querySelector('[data-testid="music-tag"]');
const withoutMusic: LetterContent = { ...LETTER, music: null };

describe("envelope como botão", () => {
  it("é um <button> nativo, focável, com nome acessível e dentro do palco do envelope", () => {
    render();
    const b = envelopeButton();
    expect(b.tagName).toBe("BUTTON");
    expect(b.type).toBe("button");
    expect(b.tabIndex).toBe(0);
    expect(b.getAttribute("aria-label")).toBe("Abrir a cartinha para Ana");
    expect(b.closest(".ps-stage__art")).not.toBeNull();
    expect(b.closest("[aria-hidden='true']")).toBeNull(); // o envelope decorativo é aria-hidden; o botão não
    act(() => b.focus());
    expect(document.activeElement).toBe(b);
  });

  it("sem nome do destinatário, o nome acessível é genérico", () => {
    render({ letter: { ...LETTER, recipientName: "  " } });
    expect(envelopeButton().getAttribute("aria-label")).toBe("Abrir a cartinha");
  });

  it("o botão de texto antigo e o aviso de música antigo não existem mais", () => {
    render();
    expect([...container.querySelectorAll("button")].some((b) => /Abrir minha carta|Abrindo…/.test(b.textContent ?? ""))).toBe(false);
    // O bloco textual antigo saiu inteiro (nem visível, nem escondido).
    expect(container.textContent).not.toContain("Esta cartinha tem música. Ela começa quando você abrir.");
    expect(container.textContent).not.toContain("Ela começa quando você abrir");
    expect(container.querySelector(".ps-plaque--muted")).toBeNull();
  });

  it("mostra a dica discreta (não é um botão)", () => {
    render();
    const hint = container.querySelector(".ps-hint")!;
    expect(hint.textContent).toBe("Toque no envelope para abrir sua cartinha");
    expect(hint.closest("button")).toBeNull();
    expect(hint.tagName).toBe("P");
  });

  it("clicar no envelope abre; a música monta no próprio clique (gesto do usuário)", () => {
    render();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('[data-state="closed"]')).not.toBeNull();
    expect(letterBlock().hidden).toBe(true);

    act(() => envelopeButton().click());
    // Síncrono ao clique: o iframe com autoplay já está montado (mesma regra da carta legada).
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(container.querySelector('[data-state="opening"]')).not.toBeNull();
    expect(letterBlock().hidden).toBe(false);
  });

  it("toque (sequência de ponteiro de um dedo seguida do clique sintetizado) abre", () => {
    render();
    const b = envelopeButton();
    act(() => {
      b.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      b.dispatchEvent(new Event("pointerup", { bubbles: true }));
      b.click(); // o navegador sintetiza o clique no fim do toque
    });
    expect(container.querySelector('[data-state="opening"]')).not.toBeNull();
  });

  it("a abertura acontece uma única vez, mesmo com vários cliques no mesmo instante", () => {
    render();
    const b = envelopeButton();
    act(() => {
      b.click();
      b.click();
      b.click();
    });
    expect(vi.mocked(track).mock.calls.filter(([name]) => name === "cart_opened")).toHaveLength(1);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("durante a animação: aria-disabled, sem nova ativação, aviso de status e dica fora de cena", () => {
    render();
    act(() => envelopeButton().click());
    const b = envelopeButton();
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.disabled).toBe(false); // o foco não se perde
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Abrindo a cartinha…");
    expect(container.querySelector(".ps-closed")?.getAttribute("data-opening")).toBe("true");

    act(() => b.click());
    expect(vi.mocked(track).mock.calls.filter(([name]) => name === "cart_opened")).toHaveLength(1);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("ao terminar: carta, efeitos e foco no título; o envelope sai", () => {
    render();
    act(() => envelopeButton().click());
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector(".ps-closed")).toBeNull();
    expect(container.querySelector("button.ps-stage__hit")).toBeNull();
    expect(container.querySelector(".ps-fx[data-play]")).not.toBeNull();
    expect(container.textContent).toContain("Compartilhar que ganhei");
    act(() => vi.advanceTimersByTime(100));
    expect(document.activeElement?.classList.contains("ps-sheet__title")).toBe(true);
    expect(container.querySelector("h1")?.textContent).toBe("Para Ana");
  });

  it("com movimento reduzido, abre na hora (sem etapa de animação)", () => {
    reduced = true;
    render();
    act(() => envelopeButton().click());
    expect(container.querySelector(".ps-closed")).toBeNull();
    expect(container.querySelector('[data-state="opening"]')).toBeNull();
    expect(letterBlock().hidden).toBe(false);
    act(() => vi.advanceTimersByTime(100));
    expect(document.activeElement?.classList.contains("ps-sheet__title")).toBe(true);
  });
});

describe("selo de música do envelope fechado", () => {
  it("carta com música: pílula discreta com texto curto e texto acessível", () => {
    render();
    const tag = musicTag()!;
    expect(tag).not.toBeNull();
    expect(tag.textContent).toContain("Uma música especial");
    expect(tag.querySelector(".ps-sr")?.textContent).toBe(
      "Esta cartinha vem com uma música, que começa quando você abrir o envelope.",
    );
    // só o texto acessível é lido: o visível e as notinhas são decorativos
    expect(tag.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThanOrEqual(4);
    expect(tag.querySelector("button, a, audio, iframe, [role='slider']")).toBeNull(); // não é player
  });

  it("não está dentro do botão do envelope nem do palco (não bloqueia o toque)", () => {
    render();
    expect(musicTag()!.closest(".ps-stage")).toBeNull();
    expect(envelopeButton().contains(musicTag())).toBe(false);
  });

  it("carta sem música: nada é renderizado", () => {
    render({ letter: withoutMusic });
    expect(musicTag()).toBeNull();
    expect(container.textContent).not.toContain("Uma música especial");
    expect(container.querySelector(".ps-music-tag")).toBeNull();
  });

  it("no envelope fechado não há player nem equalizador: nada soa antes de abrir", () => {
    render();
    expect(container.querySelector("iframe, audio, video")).toBeNull();
    expect(musicTag()!.innerHTML).not.toMatch(/equalizer|bar|pulse|wave/i);
  });

  it("o selo e a dica saem do HTML ao abrir (a carta tem o player próprio depois)", () => {
    render();
    act(() => envelopeButton().click());
    act(() => vi.advanceTimersByTime(2000));
    expect(musicTag()).toBeNull();
    expect(container.querySelector("#musica-da-cartinha iframe")).not.toBeNull();
  });
});

/**
 * Indicador flutuante antigo ("Com música" / "Ir para música", canto inferior
 * esquerdo, só no celular por `lg:hidden`): com o envelope fechado o aviso de
 * música é só o selo novo; depois de aberta, o comportamento de sempre.
 * O jsdom não avalia CSS, então aqui se confere a PRESENÇA no DOM; que o
 * indicador some no desktop por `lg:hidden` é conferido pela classe do contêiner
 * e, de verdade, no Chrome (relatório).
 */
describe("indicador flutuante de música (sem duplicar o selo)", () => {
  const closedBadge = () => container.querySelector('[role="img"][aria-label="Esta cartinha tem música"]');
  const openedBadge = () => container.querySelector('a[href="#musica-da-cartinha"]');
  const dock = () => container.querySelectorAll(".card-float-dock");
  const seal = () => container.querySelector('.card-float-dock a[href="/criar"]');

  it("fechado, com música: só o selo novo (nenhum 'Com música' flutuante)", () => {
    render();
    expect(musicTag()).not.toBeNull();
    expect(closedBadge()).toBeNull();
    expect(openedBadge()).toBeNull();
    expect(container.textContent).not.toContain("Com música");
    expect(seal()).not.toBeNull(); // o selo flutuante de criação não foi tocado
  });

  it("fechado, sem música: nenhum indicador de música, de nenhum tipo", () => {
    render({ letter: withoutMusic });
    expect(musicTag()).toBeNull();
    expect(closedBadge()).toBeNull();
    expect(openedBadge()).toBeNull();
    expect(container.textContent).not.toContain("música");
  });

  it("abrindo, com música: o indicador antigo continua fora (o selo novo sai por opacidade)", () => {
    render();
    act(() => envelopeButton().click());
    expect(container.querySelector('[data-state="opening"]')).not.toBeNull();
    expect(closedBadge()).toBeNull();
    expect(openedBadge()).toBeNull();
    expect(container.querySelector(".ps-closed")?.getAttribute("data-opening")).toBe("true");
  });

  it("aberta, com música: o atalho 'Ir para música' aparece, como sempre; o selo novo some", () => {
    render();
    act(() => envelopeButton().click());
    act(() => vi.advanceTimersByTime(2000));
    expect(musicTag()).toBeNull();
    expect(closedBadge()).toBeNull(); // só a versão "aberta" do indicador existe
    const link = openedBadge() as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toContain("Ir para música");
    expect(container.querySelector("#musica-da-cartinha iframe")).not.toBeNull();
  });

  it("aberta, sem música: nenhum indicador", () => {
    render({ letter: withoutMusic });
    act(() => envelopeButton().click());
    act(() => vi.advanceTimersByTime(2000));
    expect(openedBadge()).toBeNull();
    expect(closedBadge()).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("com movimento reduzido (abre direto): o indicador aparece só depois de aberta", () => {
    reduced = true;
    render();
    expect(closedBadge()).toBeNull();
    act(() => envelopeButton().click());
    expect(closedBadge()).toBeNull();
    expect(openedBadge()).not.toBeNull();
  });

  it("o indicador é só do celular: o contêiner leva lg:hidden (no desktop nunca aparece)", () => {
    render();
    act(() => envelopeButton().click());
    act(() => vi.advanceTimersByTime(2000));
    const withBadge = [...dock()].find((d) => d.querySelector('a[href="#musica-da-cartinha"]'))!;
    expect(withBadge.className).toContain("lg:hidden");
    expect(withBadge.className).toContain("fixed");
  });

  it("preview do editor: nenhum flutuante, em nenhum estado, e nada de música real", () => {
    render({ preview: true });
    expect(dock()).toHaveLength(0);
    act(() => envelopeButton().click());
    act(() => vi.advanceTimersByTime(2000));
    expect(dock()).toHaveLength(0);
    expect(openedBadge()).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it.each(PRESENTATION_IDS)("estilo %s: fechado sem duplicar, aberto com o atalho", (style) => {
    render({ style });
    expect(musicTag()).not.toBeNull();
    expect(closedBadge()).toBeNull();
    act(() => envelopeButton().click());
    act(() => vi.advanceTimersByTime(2000));
    expect(openedBadge()).not.toBeNull();
  });
});

describe("visualização \"Ver como vai abrir\"", () => {
  it("o envelope também abre, mas nunca toca música nem mostra compartilhar", () => {
    render({ preview: true });
    expect(musicTag()).not.toBeNull(); // o selo só informa; não toca nada
    act(() => envelopeButton().click());
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).not.toContain("Compartilhar que ganhei");
    expect(vi.mocked(track).mock.calls.filter(([name]) => name === "cart_opened")).toHaveLength(0);
  });

  it("antes de abrir também não há player, e há caminho de volta à edição", () => {
    render({ preview: true });
    expect(container.querySelector("iframe")).toBeNull();
    expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Voltar para a edição")).toBe(true);
  });
});

describe.each(PRESENTATION_IDS)("estilo %s", (style) => {
  it("renderiza o envelope-botão, a dica e o selo de música (HTML do servidor)", () => {
    const html = renderToStaticMarkup(element({ style }));
    expect(html).toContain('class="ps-stage__hit"');
    expect(html).toContain("Toque no envelope para abrir sua cartinha");
    expect(html).toContain("Uma música especial");
    expect(html).not.toContain("Abrir minha carta");
    expect(html).not.toContain("Abrindo…");
  });

  it("sem música, o HTML não traz o selo", () => {
    const html = renderToStaticMarkup(element({ style, letter: withoutMusic }));
    expect(html).not.toContain("ps-music-tag");
    expect(html).toContain('class="ps-stage__hit"');
  });

  it("abre e mostra a carta inteira", () => {
    render({ style });
    act(() => envelopeButton().click());
    act(() => vi.advanceTimersByTime(2000));
    expect(container.textContent).toContain("Mensagem inteira da carta");
  });
});

describe("sem JavaScript", () => {
  it("o HTML do servidor traz a carta e o noscript que a mostra e esconde o envelope", () => {
    const html = renderToStaticMarkup(element());
    expect(html).toContain(".ps-open[hidden]{display:flex!important}");
    expect(html).toContain(".ps-closed{display:none!important}");
    expect(html).toContain("Mensagem inteira da carta");
  });
});
