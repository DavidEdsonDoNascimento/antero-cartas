/**
 * Navegação do editor 2.0 dentro de `/criar`, sem recarregar a página.
 *
 * O momento fica na URL (`?etapa=escrever|ver|finalizar`, e `&painel=…` quando
 * um painel de "Deixar mais especial" está aberto). Cada avanço é um
 * `history.pushState`, então o Voltar do aparelho volta um momento (ou fecha o
 * painel) sem sair do editor nem perder nada. O Next integra `pushState` ao
 * router, e o editor ouve `popstate` para acompanhar.
 *
 * Histórico sem crescer à toa: o botão "Voltar" da tela usa `history.back()`
 * quando a entrada anterior é do próprio editor (marcada em `history.state`);
 * senão troca a entrada atual (`replaceState`).
 */

export const STEPS = ["escrever", "ver", "finalizar"] as const;
export type Step = (typeof STEPS)[number];

export const PANELS = ["fotos", "musica", "tempo", "assinatura"] as const;
export type Panel = (typeof PANELS)[number];

export interface EditorLocation {
  step: Step;
  panel: Panel | null;
}

const STATE_KEY = "anteroEditor";

interface HistoryMark {
  [STATE_KEY]: { depth: number };
}

export function parseLocation(search: string): Partial<EditorLocation> {
  const params = new URLSearchParams(search);
  const step = params.get("etapa");
  const panel = params.get("painel");
  return {
    step: (STEPS as readonly string[]).includes(step ?? "") ? (step as Step) : undefined,
    panel: (PANELS as readonly string[]).includes(panel ?? "") ? (panel as Panel) : null,
  };
}

export function locationSearch({ step, panel }: EditorLocation): string {
  const params = new URLSearchParams(window.location.search);
  params.set("etapa", step);
  if (panel && step === "ver") params.set("painel", panel);
  else params.delete("painel");
  return `?${params.toString()}`;
}

function depthOf(state: unknown): number | null {
  const mark = (state as Partial<HistoryMark> | null)?.[STATE_KEY];
  return mark && typeof mark.depth === "number" ? mark.depth : null;
}

/** Posição do editor no histórico (0 = a entrada em que ele abriu). */
export function currentDepth(): number {
  return depthOf(window.history.state) ?? 0;
}

function mergedState(depth: number): HistoryMark & Record<string, unknown> {
  const base = (window.history.state ?? {}) as Record<string, unknown>;
  return { ...base, [STATE_KEY]: { depth } };
}

export function replaceLocation(loc: EditorLocation): void {
  window.history.replaceState(mergedState(currentDepth()), "", locationSearch(loc));
}

export function pushLocation(loc: EditorLocation): void {
  window.history.pushState(mergedState(currentDepth() + 1), "", locationSearch(loc));
}

/**
 * Volta um momento: pelo histórico se a entrada anterior é do editor (o Voltar
 * do aparelho e o da tela fazem a mesma coisa), senão trocando a atual.
 * Devolve `true` quando delegou ao histórico (o `popstate` atualiza a tela).
 */
export function goBackTo(loc: EditorLocation): boolean {
  if (currentDepth() > 0) {
    window.history.back();
    return true;
  }
  replaceLocation(loc);
  return false;
}

// --- Momento lembrado entre visitas -----------------------------------------

const VIEW_KEY = "antero:draft:view";

/** Guarda em que momento a pessoa estava, preso à carta (nunca o token). */
export function saveLastStep(cartId: string, step: Step): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ cartId, step }));
  } catch {
    /* modo privado ou cota cheia: só perdemos a conveniência */
  }
}

export function loadLastStep(cartId: string): Step | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cartId?: unknown; step?: unknown };
    if (parsed.cartId !== cartId) return null;
    return (STEPS as readonly string[]).includes(parsed.step as string) ? (parsed.step as Step) : null;
  } catch {
    return null;
  }
}

export function clearLastStep(): void {
  try {
    localStorage.removeItem(VIEW_KEY);
  } catch {
    /* noop */
  }
}
