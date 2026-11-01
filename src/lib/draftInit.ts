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
import { loadDraft, clearDraft, hasMeaningfulContent, loadUnsyncedChanges } from "@/lib/storage";
import { ApiClientError, createDraft, fetchCart, type CartPatch } from "@/lib/api";

const EDITABLE_STATUSES = new Set(["DRAFT", "AWAITING_PAYMENT"]);

/** Prazo para ler o rascunho: sem ele, uma rede travada prende o editor no esqueleto. */
export const LOAD_TIMEOUT_MS = 20_000;

export function isEditableStatus(status: string): boolean {
  return EDITABLE_STATUSES.has(status);
}

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
  | {
      kind: "create";
      cart: Cart;
      session: CartSession;
      legacyMedia: Cart["media"];
      /** A carta nasceu do texto não salvo de uma carta que ficou inacessível. */
      recovered?: boolean;
    };

/**
 * Resolve como iniciar /criar. Quem chama decide o que fazer com o resultado:
 * um "resume" pode ser aplicado direto ou oferecido como escolha ao usuário.
 */
export async function resolveCartInit(): Promise<CartInitOutcome> {
  const existing = loadSession();
  if (existing) {
    try {
      const { cart: loaded } = await fetchCart(existing.cartId, existing.editToken, {
        timeoutMs: LOAD_TIMEOUT_MS,
      });
      if (isEditableStatus(loaded.status)) {
        return { kind: "resume", cart: loaded, session: existing };
      }
    } catch (err) {
      // Só token inválido ou carta inexistente encerram a sessão. Uma queda de
      // rede ou erro do servidor não diz nada sobre o rascunho: encerrar aqui
      // deixaria a carta inacessível, porque o token só existe neste navegador.
      const gone = err instanceof ApiClientError && (err.status === 401 || err.status === 404);
      if (!gone) throw err;

      // O texto que o servidor nunca recebeu não pode sumir junto com a carta.
      // Só encerra a sessão depois de a carta nova existir: se a criação falhar,
      // a próxima tentativa encontra tudo como estava.
      const unsynced = loadUnsyncedChanges(existing.cartId);
      if (unsynced) {
        const { cart: created, editToken } = await createDraft(unsynced);
        const session: CartSession = { cartId: created.id, editToken };
        saveSession(session);
        clearDraft();
        return { kind: "create", cart: created, session, legacyMedia: [], recovered: true };
      }
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
