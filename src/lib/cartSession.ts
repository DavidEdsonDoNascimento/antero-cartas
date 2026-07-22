/**
 * Sessão do rascunho no navegador: {cartId, editToken}.
 * Sem login — o token de edição é gerado pelo backend na criação do
 * rascunho e guardado apenas aqui. Nunca vai para a URL pública da carta.
 */

const SESSION_KEY = "antero:session";

export interface CartSession {
  cartId: string;
  editToken: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadSession(): CartSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CartSession>;
    if (typeof parsed.cartId === "string" && typeof parsed.editToken === "string") {
      return { cartId: parsed.cartId, editToken: parsed.editToken };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSession(session: CartSession): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* noop */
  }
}

export function clearSession(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}
