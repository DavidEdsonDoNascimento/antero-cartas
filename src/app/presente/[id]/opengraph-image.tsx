import { ImageResponse } from "next/og";
import { getPublicPreview, readPublicPhoto } from "@/server/publicPreviewService";
import { sanitizePublicPhoto } from "@/server/publicPhoto";
import { getPreset } from "@/content/presentation/presets";
import { GENERIC_EXCERPT, shortenForImage } from "@/lib/publicPreview";

/**
 * Imagem social da prévia pública (WhatsApp, Telegram, redes).
 *
 * Montada a partir do MESMO contrato da página (`PublicPreviewDTO`) e da mesma
 * foto recodificada sem metadados da rota `/presente/{id}/foto`: nenhum dado
 * além do que a página já mostra. Carta antiga ou sem foto: só o cenário e o
 * envelope.
 *
 * Atenção (documentado no relatório e na política): aplicativos de terceiros
 * guardam esta imagem em cache. Quando a carta expira, a página passa a
 * responder 404, mas cópias já guardadas por esses serviços não são recolhidas.
 */
export const alt = "Prévia de uma cartinha especial da Antero Cartas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

async function photoDataUrl(id: string): Promise<string | null> {
  const file = await readPublicPhoto(id).catch(() => null);
  if (!file) return null;
  try {
    const jpeg = await sanitizePublicPhoto(file.body);
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPublicPreview(id);
  const preview = result.state === "ok" ? result.preview : null;
  const preset = getPreset(preview?.style ?? "papel-luz");
  const photo = preview?.photo ? await photoDataUrl(id) : null;
  const name = preview?.recipientFirstName;
  const text = preview?.excerpt ? `“${shortenForImage(preview.excerpt.text)}”` : GENERIC_EXCERPT;
  const dark = preset.scene.dark;
  const [paperLight, paperDark] = preset.envelope.paper;
  const [sealLight, sealMid] = preset.envelope.seal;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 64,
          padding: "56px 80px",
          backgroundColor: preset.scene.base,
          backgroundImage: dark
            ? "radial-gradient(circle at 30% 40%, #4a2a2c 0%, #1d1418 70%)"
            : `radial-gradient(circle at 50% 30%, #ffffff 0%, ${preset.scene.base} 70%)`,
        }}
      >
        {/* Envelope com a carta saindo e a foto presa nela */}
        <div style={{ display: "flex", position: "relative", width: 440, height: 500 }}>
          <div
            style={{
              position: "absolute",
              left: 40,
              top: 0,
              width: 360,
              height: 420,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: 26,
              background: preset.letter.cardBg,
              borderRadius: 10,
              boxShadow: "0 18px 40px rgba(40, 14, 22, 0.35)",
            }}
          >
            {photo ? (
              <img src={photo} alt="" width={308} height={232} style={{ objectFit: "cover", borderRadius: 6 }} />
            ) : (
              <div
                style={{
                  width: 308,
                  height: 232,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundImage: `radial-gradient(circle at 50% 40%, ${preset.letter.cardBg}, ${preset.envelope.pocket[1]})`,
                }}
              >
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 48,
                    backgroundImage: `radial-gradient(circle at 36% 30%, ${sealLight}, ${sealMid})`,
                  }}
                />
              </div>
            )}
          </div>
          <svg width="440" height="264" viewBox="0 0 560 336" style={{ position: "absolute", left: 0, bottom: 0 }}>
            <polygon points="4,4 280,188 4,332" fill={preset.envelope.pocket[0]} />
            <polygon points="556,4 280,188 556,332" fill={preset.envelope.pocket[0]} />
            <polygon points="4,332 280,186 556,332" fill={paperLight} />
            <path d="M6 332 280 186 554 332" fill="none" stroke={paperDark} strokeWidth="3" />
          </svg>
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
          <div style={{ display: "flex", fontSize: 30, color: preset.scene.textMuted }}>
            Uma cartinha especial foi compartilhada
          </div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 64, fontStyle: "italic", color: preset.scene.text }}>
            {name ? `Para ${name}` : "Para alguém especial"}
          </div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 34, lineHeight: 1.4, color: preset.scene.text }}>
            {text}
          </div>
          {preview?.hasMusic && (
            <div style={{ display: "flex", marginTop: 24, fontSize: 26, color: preset.scene.textMuted }}>
              ♪ Uma cartinha com música
            </div>
          )}
          <div style={{ display: "flex", marginTop: 36, fontSize: 24, color: preset.scene.textMuted }}>
            feita na Antero Cartas
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
