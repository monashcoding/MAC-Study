"use client";

import { BellRing } from "lucide-react";

export function NudgePill({
  disabled = false,
  disabledLabel,
  onClick,
  pendingCount = 0,
}: {
  disabled?: boolean;
  disabledLabel?: string;
  onClick: () => void;
  pendingCount?: number;
}) {
  const label = disabledLabel ?? (pendingCount ? "Sending..." : "Nudge");

  return (
    <button
      aria-label={
        disabledLabel ??
        (pendingCount ? "Sending nudge." : "Nudge. One per minute.")
      }
      className="mac-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[var(--color-mac-yellow)] px-3 text-xs font-semibold text-[#141414] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled || pendingCount > 0}
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
