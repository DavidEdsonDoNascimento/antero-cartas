"use client";

import type { Cart } from "@/lib/types";
import type { LetterTheme } from "@/content/presentation/presets";
import { formatTimeTogether } from "@/lib/counter";
import { PhotoCarousel } from "@/components/card/PhotoCarousel";
import { useLiveCounter } from "@/components/card/CardPreview";
import { NoteIcon } from "@/components/paper-light/icons";

/** O que a folha mostra. Nada além do conteúdo da carta (sem status, id, slug). */
export type LetterContent = Pick<
  Cart,
  | "title"
  | "recipientName"
  | "message"
  | "senderName"
  | "signature"
  | "media"
  | "music"
  | "relationshipStartDate"
  | "showRelationshipCounter"
>;

/**
 * Folha da carta v2 (estilos 2.0). Mesma usada na prévia do editor e na carta
 * aberta em `/c/`: o que o cliente vê enquanto escreve é o que a pessoa recebe.
 * Cartas legadas continuam com `CardPreview`, que não muda.
 *
 * - Fotos: o mesmo `PhotoCarousel` (e o mesmo enquadramento) da carta antiga.
 * - Música: aqui só o indicador; o player fica fora da folha e só monta depois
 *   do gesto de abrir (`RecipientExperience`). Nenhuma imagem de terceiros.
 * - `preview`: textos de exemplo enquanto a mensagem está vazia, fotos paradas.
 */
export function LetterSheet({
  letter,
  theme,
  preview = false,
  headingId,
  headingLevel = 2,
}: {
  letter: LetterContent;
  theme: LetterTheme;
  preview?: boolean;
  /** Id do título, para o foco ir até ele depois de abrir. */
  headingId?: string;
  /** 1 na carta aberta (é o título da página); 2 dentro do editor. */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const counter = useLiveCounter(letter.showRelationshipCounter ? letter.relationshipStartDate : null);
  const title = letter.title.trim() || "Uma cartinha para você";
  const empty = !letter.message.trim();
  const message = empty
    ? "Sua mensagem aparece aqui. Escreva do seu jeito: o importante é ser verdadeiro."
    : letter.message;
  const recipient = letter.recipientName.trim();
  const sender = letter.senderName.trim();
  const signature = letter.signature.trim();

  return (
    <article
      className="ps-sheet"
      data-paper={theme.paper}
      data-heading={theme.heading}
      style={{
        "--ps-paper": theme.cardBg,
        "--ps-ink": theme.ink,
        "--ps-ink-muted": theme.inkMuted,
        "--ps-accent": theme.accent,
        "--ps-accent-card": theme.accentOnCard,
        "--ps-sheet-border": theme.cardBorder,
        "--ps-sheet-radius": theme.cardRadius,
      } as React.CSSProperties}
    >
      <header className="ps-sheet__head">
        <span className="ps-sheet__ornament" aria-hidden="true">
          {theme.ornament}
        </span>
        <Heading id={headingId} className="ps-sheet__title" tabIndex={headingId ? -1 : undefined}>
          {title}
        </Heading>
        {/* Com o título automático ("Para Ana"), repetir o nome logo abaixo seria eco. */}
        {recipient && title !== `Para ${recipient}` && <p className="ps-sheet__to">Para {recipient}</p>}
      </header>

      {letter.media.length > 0 && (
        <div className="ps-sheet__photos">
          <PhotoCarousel
            media={letter.media}
            accent={theme.accentOnCard}
            mutedColor={theme.inkMuted}
            frame={theme.photoFrame}
            tilt={theme.tilt}
            autoAdvance={!preview}
          />
        </div>
      )}

      <p className="ps-sheet__message" data-placeholder={empty || undefined}>
        {message}
      </p>

      {counter && (
        <div className="ps-sheet__counter">
          <span>Juntos há </span>
          <strong>{formatTimeTogether(counter)}</strong>
          <span className="ps-sheet__counter-fine">
            {counter.hours}h {counter.minutes}min {counter.seconds}s
          </span>
        </div>
      )}

      {(sender || signature) && (
        <footer className="ps-sheet__sign">
          <span className="ps-sheet__divider" aria-hidden="true">
            {theme.divider}
          </span>
          {signature && <p className="ps-sheet__signature">{signature}</p>}
          {sender && <p className="ps-sheet__sender">{sender}</p>}
        </footer>
      )}

      {letter.music && (
        <div className="ps-sheet__music">
          <span className="ps-sheet__disc" aria-hidden="true">
            <NoteIcon />
          </span>
          <span className="ps-sheet__music-text">
            <span className="ps-sheet__music-title">{letter.music.title ?? "Música da cartinha"}</span>
            <span className="ps-sheet__music-hint">
              {preview ? "Toca quando o envelope abrir" : letter.music.channelTitle ?? "Música da cartinha"}
            </span>
          </span>
        </div>
      )}
    </article>
  );
}
