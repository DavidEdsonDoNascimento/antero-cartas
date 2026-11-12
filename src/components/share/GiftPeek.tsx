/**
 * O pedaço da carta que a prévia pública mostra: primeira foto (ou o
 * placeholder do estilo), "Para {nome}", o trecho e o selo de música.
 *
 * Recebe SÓ `PublicPreviewDTO` — o tipo não tem campo para o resto da carta, e
 * esta pasta não importa `LetterSheet`, `CardPreview` nem nada que receba a
 * carta inteira (`shareBoundary.test.ts` confere). Server-safe.
 *
 * O texto já chega cortado do servidor (`lib/publicPreview`): aqui ele só é
 * exibido, como texto (o React escapa qualquer HTML).
 */
import type { PublicPreviewDTO } from "@/lib/publicPreview";
import { GENERIC_EXCERPT } from "@/lib/publicPreview";
import { framingStyle } from "@/lib/photoFraming";
import { getPreset } from "@/content/presentation/presets";
import { NoteIcon } from "@/components/paper-light/icons";
import { Seal } from "@/components/presentation/Envelope";

export function GiftPeek({ preview, uid }: { preview: PublicPreviewDTO; uid: string }) {
  const preset = getPreset(preview.style);
  const excerpt = preview.excerpt;
  return (
    <div className="ps-peek">
      <div className="ps-peek__photo">
        <div className="ps-peek__photo-inner">
          {preview.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.photo.src}
              alt={preview.recipientFirstName ? `Foto da cartinha para ${preview.recipientFirstName}` : "Foto da cartinha"}
              width={preview.photo.width ?? undefined}
              height={preview.photo.height ?? undefined}
              style={framingStyle(preview.photo.framing)}
              loading="eager"
              decoding="async"
            />
          ) : (
            <div
              className="ps-peek__placeholder"
              style={{
                background: `radial-gradient(circle at 50% 40%, ${preset.letter.cardBg}, ${preset.envelope.pocket[1]})`,
              }}
            >
              <Seal palette={preset.envelope} uid={`${uid}-ph`} className="ps-peek__placeholder-mark" />
            </div>
          )}
        </div>
      </div>
      <p className="ps-peek__to">
        {preview.recipientFirstName ? `Para ${preview.recipientFirstName}` : "Para alguém especial"}
      </p>
      <p className={`ps-peek__text${excerpt ? "" : " ps-peek__text--generic"}`}>
        {excerpt ? `“${excerpt.text}”` : GENERIC_EXCERPT}
      </p>
      {preview.hasMusic && (
        <span className="ps-peek__music">
          <span className="ps-peek__disc" aria-hidden="true">
            <NoteIcon />
          </span>
          Uma cartinha com música
        </span>
      )}
    </div>
  );
}
