/**
 * Valores padrão do editor 2.0 (Escrever → Ver → Finalizar).
 *
 * A interface só exige a mensagem. O servidor continua exigindo título e tipo
 * de destinatário para publicar (`cartService.assertPublishable`), então eles
 * nascem aqui, sem perguntar nada:
 * - título automático ("Para Ana" / "Uma cartinha para você"), que acompanha o
 *   nome enquanto a pessoa não escrever um título próprio;
 * - tipo de destinatário "outro" na finalização, se a pessoa não escolheu um
 *   na ajuda para começar.
 *
 * Funções puras: testadas em `letterDefaults.test.ts`.
 */
import type { Cart, RecipientType } from "@/lib/types";
import { buildPatch } from "@/lib/draftInit";
import type { CartPatch } from "@/lib/api";

export const DEFAULT_RECIPIENT_TYPE: RecipientType = "outro";
export const GENERIC_TITLE = "Uma cartinha para você";

export function autoTitle(recipientName: string): string {
  const name = recipientName.trim();
  return name ? `Para ${name}` : GENERIC_TITLE;
}

/** O título ainda é o automático (vazio, ou igual ao gerado para o nome atual)? */
export function isAutoTitle(title: string, recipientName: string): boolean {
  const t = title.trim();
  return t === "" || t === autoTitle(recipientName) || t === GENERIC_TITLE;
}

/**
 * Aplica uma alteração do editor. Se o nome muda e o título ainda é o
 * automático, o título acompanha; um título escrito pela pessoa nunca é tocado.
 */
export function applyEditorPatch(cart: Cart, patch: Partial<Cart>): Cart {
  const next = { ...cart, ...patch };
  if (
    patch.recipientName !== undefined &&
    patch.title === undefined &&
    isAutoTitle(cart.title, cart.recipientName)
  ) {
    next.title = cart.title.trim() === "" ? "" : autoTitle(patch.recipientName);
  }
  return next;
}

/** O título que vai para o servidor: o da pessoa ou o automático. */
export function effectiveTitle(cart: Pick<Cart, "title" | "recipientName">): string {
  return cart.title.trim() || autoTitle(cart.recipientName);
}

/**
 * Patch do autosave a partir do que está na tela.
 *
 * Com uma cobrança aberta (`AWAITING_PAYMENT`), a mensagem nunca é enviada
 * vazia: fica valendo a última mensagem confirmada (`keepMessage`), e a tela
 * avisa. O servidor também recusa (ver `cartService.keepsPublishable`), mas
 * enviar o vazio só faria o autosave falhar em loop.
 */
export function savePatch(cart: Cart, keepMessage: string | null): CartPatch {
  const patch = buildPatch({ ...cart, title: effectiveTitle(cart) });
  if (cart.status === "AWAITING_PAYMENT" && !cart.message.trim() && keepMessage?.trim()) {
    patch.message = keepMessage;
  }
  return patch;
}

/** O que a finalização completa antes de seguir para o pagamento. */
export function finalizeDefaults(cart: Cart): Partial<Cart> {
  const patch: Partial<Cart> = {};
  if (!cart.recipientType) patch.recipientType = DEFAULT_RECIPIENT_TYPE;
  if (!cart.title.trim()) patch.title = autoTitle(cart.recipientName);
  return patch;
}

/** Grupos da ajuda "Quer ajuda para começar?". `types`: de quais modelos vêm as sugestões. */
export interface HelpGroup {
  id: string;
  label: string;
  /** Tipo gravado na carta ao usar um modelo (null = não presume: vira "outro" ao finalizar). */
  recipientType: RecipientType | null;
  types: RecipientType[];
}

export const HELP_GROUPS: HelpGroup[] = [
  // "Amor" não presume gênero: as sugestões vêm dos dois e o tipo fica em aberto.
  { id: "amor", label: "Amor", recipientType: null, types: ["namorada", "namorado"] },
  { id: "mae", label: "Mãe", recipientType: "mae", types: ["mae"] },
  { id: "pai", label: "Pai", recipientType: "pai", types: ["pai"] },
  { id: "amizade", label: "Amizade", recipientType: "amigo", types: ["amigo"] },
  { id: "outro", label: "Outra pessoa", recipientType: "outro", types: ["outro"] },
];
