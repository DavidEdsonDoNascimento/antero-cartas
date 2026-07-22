/**
 * Configuração de busca de música visível ao CLIENTE.
 * Apenas uma flag booleana de UI — NUNCA a chave da API.
 * A chave e o modo de execução ficam só no servidor (ver server/youtubeSearch.ts).
 *
 * Deve espelhar a habilitação do servidor: se `YOUTUBE_SEARCH_ENABLED=false`
 * no servidor, defina também `NEXT_PUBLIC_YOUTUBE_SEARCH_ENABLED=false`.
 */
export const SEARCH_UI_ENABLED =
  (process.env.NEXT_PUBLIC_YOUTUBE_SEARCH_ENABLED ?? "true") !== "false";
