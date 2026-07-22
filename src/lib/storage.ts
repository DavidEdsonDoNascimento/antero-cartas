/**
 * Persistência local da Fase 1 (sem backend).
 * - Rascunho em DUAS camadas:
 *   1) texto/config em DRAFT_KEY (sempre salvo, é leve);
 *   2) fotos comprimidas em DRAFT_MEDIA_KEY (best-effort — se estourar a cota
 *      do localStorage, o texto continua salvo e as fotos apenas não persistem).
 *   Assim a ordem escolhida das fotos é mantida no autosave e restaurada ao
 *   atualizar a página, sem arriscar perder o texto (ver docs/0004 D12).
 * - Carta publicada: salva por slug, já com fotos comprimidas, para permitir
 *   abrir /c/[slug] localmente na demonstração.
 *
 * Na Fase 2 estas funções serão substituídas por chamadas de API + Prisma,
 * mantendo a mesma forma de dados (ver lib/types.ts).
 */

import type { Cart, CartMedia } from "@/lib/types";
import { generateId } from "@/lib/slug";
import { DEFAULT_THEME } from "@/content/themes";

const DRAFT_KEY = "antero:draft";
const DRAFT_MEDIA_KEY = "antero:draft:media";
const CARD_PREFIX = "antero:card:";

export function createEmptyCart(): Cart {
  const now = new Date().toISOString();
  return {
    id: generateId("cart"),
    slug: null,
    status: "DRAFT",
    recipientType: null,
    recipientName: "",
    occasion: null,
    title: "",
    message: "",
    senderName: "",
    signature: "",
    theme: DEFAULT_THEME,
    musicUrl: null,
    musicVideoId: null,
    relationshipStartDate: null,
    showRelationshipCounter: false,
    planType: null,
    media: [],
    expiresAt: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Salva o rascunho: texto sempre; fotos em chave separada, best-effort. */
export function saveDraft(cart: Cart): void {
  if (!isBrowser()) return;
  // 1) Texto/config — leve, deve sempre caber.
  try {
    const light: Cart = { ...cart, media: [], updatedAt: new Date().toISOString() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(light));
  } catch {
    // Silencioso: quota cheia ou modo privado não deve quebrar a criação.
  }
  // 2) Fotos — se não couberem, remove a chave para não restaurar dados parciais.
  try {
    if (cart.media.length > 0) {
      localStorage.setItem(DRAFT_MEDIA_KEY, JSON.stringify(cart.media));
    } else {
      localStorage.removeItem(DRAFT_MEDIA_KEY);
    }
  } catch {
    try {
      localStorage.removeItem(DRAFT_MEDIA_KEY);
    } catch {
      /* noop */
    }
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
    return cart;
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

/** "Publica" localmente: grava a carta completa por slug e retorna o slug. */
export function savePublishedCart(cart: Cart): void {
  if (!isBrowser() || !cart.slug) return;
  try {
    localStorage.setItem(CARD_PREFIX + cart.slug, JSON.stringify(cart));
  } catch {
    /* noop */
  }
}

export function loadPublishedCart(slug: string): Cart | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(CARD_PREFIX + slug);
    if (!raw) return null;
    return JSON.parse(raw) as Cart;
  } catch {
    return null;
  }
}
