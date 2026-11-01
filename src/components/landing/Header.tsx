import Link from "next/link";
import { site, positioning } from "@/config/site";
import { CreateCta } from "@/components/create/CreateCta";
import { WaxSeal } from "@/components/paper-light/icons";

const NAV = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#exemplos", label: "Exemplos" },
  { href: "#planos", label: "Planos" },
  { href: "#duvidas", label: "Dúvidas" },
];

/**
 * Cabeçalho da landing. Sem JavaScript próprio: no celular só ficam a marca e o
 * botão principal (nada de menu escondido para quem tem pouca prática); os
 * atalhos de seção aparecem a partir de 820 px e continuam no rodapé.
 */
export function Header() {
  return (
    <header className="pl-header">
      <div className="pl-container pl-header__bar">
        <Link href="/" className="pl-logo" aria-label={`${site.name}, página inicial`}>
          <WaxSeal className="pl-logo__seal" idSuffix="logo" />
          {site.name}
        </Link>

        <nav className="pl-nav" aria-label="Seções da página">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <CreateCta className="pl-btn pl-btn--primary pl-btn--sm"><span className="pl-cta-long">{positioning.heroCta}</span>
          <span className="pl-cta-short">Criar cartinha</span>
        </CreateCta>
      </div>
    </header>
  );
}
