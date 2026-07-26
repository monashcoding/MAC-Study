"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

export function TransientToast({
  actionLabel,
  durationMs = 2400,
  message,
  onAction,
  onDismiss,
}: {
  actionLabel?: string;
  durationMs?: number;
  message: string | null;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  const onDismissRef = useRef(onDismiss);
  const onActionRef = useRef(onAction);
  onDismissRef.current = onDismiss;
  onActionRef.current = onAction;

  useEffect(() => {
    if (!message) return;

    const timeout = window.setTimeout(
      () => onDismissRef.current(),
      durationMs,
    );
    return () => window.clearTimeout(timeout);
  }, [durationMs, message]);

  if (!message) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--mobile-nav-height)+var(--safe-area-bottom)+1rem)] z-[90] flex justify-center lg:bottom-6"
      role="status"
    >
      <div className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--color-mac-yellow)] px-4 py-2.5 text-sm font-semibold text-[#141414] shadow-[0_16px_42px_rgb(0_0_0/0.38)]">
        <Check aria-hidden size={17} strokeWidth={2.6} />
        {message}
        {actionLabel && onAction ? (
          <button
            className="mac-focus -my-1 ml-1 min-h-9 rounded-full bg-black/12 px-3 text-sm font-bold text-[#141414] transition hover:bg-black/20"
            onClick={() => onActionRef.current?.()}
            type="button"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
