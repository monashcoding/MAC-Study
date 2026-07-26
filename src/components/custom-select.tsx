"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CustomSelectOption<T extends string | number> = {
  label: string;
  swatchColor?: string;
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
  options: readonly CustomSelectOption<T>[];
  placeholder?: string;
  placement?: "bottom" | "top";
  size?: "compact" | "default";
  value: T | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const optionsRef = useRef(options);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const valueRef = useRef(value);
  optionsRef.current = options;
  valueRef.current = value;
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

  useEffect(() => {
    if (!isOpen) return;

    const selectedIndex = optionsRef.current.findIndex(
      (option) => option.value === valueRef.current,
    );
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(nextIndex);

    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[nextIndex]?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
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
          return;
        }

        if (!isOpen || !options.length) return;

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          const nextIndex =
            (activeIndex + direction + options.length) % options.length;
          setActiveIndex(nextIndex);
          optionRefs.current[nextIndex]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          const nextIndex = event.key === "Home" ? 0 : options.length - 1;
          setActiveIndex(nextIndex);
          optionRefs.current[nextIndex]?.focus();
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onChange(options[activeIndex].value);
          setIsOpen(false);
          triggerRef.current?.focus();
        } else if (event.key === "Tab") {
          setIsOpen(false);
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
          size === "compact" ? "h-10 px-2.5 text-xs" : "h-11 px-3 text-sm",
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
        <span className="flex min-w-0 items-center gap-2.5">
          {selectedOption?.swatchColor ? (
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 rounded-full border border-black/15"
              style={{ backgroundColor: selectedOption.swatchColor }}
            />
          ) : null}
          <span
            className={cn(
              "truncate",
              !selectedOption && "text-[var(--color-text-muted)]",
            )}
          >
            {selectedOption?.label ?? placeholder}
          </span>
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
            const optionIndex = options.indexOf(option);

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
                onFocus={() => setActiveIndex(optionIndex)}
                ref={(element) => {
                  optionRefs.current[optionIndex] = element;
                }}
                role="option"
                tabIndex={activeIndex === optionIndex ? 0 : -1}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {option.swatchColor ? (
                    <span
                      aria-hidden
                      className="h-4 w-4 shrink-0 rounded-full border border-black/15"
                      style={{ backgroundColor: option.swatchColor }}
                    />
                  ) : null}
                  <span className="truncate font-medium">{option.label}</span>
                </span>
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
