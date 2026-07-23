"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { prefetchCartInit } from "@/lib/draftInit";

/**
 * Link para /criar que aquece a criação/retomada do rascunho antes mesmo da
 * navegação terminar (hover ou clique) — é o que elimina a espera visível na
 * chegada a /criar para quem entra por um destes CTAs.
 */
export function CreateCta({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href="/criar"
      className={className}
      onPointerEnter={prefetchCartInit}
      onClick={prefetchCartInit}
    >
      {children}
    </Link>
  );
}
