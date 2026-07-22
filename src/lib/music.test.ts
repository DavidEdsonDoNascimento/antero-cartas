import { describe, it, expect } from "vitest";
import {
  normalizeSearchTerm,
  validateSearchTerm,
  transformYouTubeItems,
  decodeHtmlEntities,
  selectedFromResult,
  selectedFromUrl,
  migrateMusic,
  type MusicSearchResult,
} from "@/lib/music";
import { extractYouTubeId } from "@/lib/youtube";

describe("normalizeSearchTerm", () => {
  it("colapsa espaços duplicados e apara as pontas", () => {
    expect(normalizeSearchTerm("  Perfect   Ed   Sheeran  ")).toBe("Perfect Ed Sheeran");
  });
});

describe("validateSearchTerm", () => {
  it("rejeita vazio", () => {
    expect(validateSearchTerm("   ")).toEqual({ ok: false, reason: "empty" });
  });
  it("rejeita curto demais (<3)", () => {
    expect(validateSearchTerm("ab")).toEqual({ ok: false, reason: "too_short" });
  });
  it("rejeita longo demais (>100)", () => {
    const long = "a".repeat(101);
    expect(validateSearchTerm(long)).toEqual({ ok: false, reason: "too_long" });
  });
  it("aceita e normaliza um termo válido", () => {
    expect(validateSearchTerm("  A Thousand  Years ")).toEqual({
      ok: true,
      term: "A Thousand Years",
    });
  });
});

describe("transformYouTubeItems", () => {
  it("normaliza itens válidos e descarta inválidos", () => {
    const items = [
      {
        id: { videoId: "2Vv-BfVoq4g" },
        snippet: {
          title: "Perfect",
          channelTitle: "Ed Sheeran",
          thumbnails: { medium: { url: "https://i.ytimg.com/vi/2Vv-BfVoq4g/mqdefault.jpg" } },
        },
      },
      { id: { videoId: "bad" }, snippet: { title: "x", channelTitle: "y" } }, // id inválido
      { id: {}, snippet: { title: "z" } }, // sem videoId
    ];
    const out = transformYouTubeItems(items);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      videoId: "2Vv-BfVoq4g",
      title: "Perfect",
      channelTitle: "Ed Sheeran",
      thumbnailUrl: "https://i.ytimg.com/vi/2Vv-BfVoq4g/mqdefault.jpg",
      youtubeUrl: "https://www.youtube.com/watch?v=2Vv-BfVoq4g",
    });
  });
  it("retorna [] para entradas não-array", () => {
    expect(transformYouTubeItems(null)).toEqual([]);
    expect(transformYouTubeItems(undefined)).toEqual([]);
    expect(transformYouTubeItems({})).toEqual([]);
  });
  it("decodifica entidades HTML no título e no canal", () => {
    const out = transformYouTubeItems([
      {
        id: { videoId: "2Vv-BfVoq4g" },
        snippet: { title: "JVKE &amp; ZVC &#39;A&#39;", channelTitle: "Tom &amp; Jerry" },
      },
    ]);
    expect(out[0].title).toBe("JVKE & ZVC 'A'");
    expect(out[0].channelTitle).toBe("Tom & Jerry");
  });
});

describe("decodeHtmlEntities", () => {
  it("decodifica entidades nomeadas e numéricas sem deixar HTML", () => {
    expect(decodeHtmlEntities("a &amp; b &#39;c&#39; &quot;d&quot;")).toBe("a & b 'c' \"d\"");
    expect(decodeHtmlEntities("&lt;tag&gt;")).toBe("<tag>");
  });
});

describe("extractYouTubeId (URL manual)", () => {
  it("extrai de watch, youtu.be e shorts", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=2Vv-BfVoq4g")).toBe("2Vv-BfVoq4g");
    expect(extractYouTubeId("https://youtu.be/2Vv-BfVoq4g")).toBe("2Vv-BfVoq4g");
    expect(extractYouTubeId("https://www.youtube.com/shorts/2Vv-BfVoq4g")).toBe("2Vv-BfVoq4g");
  });
  it("rejeita URLs inválidas ou de outros domínios", () => {
    expect(extractYouTubeId("https://vimeo.com/123")).toBeNull();
    expect(extractYouTubeId("não é url")).toBeNull();
    expect(extractYouTubeId("https://www.youtube.com/watch?v=curto")).toBeNull();
  });
});

describe("selectedFromResult / selectedFromUrl", () => {
  it("cria SelectedMusic a partir de um resultado", () => {
    const r: MusicSearchResult = {
      videoId: "2Vv-BfVoq4g",
      title: "Perfect",
      channelTitle: "Ed Sheeran",
      thumbnailUrl: "https://i.ytimg.com/vi/2Vv-BfVoq4g/mqdefault.jpg",
      youtubeUrl: "https://www.youtube.com/watch?v=2Vv-BfVoq4g",
    };
    expect(selectedFromResult(r)).toMatchObject({
      videoId: "2Vv-BfVoq4g",
      title: "Perfect",
      channelTitle: "Ed Sheeran",
      source: "search",
    });
  });
  it("cria SelectedMusic a partir de URL válida e retorna null para inválida", () => {
    const ok = selectedFromUrl("https://youtu.be/2Vv-BfVoq4g");
    expect(ok).toMatchObject({ videoId: "2Vv-BfVoq4g", source: "manual" });
    expect(selectedFromUrl("https://exemplo.com/x")).toBeNull();
  });
});

describe("migrateMusic", () => {
  it("migra o formato antigo {musicUrl, musicVideoId}", () => {
    const m = migrateMusic({
      musicUrl: "https://www.youtube.com/watch?v=2Vv-BfVoq4g",
      musicVideoId: "2Vv-BfVoq4g",
    });
    expect(m).toMatchObject({ videoId: "2Vv-BfVoq4g", source: "manual" });
  });
  it("mantém um objeto SelectedMusic já novo", () => {
    const existing = {
      videoId: "rtOvBOTyX00",
      youtubeUrl: "https://www.youtube.com/watch?v=rtOvBOTyX00",
      title: "A Thousand Years",
      source: "search" as const,
    };
    expect(migrateMusic({ music: existing })).toMatchObject({
      videoId: "rtOvBOTyX00",
      source: "search",
    });
  });
  it("retorna null quando não há música", () => {
    expect(migrateMusic({})).toBeNull();
    expect(migrateMusic({ musicVideoId: "invalido" })).toBeNull();
  });
});
