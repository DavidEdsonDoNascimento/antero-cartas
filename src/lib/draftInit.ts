/**
 * Lógica de inicialização de /criar: decide entre retomar uma sessão válida
 * ou criar um rascunho novo. Extraída de CreateFlow para ser testável sem
 * DOM (o projeto testa em ambiente Node — ver vitest.config.ts) e para
 * permitir "prefetch" a partir do CTA da landing (ver CreateCta.tsx).
 *
 * Nunca decide sozinha por retomar uma sessão em rascunho: isso é uma escolha
 * do usuário (ver CreateFlow — ResumeDraftPrompt). Só decide sozinha por NÃO
 * retomar quando a sessão não é mais válida (carta publicada, token inválido,
 * carta não encontrada).
 */

import type { Cart } from "@/lib/types";
import { loadSession, saveSession, clearSession, type CartSession } from "@/lib/cartSession";
import { loadDraft, clearDraft, hasMeaningfulContent } from "@/lib/storage";
import { createDraft, fetchCart, type CartPatch } from "@/lib/api";

const EDITABLE_STATUSES = new Set(["DRAFT", "AWAITING_PAYMENT"]);

/** Campos editáveis persistidos via autosave (fotos usam endpoints próprios). */
export function buildPatch(cart: Cart): CartPatch {
  return {
    recipientType: cart.recipientType,
    recipientName: cart.recipientName,
    occasion: cart.occasion,
    title: cart.title,
    message: cart.message,
    senderName: cart.senderName,
    signature: cart.signature,
    theme: cart.theme,
    music: cart.music,
    relationshipStartDate: cart.relationshipStartDate,
    showRelationshipCounter: cart.showRelationshipCounter,
    planType: cart.planType,
  };
}

export type CartInitOutcome =
  | { kind: "resume"; cart: Cart; session: CartSession }
  | { kind: "create"; cart: Cart; session: CartSession; legacyMedia: Cart["media"] };

/**
 * Resolve como iniciar /criar. Quem chama decide o que fazer com o resultado:
 * um "resume" pode ser aplicado direto ou oferecido como escolha ao usuário.
 */
export async function resolveCartInit(): Promise<CartInitOutcome> {
  const existing = loadSession();
  if (existing) {
    try {
      const { cart: loaded } = await fetchCart(existing.cartId, existing.editToken);
      if (EDITABLE_STATUSES.has(loaded.status)) {
        return { kind: "resume", cart: loaded, session: existing };
      }
    } catch {
      /* token inválido ou carta não encontrada: recomeça abaixo */
    }
    // A sessão não serve mais para retomar (publicada/paga, token inválido ou
    // carta não encontrada). Encerra E limpa o cache de recuperação junto —
    // aquele cache era só um espelho DESTA sessão (saveDraft roda a cada
    // autosave) e nunca deve vazar campos para a próxima carta.
    clearSession();
    clearDraft();
  }

  const legacy = loadDraft();
  const shouldMigrate = Boolean(legacy && hasMeaningfulContent(legacy));
  const initialPatch: CartPatch | undefined = shouldMigrate ? buildPatch(legacy!) : undefined;

  const { cart: created, editToken } = await createDraft(initialPatch);
  const session: CartSession = { cartId: created.id, editToken };
  saveSession(session);
  return {
    kind: "create",
    cart: created,
    session,
    legacyMedia: shouldMigrate ? legacy!.media : [],
  };
}

// --- Prefetch (aquecimento a partir do CTA da landing) ----------------------

let pending: Promise<CartInitOutcome> | null = null;

/**
 * Dispara `resolveCartInit()` o quanto antes (clique/hover no CTA "Criar
 * minha cartinha"), para que a rede já esteja em andamento quando /criar
 * montar. Navegação client-side do App Router preserva o módulo em memória,
 * então este cache sobrevive à troca de página.
 */
export function prefetchCartInit(): void {
  if (pending) return;
  pending = resolveCartInit();
  pending.catch(() => {
    /* erro real é tratado por quem consumir via getCartInit() */
  });
}

/**
 * Consome o prefetch pendente (se houver) e libera o cache para a próxima
 * visita. Sem prefetch em andamento, resolve na hora (comportamento igual ao
 * anterior, sem prefetch).
 */
export function getCartInit(): Promise<CartInitOutcome> {
  const p = pending ?? resolveCartInit();
  pending = null;
  return p;
}

/** Utilitário de teste: descarta qualquer prefetch pendente entre testes. */
export function resetCartInitPrefetch(): void {
  pending = null;
}
