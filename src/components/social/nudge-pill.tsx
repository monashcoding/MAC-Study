"use client";

import { BellRing } from "lucide-react";

export function NudgePill({
  disabled = false,
  isSending = false,
  onClick,
}: {
  disabled?: boolean;
  isSending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="mac-focus inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-[var(--color-mac-yellow)] px-3 text-xs font-semibold text-[#141414] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled || isSending}
      onClick={onClick}
      type="button"
    >
      <BellRing aria-hidden size={14} />
      {isSending ? "Nudging" : "Nudge"}
    </button>
  );
}
