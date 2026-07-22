"use client";

const STEPS = [
  { n: 1, label: "Para quem", emoji: "💌" },
  { n: 2, label: "Mensagem", emoji: "✍️" },
  { n: 3, label: "Extras", emoji: "🎨" },
  { n: 4, label: "Assinar", emoji: "🖋️" },
];

/** Trilha de progresso que vai marcando cada etapa concluída. */
export function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center">
      {STEPS.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <li key={s.n} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition ${
                  active
                    ? "border-vinho bg-vinho text-creme"
                    : done
                      ? "border-vinho bg-vinho/10 text-vinho"
                      : "border-rosa/40 bg-white text-grafite/40"
                }`}
              >
                {done ? "✓" : s.emoji}
              </span>
              <span
                className={`text-[11px] font-medium uppercase tracking-wide ${
                  active ? "text-vinho" : "text-grafite/40"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={`mx-1 mb-4 h-0.5 flex-1 rounded ${
                  done ? "bg-vinho" : "bg-rosa/30"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
