"use client";

import { useState } from "react";
import { faq } from "@/content/faq";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-2xl divide-y divide-rosa/20 rounded-2xl border border-rosa/20 bg-white">
      {faq.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="font-medium text-grafite">{item.q}</span>
              <span
                className={`shrink-0 text-vinho transition-transform ${isOpen ? "rotate-45" : ""}`}
              >
                +
              </span>
            </button>
            {isOpen && (
              <p className="px-5 pb-5 text-sm leading-relaxed text-grafite/70">{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
