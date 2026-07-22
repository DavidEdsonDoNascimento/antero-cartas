/**
 * Extração segura do ID de vídeo do YouTube.
 * NUNCA aceitamos HTML de embed do usuário — só URLs válidas do YouTube.
 * O ID extraído é validado contra um formato estrito antes de ser usado.
 */

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

/** Retorna o ID de 11 caracteres ou null se a URL não for válida/permitida. */
export function extractYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  let candidate: string | null = null;

  if (host === "youtu.be") {
    candidate = url.pathname.slice(1).split("/")[0];
  } else if (url.pathname === "/watch") {
    candidate = url.searchParams.get("v");
  } else if (url.pathname.startsWith("/embed/")) {
    candidate = url.pathname.split("/embed/")[1]?.split("/")[0] ?? null;
  } else if (url.pathname.startsWith("/shorts/")) {
    candidate = url.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
  } else if (url.pathname.startsWith("/live/")) {
    candidate = url.pathname.split("/live/")[1]?.split("/")[0] ?? null;
  }

  if (candidate && VIDEO_ID_RE.test(candidate)) return candidate;
  return null;
}

/** Monta a URL de embed a partir de um ID já validado. */
export function youTubeEmbedUrl(
  videoId: string,
  opts: { autoplay?: boolean } = {},
): string {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  if (opts.autoplay) params.set("autoplay", "1");
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function youTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
