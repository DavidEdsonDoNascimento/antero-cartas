import Link from "next/link";
import type { PublicPreviewDTO } from "@/lib/publicPreview";
import { getPreset } from "@/content/presentation/presets";
import { Scene } from "@/components/presentation/Scene";
import { Envelope } from "@/components/presentation/Envelope";
import { EffectsLayer } from "@/components/presentation/EffectsLayer";
import { presetVars } from "@/components/presentation/tokens";
import { GiftPeek } from "./GiftPeek";

/**
 * Prévia pública `/presente/{publicId}`: o presente sendo exibido.
 *
 * Mesma linguagem visual da abertura (cenário, envelope, efeitos), com o
 * envelope aberto e a carta saindo pela metade: a primeira foto, "Para Ana",
 * o começo da mensagem e o selo de música. Nada além disso existe aqui:
 * - recebe SÓ `PublicPreviewDTO` (campos enumerados, já cortados no servidor);
 * - não há link para `/c/` nem forma de abrir a carta;
 * - o único caminho é criar uma cartinha (link simples, nunca `CreateCta`,
 *   que cria rascunho no hover).
 *
 * Server Component puro: sem JavaScript na página. O efeito toca uma vez ao
 * carregar (CSS) e some com movimento reduzido.
 */
export function PublicGiftView({ preview }: { preview: PublicPreviewDTO }) {
  const preset = getPreset(preview.style);
  const name = preview.recipientFirstName;
  return (
    <div className="ps ps-page" style={presetVars(preset)}>
      <Scene style={preset.id} uid="gift" fixed />

      <main className="ps-main ps-main--gift">
        <div className="ps-gift__copy">
          <p className="ps-plaque">Uma cartinha especial foi compartilhada</p>
          <div className="ps-plaque ps-plaque--block ps-gift__card">
            <h1 className="ps-gift__title">
              {name ? `${name} ganhou uma cartinha` : "Alguém ganhou uma cartinha"}
            </h1>
            <p className="ps-gift__lead">
              Esta é só uma prévia: a cartinha completa é de quem recebeu. Que tal preparar uma surpresa assim
              para alguém especial?
            </p>
            <div className="ps-gift__cta">
              <Link href="/criar" className="ps-btn ps-btn--block">
                Criar minha cartinha
              </Link>
              <Link href="/" className="ps-link ps-gift__how">
                Como funciona
              </Link>
            </div>
            <p className="ps-brand">feita na Antero Cartas</p>
          </div>
        </div>

        <div className="ps-stage ps-stage--peek ps-gift__stage" data-state="open">
          <div className="ps-stage__art">
            <Envelope palette={preset.envelope} uid="gift-env">
              <GiftPeek preview={preview} uid="gift" />
            </Envelope>
          </div>
        </div>
      </main>

      <EffectsLayer effect={preview.effect} style={preset.id} uid="gift-fx" play />
    </div>
  );
}
