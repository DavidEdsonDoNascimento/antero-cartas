/**
 * Funções puras de música — compartilhadas entre cliente e servidor.
 * Sem dependências de rede: fáceis de testar.
 */

import type { SelectedMusic } from "@/lib/types";
import { extractYouTubeId, youTubeThumbnail, youTubeWatchUrl } from "@/lib/youtube";

/** Formato interno simples devolvido pela busca (nunca a resposta bruta). */
export interface MusicSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
}

export const SEARCH_TERM_MIN = 3;
export const SEARCH_TERM_MAX = 100;

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** Remove espaços duplicados e das pontas. */
export function normalizeSearchTerm(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export type TermValidation =
  | { ok: true; term: string }
  | { ok: false; reason: "empty" | "too_short" | "too_long" };

export function validateSearchTerm(input: string): TermValidation {
  const term = normalizeSearchTerm(input);
  if (term.length === 0) return { ok: false, reason: "empty" };
  if (term.length < SEARCH_TERM_MIN) return { ok: false, reason: "too_short" };
  if (term.length > SEARCH_TERM_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, term };
}

/**
 * Decodifica as entidades HTML que a API do YouTube devolve nos textos
 * (ex.: `&amp;`, `&#39;`). O resultado é tratado como TEXTO puro — o React
 * reescapa ao renderizar, então não há injeção de HTML.
 */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function codePoint(n: number): string {
  return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

/** Item cru esperado da search.list do YouTube (parcial e tolerante). */
interface RawYouTubeItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
}

/** Transforma a resposta do YouTube no formato interno, filtrando inválidos. */
export function transformYouTubeItems(items: unknown): MusicSearchResult[] {
  if (!Array.isArray(items)) return [];
  const out: MusicSearchResult[] = [];
  for (const raw of items as RawYouTubeItem[]) {
    const id = raw?.id?.videoId;
    if (typeof id !== "string" || !VIDEO_ID_RE.test(id)) continue;
    const sn = raw.snippet;
    if (!sn) continue;
    const thumb =
      sn.thumbnails?.medium?.url ??
      sn.thumbnails?.high?.url ??
      sn.thumbnails?.default?.url ??
      youTubeThumbnail(id);
    out.push({
      videoId: id,
      title: typeof sn.title === "string" ? decodeHtmlEntities(sn.title) : "",
      channelTitle:
        typeof sn.channelTitle === "string" ? decodeHtmlEntities(sn.channelTitle) : "",
      thumbnailUrl: typeof thumb === "string" ? thumb : youTubeThumbnail(id),
      youtubeUrl: youTubeWatchUrl(id),
    });
  }
  return out;
}

/** Resultado da busca → música selecionada (salva o mínimo necessário). */
export function selectedFromResult(r: MusicSearchResult): SelectedMusic {
  return {
    videoId: r.videoId,
    youtubeUrl: r.youtubeUrl,
    title: r.title || undefined,
    channelTitle: r.channelTitle || undefined,
    thumbnailUrl: r.thumbnailUrl || undefined,
    source: "search",
  };
}

/** URL colada → música selecionada, reusando a extração segura de ID. */
export function selectedFromUrl(url: string): SelectedMusic | null {
  const id = extractYouTubeId(url);
  if (!id) return null;
  return {
    videoId: id,
    youtubeUrl: youTubeWatchUrl(id),
    thumbnailUrl: youTubeThumbnail(id),
    source: "manual",
  };
}

/**
 * Migração em memória do formato antigo de música ({musicUrl, musicVideoId})
 * para SelectedMusic. Não quebra rascunhos antigos nem exige nova pesquisa.
 */
export function migrateMusic(raw: {
  music?: unknown;
  musicUrl?: unknown;
  musicVideoId?: unknown;
}): SelectedMusic | null {
  if (raw.music && typeof raw.music === "object") {
    const m = raw.music as Partial<SelectedMusic>;
    if (typeof m.videoId === "string" && VIDEO_ID_RE.test(m.videoId)) {
      return {
        videoId: m.videoId,
        youtubeUrl:
          typeof m.youtubeUrl === "string" && m.youtubeUrl
            ? m.youtubeUrl
            : youTubeWatchUrl(m.videoId),
        title: typeof m.title === "string" ? m.title : undefined,
        channelTitle: typeof m.channelTitle === "string" ? m.channelTitle : undefined,
        thumbnailUrl:
          typeof m.thumbnailUrl === "string" ? m.thumbnailUrl : youTubeThumbnail(m.videoId),
        source: m.source === "search" ? "search" : "manual",
      };
    }
  }
  const vid = typeof raw.musicVideoId === "string" ? raw.musicVideoId : null;
  if (vid && VIDEO_ID_RE.test(vid)) {
    return {
      videoId: vid,
      youtubeUrl:
        typeof raw.musicUrl === "string" && raw.musicUrl ? raw.musicUrl : youTubeWatchUrl(vid),
      thumbnailUrl: youTubeThumbnail(vid),
      source: "manual",
    };
  }
  return null;
}
