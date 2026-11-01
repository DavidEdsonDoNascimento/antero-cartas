import Link from "next/link";
import { site } from "@/config/site";
import { CreateCta } from "@/components/create/CreateCta";
import { WaxSeal } from "@/components/paper-light/icons";

/** Rodapé: marca, atalhos e links legais, todos com alvo de toque de 44 px. */
export function Footer() {
  return (
    <footer className="pl-footer">
      <div className="pl-container pl-footer__row">
        <div>
          <Link href="/" className="pl-logo" aria-label={`${site.name}, página inicial`}>
            <WaxSeal className="pl-logo__seal" idSuffix="footer" />
            {site.name}
          </Link>
          <p className="pl-note">Um produto {site.company}</p>
        </div>

        <nav className="pl-footer__nav" aria-label="Rodapé">
          <CreateCta>Criar cartinha</CreateCta>
          <Link href="/demonstracao">Demonstração</Link>
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </div>
    </footer>
  );
}
