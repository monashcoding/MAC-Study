"use client";

import { BellRing } from "lucide-react";

export function NudgePill({
  disabled = false,
  onClick,
  pendingCount = 0,
}: {
  disabled?: boolean;
  onClick: () => void;
  pendingCount?: number;
}) {
  return (
    <button
      aria-label={
        pendingCount
          ? `Nudge again. ${pendingCount} queued.`
          : "Nudge. Up to 10 per minute."
      }
      className="mac-focus inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-[var(--color-mac-yellow)] px-3 text-xs font-semibold text-[#141414] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <BellRing
        aria-hidden
        className={pendingCount ? "animate-pulse" : undefined}
        size={14}
      />
      {pendingCount ? `Nudge ×${pendingCount}` : "Nudge"}
    </button>
  );
}
