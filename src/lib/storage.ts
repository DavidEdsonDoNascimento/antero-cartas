/**
 * Rascunho local LEGADO (Fase 1, antes do backend).
 * A partir da Fase 2 o backend é a fonte da verdade (ver lib/api.ts e
 * lib/cartSession.ts). Este módulo continua existindo para:
 * - detectar um rascunho antigo no primeiro carregamento e migrá-lo
 *   (ver CreateFlow.tsx);
 * - servir como cache de recuperação leve (texto apenas, sem fotos) caso o
 *   backend fique temporariamente indisponível durante a criação.
 */

import type { Cart, CartMedia } from "@/lib/types";
import type { CartPatch } from "@/lib/api";
import { migrateMusic } from "@/lib/music";

/** Migra o formato antigo de música ({musicUrl, musicVideoId}) em memória. */
function migrateCart(cart: Cart): Cart {
  cart.media = cart.media ?? [];
  cart.music = migrateMusic(cart as unknown as Record<string, unknown>);
  return cart;
}

const DRAFT_KEY = "antero:draft";
const DRAFT_MEDIA_KEY = "antero:draft:media";
const UNSYNCED_KEY = "antero:draft:unsynced";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Salva o rascunho: texto sempre; fotos em chave separada, best-effort. */
export function saveDraft(cart: Cart): void {
  if (!isBrowser()) return;
  try {
    const light: Cart = { ...cart, media: [], updatedAt: new Date().toISOString() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(light));
  } catch {
    // Silencioso: quota cheia ou modo privado não deve quebrar a criação.
  }
}

export function loadDraft(): Cart | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const cart = JSON.parse(raw) as Cart;
    try {
      const rawMedia = localStorage.getItem(DRAFT_MEDIA_KEY);
      cart.media = rawMedia ? (JSON.parse(rawMedia) as CartMedia[]) : [];
    } catch {
      cart.media = [];
    }
    return migrateCart(cart);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_MEDIA_KEY);
    localStorage.removeItem(UNSYNCED_KEY);
  } catch {
    /* noop */
  }
}

// --- Alterações ainda não confirmadas pelo servidor -------------------------
//
// Diferente de `antero:draft` (espelho que só é lido quando NÃO há sessão), este
// registro é lido ao retomar a sessão: é ele que devolve o texto de uma aba que
// fechou antes de o servidor confirmar. Fica preso ao id da carta, nunca guarda
// o token de edição, e `clearDraft` o apaga nos mesmos pontos em que a sessão
// termina (publicação, sessão inválida, carta nova — ver D46).

function readUnsynced(): { cartId: string; patch: CartPatch } | null {
  try {
    const raw = localStorage.getItem(UNSYNCED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cartId?: unknown; patch?: unknown };
    if (typeof parsed.cartId !== "string" || !isCartPatch(parsed.patch)) return null;
    return { cartId: parsed.cartId, patch: parsed.patch };
  } catch {
    return null;
  }
}

const STRING_FIELDS = ["recipientName", "title", "message", "senderName", "signature", "theme"];
const NULLABLE_STRING_FIELDS = ["recipientType", "occasion", "relationshipStartDate", "planType"];

/** O conteúdo vem de fora do programa: um valor estranho não pode virar a carta. */
function isCartPatch(value: unknown): value is CartPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const patch = value as Record<string, unknown>;
  const isText = (key: string) => patch[key] === undefined || typeof patch[key] === "string";
  return (
    STRING_FIELDS.every(isText) &&
    NULLABLE_STRING_FIELDS.every((key) => patch[key] === null || isText(key)) &&
    (patch.showRelationshipCounter === undefined ||
      typeof patch.showRelationshipCounter === "boolean") &&
    (patch.music === undefined || patch.music === null || typeof patch.music === "object") &&
    (patch.presentation === undefined || typeof patch.presentation === "string") &&
    (patch.presentationOptions === undefined ||
      patch.presentationOptions === null ||
      (typeof patch.presentationOptions === "object" && !Array.isArray(patch.presentationOptions))) &&
    (patch.sharePreviewVersion === undefined || patch.sharePreviewVersion === 1)
  );
}

/** Devolve `false` se não conseguiu guardar (cota cheia, modo privado). */
export function saveUnsyncedChanges(cartId: string, patch: CartPatch): boolean {
  if (!isBrowser()) return false;
  try {
    localStorage.setItem(UNSYNCED_KEY, JSON.stringify({ cartId, patch }));
    return true;
  } catch {
    // Melhor nada do que uma versão velha sobrescrevendo o texto na retomada.
    try {
      localStorage.removeItem(UNSYNCED_KEY);
    } catch {
      /* noop */
    }
    return false;
  }
}

/** As alterações pendentes desta carta. As de outra carta são descartadas. */
export function loadUnsyncedChanges(cartId: string): CartPatch | null {
  if (!isBrowser()) return null;
  const entry = readUnsynced();
  if (entry?.cartId === cartId) return entry.patch;
  try {
    localStorage.removeItem(UNSYNCED_KEY);
  } catch {
    /* noop */
  }
  return null;
}

/**
 * Apaga só se o registro ainda guarda exatamente a versão confirmada: se a
 * pessoa escreveu mais enquanto a resposta vinha, o registro novo fica.
 */
export function clearUnsyncedChanges(cartId: string, confirmed: CartPatch): void {
  if (!isBrowser()) return;
  try {
    const raw = localStorage.getItem(UNSYNCED_KEY);
    if (raw === JSON.stringify({ cartId, patch: confirmed })) {
      localStorage.removeItem(UNSYNCED_KEY);
    }
  } catch {
    /* noop */
  }
}

/** Um rascunho antigo só vale migrar se tiver conteúdo real. */
export function hasMeaningfulContent(cart: Cart): boolean {
  return Boolean(
    cart.recipientType ||
      cart.title.trim() ||
      cart.message.trim() ||
      cart.senderName.trim() ||
      cart.media.length > 0,
  );
}
