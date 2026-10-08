"use client";

import { cn } from "@/lib/utils";

type SwitchProps = {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  checked: boolean;
  className?: string;
  disabled?: boolean;
  id?: string;
  onCheckedChange: (checked: boolean) => void;
};

// The thumb sits in a padded flex track, so it stays centred at any size, and
// the off-state outline is an inset shadow so it never shifts the thumb.
export function Switch({
  checked,
  className,
  disabled = false,
  onCheckedChange,
  ...props
}: SwitchProps) {
  return (
    <button
      {...props}
      aria-checked={checked}
      className={cn(
        "mac-focus inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        checked
          ? "bg-[var(--color-mac-yellow)]"
          : "bg-[var(--color-surface-raised)] shadow-[inset_0_0_0_1px_var(--color-border)]",
        className,
      )}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          "h-6 w-6 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.4)] transition-transform duration-200 motion-reduce:transition-none",
          checked
            ? "translate-x-5 bg-[#141414]"
            : "translate-x-0 bg-[var(--color-text-muted)]",
        )}
      />
    </button>
  );
}
