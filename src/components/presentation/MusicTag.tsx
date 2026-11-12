import { NoteIcon } from "@/components/paper-light/icons";

/**
 * Selo discreto "Uma música especial" do envelope fechado.
 *
 * Só informa que a carta tem música; não é um player e não toca nada. Por isso
 * NÃO imita um equalizador: no estado fechado o áudio ainda não existe, e barras
 * pulsando passariam a ideia de que já está tocando. O único movimento são duas
 * notinhas que sobem e somem em ciclos calmos enquanto o envelope está fechado
 * (só sem `prefers-reduced-motion`, ver `presentation.css`).
 *
 * Decorativo para o toque (`pointer-events: none` no CSS): nunca bloqueia o
 * envelope. Para leitores de tela, o texto visível é escondido e no lugar vai a
 * frase completa.
 */
export function MusicTag() {
  return (
    <p className="ps-music-tag" data-testid="music-tag">
      <span className="ps-music-tag__disc" aria-hidden="true">
        <NoteIcon />
      </span>
      <span aria-hidden="true">Uma música especial</span>
      <span className="ps-sr">Esta cartinha vem com uma música, que começa quando você abrir o envelope.</span>
      <Note className="ps-music-tag__note ps-music-tag__note--1" />
      <Note className="ps-music-tag__note ps-music-tag__note--2" />
    </p>
  );
}

function Note({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 16 20" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M6 2v12.2A3.6 3.6 0 1 0 8 17V6.4l5 1.5V4Z" />
    </svg>
  );
}
