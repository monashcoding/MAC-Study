"use client";

import { BellRing } from "lucide-react";

export function NudgePill({
  burstCount = 0,
  disabled = false,
  disabledLabel,
  mode = "standard",
  onClick,
  pendingCount = 0,
}: {
  burstCount?: number;
  disabled?: boolean;
  disabledLabel?: string;
  mode?: "standard" | "super";
  onClick: () => void;
  pendingCount?: number;
}) {
  const label =
    disabledLabel ??
    (mode === "super" && burstCount
      ? `Nudge ×${burstCount}`
      : pendingCount
        ? "Sending..."
        : "Nudge");

  return (
    <button
      aria-label={
        disabledLabel ??
        (mode === "super" && burstCount
          ? `${burstCount} of 10 Super Nudges sent this minute.`
          : pendingCount
            ? "Sending nudge."
          : mode === "super"
            ? "Nudge. Super Nudge allows ten per minute."
            : "Nudge. One per minute.")
      }
      className="mac-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[var(--color-mac-yellow)] px-3 text-xs font-semibold text-[#141414] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <BellRing
        aria-hidden
        className={pendingCount ? "animate-pulse" : undefined}
        size={14}
      />
      {label}
    </button>
  );
}
