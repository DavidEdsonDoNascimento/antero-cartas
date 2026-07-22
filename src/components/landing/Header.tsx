"use client";

import { useState } from "react";
import Link from "next/link";
import { site, positioning } from "@/config/site";

const NAV = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#para-quem", label: "Para quem é" },
  { href: "#planos", label: "Planos" },
  { href: "#duvidas", label: "Dúvidas" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Barra superior */}
      <div className="bg-vinho text-creme">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-center text-xs font-medium">
          {positioning.topbar.map((t, i) => (
            <span key={t} className="flex items-center gap-2">
              {i > 0 && <span className="text-dourado">•</span>}
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Navegação */}
      <header className="sticky top-0 z-40 border-b border-rosa/20 bg-creme/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-serif text-xl font-bold text-vinho">
            {site.name}
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-sm text-grafite/70 transition hover:text-vinho"
              >
                {n.label}
              </a>
            ))}
            <Link
              href="/criar"
              className="rounded-full bg-vinho px-5 py-2 text-sm font-semibold text-creme transition hover:bg-vinho-deep"
            >
              {positioning.heroCta}
            </Link>
          </nav>

          <button
            className="rounded-lg p-2 text-vinho md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Abrir menu"
            aria-expanded={open}
          >
            <span className="text-xl">{open ? "✕" : "☰"}</span>
          </button>
        </div>

        {open && (
          <nav className="border-t border-rosa/20 bg-creme px-4 py-3 md:hidden">
            <div className="flex flex-col gap-2">
              {NAV.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2 text-sm text-grafite/70 hover:bg-rosa-soft/40"
                >
                  {n.label}
                </a>
              ))}
              <Link
                href="/criar"
                className="mt-1 rounded-full bg-vinho px-5 py-2.5 text-center text-sm font-semibold text-creme"
              >
                {positioning.heroCta}
              </Link>
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
