import { ImageResponse } from "next/og";
import { site } from "@/config/site";

/**
 * Imagem de compartilhamento (Open Graph / WhatsApp / X), gerada em build a
 * partir da identidade visual em `globals.css` — creme de fundo, vinho no
 * texto, dourado nos detalhes (task 011, seção 9.3).
 *
 * Gerada por código em vez de um PNG versionado para acompanhar
 * automaticamente o nome e a tagline de `src/config/site.ts`. Usa a fonte
 * padrão do `next/og` de propósito: as fontes da marca vêm do
 * `next/font/google` em runtime e embutir os arquivos .ttf só para esta
 * imagem aumentaria o repositório sem ganho proporcional.
 *
 * NUNCA renderize aqui conteúdo de carta, nome de destinatário ou qualquer
 * dado do usuário — esta imagem é pública e cacheada por terceiros.
 */
export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CREME = "#fff9f4";
const CREME_DARK = "#f6ece3";
const VINHO = "#681d35";
const DOURADO = "#c6a15b";
const GRAFITE = "#211d1e";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: CREME,
          backgroundImage: `radial-gradient(circle at 88% 12%, ${CREME_DARK} 0%, ${CREME} 55%)`,
          padding: "72px 96px",
        }}
      >
        {/* Envelope estilizado — mesma metáfora da landing, sem imagem
            externa. Desenhado em SVG de propósito: o truque de triângulo com
            `border` do CSS não é suportado pelo renderizador do next/og e sai
            como um retângulo cheio. */}
        <svg width="140" height="98" viewBox="0 0 140 98" style={{ marginBottom: 44 }}>
          <rect
            x="3"
            y="3"
            width="134"
            height="92"
            rx="10"
            fill={CREME}
            stroke={VINHO}
            strokeWidth="6"
          />
          <path
            d="M6 10 L70 58 L134 10"
            fill="none"
            stroke={VINHO}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6 88 L52 48 M134 88 L88 48"
            fill="none"
            stroke={DOURADO}
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>

        <div
          style={{
            display: "flex",
            fontSize: 34,
            letterSpacing: 12,
            textTransform: "uppercase",
            color: DOURADO,
          }}
        >
          {site.name}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 68,
            lineHeight: 1.15,
            textAlign: "center",
            color: VINHO,
          }}
        >
          {site.tagline}
        </div>

        <div
          style={{
            display: "flex",
            width: 120,
            height: 4,
            marginTop: 40,
            borderRadius: 2,
            backgroundColor: DOURADO,
          }}
        />

        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 30,
            textAlign: "center",
            color: GRAFITE,
            opacity: 0.7,
          }}
        >
          Mensagem, fotos e música em um link só de vocês
        </div>
      </div>
    ),
    size,
  );
}
