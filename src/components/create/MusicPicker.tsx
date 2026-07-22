"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Cart, SelectedMusic } from "@/lib/types";
import {
  selectedFromResult,
  selectedFromUrl,
  validateSearchTerm,
  type MusicSearchResult,
} from "@/lib/music";
import { youTubeEmbedUrl } from "@/lib/youtube";
import { SEARCH_UI_ENABLED } from "@/config/youtube";
import { track } from "@/lib/analytics";
import { FieldLabel, TextField } from "./ui";

interface Props {
  cart: Cart;
  update: (patch: Partial<Cart>) => void;
}

type Tab = "search" | "manual";

/**
 * Seleção de música: pesquisa no YouTube (principal) ou colar link (alternativa).
 * A chave da API fica no servidor; aqui só chamamos /api/youtube/search.
 */
export function MusicPicker({ cart, update }: Props) {
  const [tab, setTab] = useState<Tab>(SEARCH_UI_ENABLED ? "search" : "manual");
  const selected = cart.music;

  function choose(music: SelectedMusic) {
    update({ music });
    track("music_selected", { source: music.source });
  }
  function remove() {
    update({ music: null });
    track("music_removed", {});
  }

  return (
    <div>
      <FieldLabel hint="opcional">Música</FieldLabel>

      {selected && (
        <SelectedMusicCard
          music={selected}
          onRemove={remove}
          onChange={() => setTab("search")}
          canSearch={SEARCH_UI_ENABLED}
        />
      )}

      {SEARCH_UI_ENABLED && (
        <div className="mt-3 flex gap-2" role="tablist" aria-label="Como escolher a música">
          <TabButton active={tab === "search"} onClick={() => setTab("search")}>
            🔎 Pesquisar música
          </TabButton>
          <TabButton active={tab === "manual"} onClick={() => setTab("manual")}>
            🔗 Colar link
          </TabButton>
        </div>
      )}

      <div className="mt-3">
        {tab === "search" && SEARCH_UI_ENABLED ? (
          <SearchPanel selectedVideoId={selected?.videoId} onSelect={choose} />
        ) : (
          <ManualPanel initialUrl={selected?.source === "manual" ? selected.youtubeUrl : ""} onSelect={choose} />
        )}
      </div>

      <p className="mt-2 text-xs text-grafite/45">
        A música começa a tocar depois que a pessoa abrir o envelope. A reprodução
        depende da disponibilidade do vídeo no YouTube.
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-vinho text-creme"
          : "bg-white text-grafite/70 ring-1 ring-rosa/35 hover:text-vinho"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Painel de pesquisa
// ---------------------------------------------------------------------------
type Status = "idle" | "loading" | "ok" | "empty" | "error" | "disabled";

function SearchPanel({
  selectedVideoId,
  onSelect,
}: {
  selectedVideoId?: string;
  onSelect: (m: SelectedMusic) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<"mock" | "real" | "disabled" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const lastTermRef = useRef<string>("");

  const runSearch = useCallback(async (raw: string) => {
    const v = validateSearchTerm(raw);
    if (!v.ok) return;
    if (v.term === lastTermRef.current) return; // evita busca duplicada
    lastTermRef.current = v.term;

    abortRef.current?.abort(); // cancela a busca anterior
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setErrorMsg("");
    track("music_search_started", {});

    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(v.term)}`, {
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        lastTermRef.current = ""; // permite tentar o mesmo termo de novo
        const code = data?.error?.code ?? "unknown";
        setStatus("error");
        setErrorMsg(data?.error?.message ?? "Não foi possível buscar agora.");
        track("music_search_failed", { code });
        return;
      }
      if (data.mode === "disabled") {
        setMode("disabled");
        setStatus("disabled");
        setResults([]);
        return;
      }
      const list: MusicSearchResult[] = Array.isArray(data.results) ? data.results : [];
      setMode(data.mode ?? null);
      setResults(list);
      setStatus(list.length > 0 ? "ok" : "empty");
      track("music_search_completed", { mode: data.mode ?? "", count: list.length });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // busca cancelada
      lastTermRef.current = "";
      setStatus("error");
      setErrorMsg("Não foi possível buscar agora. Tente novamente ou cole o link.");
      track("music_search_failed", { code: "network" });
    }
  }, []);

  // Debounce: só agenda a busca; nada de setState síncrono aqui.
  useEffect(() => {
    const v = validateSearchTerm(query);
    if (!v.ok) return;
    const id = setTimeout(() => runSearch(v.term), 600);
    return () => clearTimeout(id);
  }, [query, runSearch]);

  function onQueryChange(val: string) {
    setQuery(val);
    const v = validateSearchTerm(val);
    if (!v.ok) {
      setResults([]);
      setStatus("idle");
      setErrorMsg("");
    }
  }

  function submitNow() {
    const v = validateSearchTerm(query);
    if (v.ok) runSearch(v.term);
  }

  function clear() {
    abortRef.current?.abort();
    lastTermRef.current = "";
    setQuery("");
    setResults([]);
    setStatus("idle");
    setErrorMsg("");
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex-1">
          <TextField
            value={query}
            onChange={onQueryChange}
            placeholder="Digite uma música ou artista"
            ariaLabel="Pesquisar música no YouTube"
          />
        </div>
        <button
          type="button"
          onClick={submitNow}
          className="shrink-0 rounded-xl bg-vinho px-4 text-sm font-semibold text-creme transition hover:bg-vinho-deep"
        >
          Pesquisar
        </button>
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar pesquisa"
            className="shrink-0 rounded-xl px-3 text-grafite/50 ring-1 ring-rosa/35 hover:text-vinho"
          >
            ✕
          </button>
        )}
      </div>

      {/* Região viva para leitores de tela */}
      <p role="status" aria-live="polite" className="sr-only">
        {status === "loading" && "Pesquisando músicas…"}
        {status === "ok" && `${results.length} resultados encontrados.`}
        {status === "empty" && "Nenhum resultado encontrado."}
        {status === "error" && errorMsg}
      </p>

      {mode === "mock" && status !== "idle" && (
        <p className="mt-2 rounded-lg bg-dourado/15 px-3 py-1.5 text-xs text-grafite/70">
          Resultados de demonstração (modo mock) — configure a API para busca real.
        </p>
      )}

      <div className="mt-3">
        {status === "idle" && (
          <p className="py-6 text-center text-sm text-grafite/45">
            Pesquise pelo nome da música, do artista ou os dois.
          </p>
        )}
        {status === "loading" && (
          <p className="py-6 text-center text-sm text-grafite/50">Pesquisando…</p>
        )}
        {status === "empty" && (
          <p className="py-6 text-center text-sm text-grafite/50">
            Nenhum resultado. Tente outros termos ou cole o link do YouTube.
          </p>
        )}
        {status === "disabled" && (
          <p className="py-6 text-center text-sm text-grafite/50">
            Busca desativada. Use a opção “Colar link” do YouTube.
          </p>
        )}
        {status === "error" && (
          <p className="py-4 text-center text-sm text-vinho">{errorMsg}</p>
        )}
        {status === "ok" && (
          <ul className="space-y-2">
            {results.map((r) => (
              <ResultRow
                key={r.videoId}
                result={r}
                selected={r.videoId === selectedVideoId}
                onSelect={() => onSelect(selectedFromResult(r))}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ResultRow({
  result,
  selected,
  onSelect,
}: {
  result: MusicSearchResult;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border p-2 ${
        selected ? "border-vinho bg-vinho/5 ring-1 ring-vinho" : "border-rosa/30 bg-white"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={result.thumbnailUrl}
        alt=""
        className="h-12 w-16 shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-grafite" title={result.title}>
          {result.title || "Vídeo do YouTube"}
        </p>
        <p className="truncate text-xs text-grafite/55" title={result.channelTitle}>
          <span className="text-[#FF0000]">▶ YouTube</span>
          {result.channelTitle ? ` · ${result.channelTitle}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Selecionar ${result.title || "este vídeo"}`}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            selected
              ? "bg-vinho text-creme"
              : "bg-rosa-soft text-vinho hover:bg-rosa/40"
          }`}
        >
          {selected ? "✓ Selecionada" : "Selecionar"}
        </button>
        <a
          href={result.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-grafite/50 underline hover:text-vinho"
        >
          Ver no YouTube
        </a>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Painel de link manual
// ---------------------------------------------------------------------------
function ManualPanel({
  initialUrl,
  onSelect,
}: {
  initialUrl: string;
  onSelect: (m: SelectedMusic) => void;
}) {
  const [raw, setRaw] = useState(initialUrl);
  const [error, setError] = useState("");

  function onChange(v: string) {
    setRaw(v);
    setError("");
    const trimmed = v.trim();
    if (!trimmed) return;
    const music = selectedFromUrl(trimmed);
    if (music) {
      onSelect(music);
    } else {
      setError("Cole um link válido do YouTube (ex: youtube.com/watch?v=… ou youtu.be/…).");
    }
  }

  return (
    <div>
      <TextField
        value={raw}
        onChange={onChange}
        placeholder="Cole o link do YouTube da música"
        ariaLabel="Link do YouTube da música"
      />
      {error && <p className="mt-1 text-xs text-vinho">{error}</p>}
      <p className="mt-1 text-xs text-grafite/45">
        Use esta opção se a música não aparecer na busca ou se você já tem o link.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cartão da música selecionada + prévia
// ---------------------------------------------------------------------------
function SelectedMusicCard({
  music,
  onRemove,
  onChange,
  canSearch,
}: {
  music: SelectedMusic;
  onRemove: () => void;
  onChange: () => void;
  canSearch: boolean;
}) {
  const [preview, setPreview] = useState(false);

  function togglePreview() {
    setPreview((v) => {
      const next = !v;
      if (next) track("music_preview_played", { where: "create" });
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-vinho/30 bg-vinho/5 p-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={music.thumbnailUrl}
          alt=""
          className="h-12 w-16 shrink-0 rounded object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-grafite" title={music.title}>
            🎵 {music.title ?? "Música selecionada"}
          </p>
          <p className="truncate text-xs text-grafite/55">
            {music.channelTitle ?? "Link do YouTube"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={togglePreview}
          aria-pressed={preview}
          className="rounded-full bg-vinho px-3 py-1.5 text-xs font-semibold text-creme transition hover:bg-vinho-deep"
        >
          {preview ? "Pausar prévia" : "▶ Ouvir prévia"}
        </button>
        {canSearch && (
          <button
            type="button"
            onClick={onChange}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-grafite/70 ring-1 ring-rosa/35 hover:text-vinho"
          >
            Trocar música
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-vinho ring-1 ring-vinho/30 hover:bg-vinho/10"
        >
          Remover música
        </button>
      </div>
      {preview && (
        <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg">
          <iframe
            title="Prévia da música"
            src={youTubeEmbedUrl(music.videoId, { autoplay: true })}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}
    </div>
  );
}
