"use client";

import type { ReactNode } from "react";

/** Campos e controles reutilizados nas etapas de criação. */

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label className="text-sm font-medium text-grafite">{children}</label>
      {hint && <span className="text-xs text-grafite/50">{hint}</span>}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  maxLength,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
}) {
  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={ariaLabel}
        className="w-full rounded-xl border border-rosa/40 bg-white px-4 py-3 text-grafite outline-none transition placeholder:text-grafite/35 focus:border-vinho focus:ring-2 focus:ring-vinho/15"
      />
      {maxLength && (
        <div className="mt-1 text-right text-xs text-grafite/45">
          {value.length}/{maxLength}
        </div>
      )}
    </div>
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className="w-full resize-none rounded-xl border border-rosa/40 bg-white px-4 py-3 leading-relaxed text-grafite outline-none transition placeholder:text-grafite/35 focus:border-vinho focus:ring-2 focus:ring-vinho/15"
      />
      {maxLength && (
        <div className="mt-1 text-right text-xs text-grafite/45">
          {value.length}/{maxLength}
        </div>
      )}
    </div>
  );
}

export interface Choice {
  id: string;
  label: string;
  emoji?: string;
  description?: string;
}

export function OptionGrid({
  options,
  selected,
  onSelect,
  columns = 2,
}: {
  options: Choice[];
  selected: string | null;
  onSelect: (id: string) => void;
  columns?: 1 | 2;
}) {
  return (
    <div className={`grid gap-2.5 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {options.map((opt) => {
        const active = selected === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            aria-pressed={active}
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm transition ${
              active
                ? "border-vinho bg-vinho text-creme shadow-sm"
                : "border-rosa/35 bg-white text-grafite hover:border-vinho/50 hover:bg-rosa-soft/40"
            }`}
          >
            {opt.emoji && <span className="text-lg">{opt.emoji}</span>}
            <span>
              <span className="font-medium">{opt.label}</span>
              {opt.description && (
                <span
                  className={`block text-xs ${active ? "text-creme/70" : "text-grafite/50"}`}
                >
                  {opt.description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-rosa/35 bg-white px-4 py-3 text-left"
    >
      <span className="text-sm font-medium text-grafite">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-vinho" : "bg-grafite/20"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-vinho px-7 py-3 text-sm font-semibold text-creme shadow-md transition hover:bg-vinho-deep disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-grafite/60 transition hover:text-vinho"
    >
      {children}
    </button>
  );
}

export function StepHeader({ title, subtitle }: { title: ReactNode; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-semibold text-vinho sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-grafite/60">{subtitle}</p>}
    </div>
  );
}
