"use client";

import { useRef, useState } from "react";
import type { Cart, CartMedia, ThemeId } from "@/lib/types";
import { themes } from "@/content/themes";
import { MAX_CART_PHOTOS, preparePhoto, validateImageFile } from "@/lib/image";
import { generateId } from "@/lib/slug";
import { extractYouTubeId } from "@/lib/youtube";
import { FieldLabel, StepHeader, TextField, Toggle } from "./ui";

interface Props {
  cart: Cart;
  update: (patch: Partial<Cart>) => void;
}

export function StepPersonalize({ cart, update }: Props) {
  return (
    <div>
      <StepHeader
        title="Personalize a cartinha"
        subtitle="Tudo opcional — adicione o que quiser e siga em frente quando estiver pronto."
      />
      <div className="space-y-7">
        <PhotosField cart={cart} update={update} />
        <CounterField cart={cart} update={update} />
        <MusicField cart={cart} update={update} />
        <ThemeField cart={cart} update={update} />
      </div>
    </div>
  );
}

function reindex(media: CartMedia[]): CartMedia[] {
  return media.map((m, i) => ({ ...m, position: i }));
}

function PhotosField({ cart, update }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    setBusy(true);
    const remaining = MAX_CART_PHOTOS - cart.media.length;
    const chosen = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      setError(`Você pode adicionar no máximo ${MAX_CART_PHOTOS} fotos.`);
    }
    const added: CartMedia[] = [];
    for (const file of chosen) {
      const err = await validateImageFile(file);
      if (err) {
        setError(err);
        continue;
      }
      try {
        const { dataUrl, storageKey } = await preparePhoto(file);
        added.push({
          id: generateId("media"),
          cartId: cart.id,
          type: "photo",
          url: dataUrl,
          storageKey,
          position: cart.media.length + added.length,
          createdAt: new Date().toISOString(),
        });
      } catch {
        setError("Não foi possível processar uma das imagens.");
      }
    }
    if (added.length) update({ media: reindex([...cart.media, ...added]) });
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(id: string) {
    update({ media: reindex(cart.media.filter((m) => m.id !== id)) });
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...cart.media];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update({ media: reindex(next) });
  }

  function makeCover(id: string) {
    const item = cart.media.find((m) => m.id === id);
    if (!item) return;
    const rest = cart.media.filter((m) => m.id !== id);
    update({ media: reindex([item, ...rest]) });
  }

  return (
    <div>
      <FieldLabel hint="opcional">Fotos (até {MAX_CART_PHOTOS})</FieldLabel>
      <div className="space-y-3">
        {cart.media.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {cart.media.map((m, i) => (
              <div key={m.id} className="w-24">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt={`Foto ${i + 1}`}
                    className="h-24 w-24 rounded-lg object-cover shadow"
                  />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-vinho/90 px-1.5 py-0.5 text-[10px] font-semibold text-creme">
                      ★ Capa
                    </span>
                  )}
                  <button
                    onClick={() => remove(m.id)}
                    aria-label={`Remover foto ${i + 1}`}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-grafite text-xs text-white shadow"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Mover foto ${i + 1} para a esquerda`}
                    className="rounded px-1.5 text-sm text-grafite/60 disabled:opacity-30"
                  >
                    ←
                  </button>
                  {i !== 0 && (
                    <button
                      onClick={() => makeCover(m.id)}
                      aria-label={`Definir foto ${i + 1} como capa`}
                      className="rounded px-1.5 text-[11px] font-medium text-dourado hover:underline"
                    >
                      capa
                    </button>
                  )}
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === cart.media.length - 1}
                    aria-label={`Mover foto ${i + 1} para a direita`}
                    className="rounded px-1.5 text-sm text-grafite/60 disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {cart.media.length < MAX_CART_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-rosa/40 bg-white/60 px-4 py-6 text-sm text-grafite/60 transition hover:border-vinho/50 hover:bg-rosa-soft/30 disabled:opacity-50"
          >
            <span className="text-2xl">🖼️</span>
            {busy
              ? "Processando…"
              : `Selecionar fotos · ${cart.media.length}/${MAX_CART_PHOTOS}`}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        {cart.media.length > 1 && (
          <p className="text-xs text-grafite/45">
            A primeira foto é a capa. Use “capa” ou as setas para reordenar — a ordem
            aparece no carrossel da carta.
          </p>
        )}
        {error && <p className="text-xs text-vinho">{error}</p>}
      </div>
    </div>
  );
}

function CounterField({ cart, update }: Props) {
  return (
    <div className="space-y-3">
      <Toggle
        checked={cart.showRelationshipCounter}
        onChange={(v) => update({ showRelationshipCounter: v })}
        label="Mostrar contador de tempo juntos"
      />
      {cart.showRelationshipCounter && (
        <div>
          <FieldLabel hint="quando começou">Data inicial</FieldLabel>
          <input
            type="date"
            value={cart.relationshipStartDate?.slice(0, 10) ?? ""}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) =>
              update({
                relationshipStartDate: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            className="w-full rounded-xl border border-rosa/40 bg-white px-4 py-3 text-grafite outline-none focus:border-vinho focus:ring-2 focus:ring-vinho/15"
          />
        </div>
      )}
    </div>
  );
}

function MusicField({ cart, update }: Props) {
  const [raw, setRaw] = useState(cart.musicUrl ?? "");
  const invalid = raw.trim().length > 0 && !cart.musicVideoId;

  function onChange(v: string) {
    setRaw(v);
    const id = extractYouTubeId(v);
    update({ musicUrl: v.trim() || null, musicVideoId: id });
  }

  return (
    <div>
      <FieldLabel hint="opcional">Música (link do YouTube)</FieldLabel>
      <TextField
        value={raw}
        onChange={onChange}
        placeholder="Cole o link do YouTube da música de vocês"
        ariaLabel="Link do YouTube da música"
      />
      {invalid && (
        <p className="mt-1 text-xs text-vinho">
          Cole um link válido do YouTube (ex: youtube.com/watch?v=… ou youtu.be/…).
        </p>
      )}
      {cart.musicVideoId && (
        <p className="mt-1 text-xs text-green-700">✓ Música reconhecida.</p>
      )}
      <p className="mt-1 text-xs text-grafite/45">
        A música começa a tocar depois que a pessoa clicar para abrir o envelope —
        assim respeitamos as regras de reprodução dos navegadores.
      </p>
    </div>
  );
}

function ThemeField({ cart, update }: Props) {
  return (
    <div>
      <FieldLabel>Tema visual</FieldLabel>
      <div className="grid grid-cols-2 gap-2.5">
        {themes.map((t) => {
          const active = cart.theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => update({ theme: t.id as ThemeId })}
              aria-pressed={active}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                active
                  ? "border-vinho bg-vinho/5 shadow-sm"
                  : "border-rosa/35 bg-white hover:border-vinho/40"
              }`}
            >
              <span className="flex shrink-0 gap-0.5">
                <span className="h-8 w-4 rounded-l" style={{ background: t.swatch[0] }} />
                <span className="h-8 w-4 rounded-r" style={{ background: t.swatch[1] }} />
              </span>
              <span>
                <span className="block text-sm font-medium text-grafite">{t.label}</span>
                <span className="block text-xs text-grafite/50">{t.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
