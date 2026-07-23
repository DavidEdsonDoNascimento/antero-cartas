"use client";

import Link from "next/link";
import { site } from "@/config/site";
import { StepIndicator } from "./StepIndicator";

/**
 * Ocupa o mesmo espaço/layout de CreateFlow enquanto a sessão inicial
 * (retomar ou criar rascunho) está em andamento — evita a tela em branco com
 * "Carregando…". Na maioria das entradas isso nem chega a aparecer, porque o
 * CTA já disparou o prefetch antes da navegação (ver CreateCta.tsx); aqui
 * cobre o restante: link direto, atualização da página, rede lenta.
 */
export function CreateFlowSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_minmax(320px,420px)] lg:py-12">
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-vinho">
            ← {site.name}
          </Link>
          <span className="text-xs text-grafite/30">Preparando…</span>
        </div>

        <StepIndicator current={1} />

        <div className="animate-pulse rounded-2xl bg-white/70 p-5 shadow-sm sm:p-7">
          <div className="mb-5">
            <div className="h-7 w-2/3 rounded-md bg-rosa/20" />
            <div className="mt-2 h-4 w-1/2 rounded bg-rosa/15" />
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-1.5 h-3.5 w-32 rounded bg-rosa/20" />
              <div className="grid gap-2.5 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-rosa-soft/50" />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 h-3.5 w-40 rounded bg-rosa/20" />
              <div className="h-12 rounded-xl bg-rosa-soft/50" />
            </div>
            <div>
              <div className="mb-1.5 h-3.5 w-28 rounded bg-rosa/20" />
              <div className="grid gap-2.5 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-rosa-soft/50" />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 flex items-center justify-between border-t border-rosa/20 pt-5">
            <span />
            <div className="h-11 w-40 rounded-full bg-rosa/25" />
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-8">
          <p className="mb-3 text-sm font-medium text-grafite/60">
            Olha como sua cartinha está ficando 👇
          </p>
          <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-white/70 shadow-sm" />
        </div>
      </aside>
    </div>
  );
}
