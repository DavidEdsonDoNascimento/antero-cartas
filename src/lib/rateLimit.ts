/**
 * Abstração simples de rate limiting.
 *
 * A implementação em memória é BEST-EFFORT e por instância: em ambiente
 * serverless cada instância tem o seu próprio contador, então não é uma
 * proteção definitiva. Serve para conter abuso trivial no protótipo.
 * Produção deve usar um store compartilhado (ex.: Redis) atrás desta mesma
 * interface — ver docs/0004 (rate limiting).
 */

export interface RateLimiter {
  check(key: string): { allowed: boolean; retryAfterMs: number };
}

export function createInMemoryRateLimiter(
  limit: number,
  windowMs: number,
): RateLimiter {
  const hits = new Map<string, number[]>();
  const MAX_KEYS = 5000;

  return {
    check(key: string) {
      const now = Date.now();
      const windowStart = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);

      if (recent.length >= limit) {
        const retryAfterMs = Math.max(0, recent[0] + windowMs - now);
        hits.set(key, recent);
        return { allowed: false, retryAfterMs };
      }

      recent.push(now);
      hits.set(key, recent);

      // Evita crescimento ilimitado do mapa.
      if (hits.size > MAX_KEYS) {
        const oldest = hits.keys().next().value;
        if (oldest) hits.delete(oldest);
      }
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
