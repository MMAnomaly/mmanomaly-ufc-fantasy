import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-line bg-panel/90 p-5 shadow-[0_0_0_1px_rgba(225,29,46,0.04)] ${className}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  min,
  max,
  minLength,
  maxLength,
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-[0.18em] text-mist">{label}</span>
      <input
        className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-paper outline-none ring-blood focus:ring-2"
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        min={min}
        max={max}
        minLength={minLength}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </label>
  );
}

export function PrimaryButton({
  children,
  disabled,
  type = "submit",
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
}) {
  return (
    <button
      className="rounded-sm bg-blood px-4 py-2 font-semibold tracking-wide text-white hover:bg-blood-dim disabled:opacity-50"
      disabled={disabled}
      type={type}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className="rounded-sm border border-line px-4 py-2 text-paper hover:border-amber hover:text-amber disabled:opacity-50"
      disabled={disabled}
      type="submit"
    >
      {children}
    </button>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    SETUP: "border-amber/40 text-amber",
    DRAFTING: "border-blood/50 text-blood",
    PAUSED: "border-mist/40 text-mist",
    IN_SEASON: "border-emerald-500/40 text-emerald-400",
  };
  const labels: Record<string, string> = {
    SETUP: "Pre-draft",
    DRAFTING: "Live draft",
    PAUSED: "Draft paused",
    IN_SEASON: "In season",
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] ${map[status] ?? "border-line text-mist"}`}>
      {labels[status] ?? status}
    </span>
  );
}
