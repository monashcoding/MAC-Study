"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CustomSelectOption<T extends string | number> = {
  label: string;
  value: T;
};

export function CustomSelect<T extends string | number>({
  ariaLabel,
  className,
  disabled = false,
  onChange,
  options,
  placeholder = "Choose an option",
  placement = "bottom",
  size = "default",
  value,
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: CustomSelectOption<T>[];
  placeholder?: string;
  placement?: "bottom" | "top";
  size?: "compact" | "default";
  value: T | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOption =
    options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <div
      className={cn("relative", isOpen && "z-40", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      }}
      ref={rootRef}
    >
      <button
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn(
          "mac-focus grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border bg-[var(--color-surface)] text-left font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
          size === "compact"
            ? "h-9 px-2.5 text-xs"
            : "h-11 px-3 text-sm",
          isOpen
            ? "border-[var(--color-mac-yellow)] ring-2 ring-[rgb(255_227_48/0.18)]"
            : "border-[var(--color-border)] hover:border-[rgb(255_255_255/0.18)]",
        )}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span
          className={cn(
            "truncate",
            !selectedOption && "text-[var(--color-text-muted)]",
          )}
        >
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "shrink-0 text-[var(--color-text-muted)] transition-transform",
            isOpen && "rotate-180",
          )}
          size={size === "compact" ? 14 : 17}
        />
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute z-50 max-h-60 min-w-full overflow-y-auto overscroll-contain rounded-xl border border-[var(--color-border)] bg-[rgb(30_30_30/0.99)] p-1.5 shadow-[0_18px_50px_rgb(0_0_0/0.52)] backdrop-blur-xl",
            placement === "top"
              ? "bottom-[calc(100%+0.45rem)] right-0"
              : "left-0 top-[calc(100%+0.45rem)]",
            size === "compact" && "w-max max-w-[15rem]",
          )}
          id={listboxId}
          role="listbox"
        >
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                aria-selected={selected}
                className={cn(
                  "mac-focus grid min-h-10 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                  selected
                    ? "bg-[rgb(255_227_48/0.12)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)] hover:bg-[rgb(255_255_255/0.055)] hover:text-[var(--color-text)]",
                )}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                role="option"
                type="button"
              >
                <span className="truncate font-medium">{option.label}</span>
                {selected ? (
                  <Check
                    aria-hidden
                    className="text-[var(--color-mac-yellow)]"
                    size={15}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
