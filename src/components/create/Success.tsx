"use client";

import { useState } from "react";
import Link from "next/link";
import type { Cart } from "@/lib/types";
import { site } from "@/config/site";
import { whatsappShareUrl } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { PrimaryButton } from "./ui";

export function Success({ cart }: { cart: Cart }) {
  const [copied, setCopied] = useState(false);
  const path = `/c/${cart.slug}`;
  const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${path}` : `${site.url}${path}`;
  const shareText = `Preparei uma cartinha especial para você 💌 ${fullUrl}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mb-4 text-5xl">🎉</div>
      <h2 className="text-2xl font-semibold text-vinho sm:text-3xl">
        Sua cartinha está pronta!
      </h2>
      <p className="mt-2 text-sm text-grafite/60">
        Este é o link exclusivo. Compartilhe com quem você quer surpreender.
      </p>

      <div className="mt-6 rounded-xl border border-rosa/30 bg-white p-3">
        <p className="truncate text-sm text-grafite/70">{fullUrl}</p>
        <button
          onClick={copy}
          className="mt-2 w-full rounded-full bg-rosa-soft py-2 text-sm font-medium text-vinho transition hover:bg-rosa/40"
        >
          {copied ? "Link copiado ✓" : "Copiar link"}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Link href={path} className="w-full">
          <PrimaryButton>Abrir a cartinha</PrimaryButton>
        </Link>
        <a
          href={whatsappShareUrl(shareText)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("whatsapp_share_clicked", { from: "success" })}
          className="rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-white shadow transition hover:brightness-105"
        >
          Compartilhar no WhatsApp
        </a>
      </div>

      <p className="mt-6 text-xs text-grafite/45">
        Na versão final, o link e o QR Code também chegam por e-mail após a confirmação do
        pagamento.
      </p>
    </div>
  );
}
