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
import { migrateMusic } from "@/lib/music";

/** Migra o formato antigo de música ({musicUrl, musicVideoId}) em memória. */
function migrateCart(cart: Cart): Cart {
  cart.media = cart.media ?? [];
  cart.music = migrateMusic(cart as unknown as Record<string, unknown>);
  return cart;
}

const DRAFT_KEY = "antero:draft";
const DRAFT_MEDIA_KEY = "antero:draft:media";

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
