import { ApiError, RETRY_AFTER_SECONDS } from "@/server/errors";

/**
 * Modo de manutenção (preparação para a migração de hospedagem — docs/0011).
 *
 * Ligado por `MAINTENANCE_MODE=true` no ambiente do servidor; qualquer outro
 * valor, ou a ausência da variável, mantém o modo DESLIGADO. Lido a cada
 * requisição (não no build), para poder ser ligado e desligado só com
 * restart/redeploy de variável, sem novo build da imagem.
 *
 * Enquanto ligado, toda operação que escreve dados — rascunho, fotos, pedido,
 * Pix, cartão, confirmação mock e webhook — responde 503 com `Retry-After`,
 * ANTES de tocar no banco, no storage ou no Mercado Pago. Leituras (cartinha
 * pública, status do pedido, fotos, busca de música) continuam funcionando.
 *
 * Por que 503 também no webhook: o Mercado Pago só considera a notificação
 * entregue com 200/201. Um 503 faz o provedor reenviar mais tarde (15 min,
 * 30 min, 6 h…), quando o banco de destino já estiver no ar. Responder 200
 * aqui confirmaria um processamento que não aconteceu e o pagamento nunca
 * seria aplicado.
 *
 * É uma checagem por rota (não um `proxy.ts`) de propósito: um proxy rodaria
 * em toda requisição também no deploy atual da Vercel e bufferizaria o corpo
 * dos uploads (limite padrão de 10 MB, o mesmo tamanho máximo de uma foto).
 * O teste `maintenanceWiring.test.ts` garante que nenhuma rota de escrita
 * fique sem a checagem.
 */

/** Segundos sugeridos ao cliente/provedor antes de tentar de novo. */
export const MAINTENANCE_RETRY_AFTER_SECONDS = RETRY_AFTER_SECONDS.maintenance ?? 120;

export const MAINTENANCE_MESSAGE =
  "Estamos fazendo uma manutenção rápida. Seus dados estão salvos — tente novamente em alguns minutos.";

export function isMaintenanceMode(): boolean {
  return (process.env.MAINTENANCE_MODE ?? "").trim().toLowerCase() === "true";
}

/**
 * Para rotas que já convertem erros com `jsonError`: lança um `ApiError`
 * "maintenance" (503 + Retry-After) quando o modo está ligado.
 */
export function assertNotInMaintenance(): void {
  if (isMaintenanceMode()) {
    throw new ApiError("maintenance", MAINTENANCE_MESSAGE);
  }
}

/**
 * Para rotas que montam a resposta manualmente (webhook): devolve a resposta
 * 503 pronta quando o modo está ligado, ou `null` para seguir normalmente.
 */
export function maintenanceResponse(): Response | null {
  if (!isMaintenanceMode()) return null;
  return Response.json(
    { error: { code: "maintenance", message: MAINTENANCE_MESSAGE } },
    {
      status: 503,
      headers: {
        "retry-after": String(MAINTENANCE_RETRY_AFTER_SECONDS),
        "cache-control": "no-store",
      },
    },
  );
}
