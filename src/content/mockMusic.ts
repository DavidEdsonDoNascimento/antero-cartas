import type { MusicSearchResult } from "@/lib/music";
import { youTubeThumbnail, youTubeWatchUrl } from "@/lib/youtube";

/**
 * Lista local de músicas de demonstração usada no modo `mock`.
 * NÃO são resultados reais da API — a interface deixa isso claro.
 * São vídeos oficiais conhecidos e incorporáveis, para permitir testar
 * seleção, prévia, troca e remoção sem uma chave de API.
 */
function entry(videoId: string, title: string, channelTitle: string): MusicSearchResult {
  return {
    videoId,
    title,
    channelTitle,
    thumbnailUrl: youTubeThumbnail(videoId),
    youtubeUrl: youTubeWatchUrl(videoId),
  };
}

export const mockMusicResults: MusicSearchResult[] = [
  entry("2Vv-BfVoq4g", "Perfect", "Ed Sheeran"),
  entry("rtOvBOTyX00", "A Thousand Years", "Christina Perri"),
  entry("450p7goxZqg", "All of Me", "John Legend"),
  entry("LjhCEhWiKXk", "Just the Way You Are", "Bruno Mars"),
  entry("yKNxeF4KMsY", "Yellow", "Coldplay"),
  entry("GlPlfCy1urI", "Your Song", "Elton John"),
  entry("0yW7w8F2TVA", "Marry You", "Bruno Mars"),
  entry("k4V3Mo61fJM", "I Won't Give Up", "Jason Mraz"),
];

/** Filtra a lista mock por um termo simples (título/canal). */
export function filterMockMusic(term: string, max: number): MusicSearchResult[] {
  const t = term.toLowerCase();
  const matched = mockMusicResults.filter((r) =>
    `${r.title} ${r.channelTitle}`.toLowerCase().includes(t),
  );
  const list = matched.length > 0 ? matched : mockMusicResults;
  return list.slice(0, max);
}
