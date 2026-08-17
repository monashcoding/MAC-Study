"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function AppDialog({
  bodyClassName,
  children,
  closeLabel = "Close dialog",
  confirmDiscard = true,
  footer,
  isDirty = false,
  maxWidthClassName = "max-w-xl",
  onClose,
  title,
  titleClassName,
  variant = "default",
}: {
  bodyClassName?: string;
  children?: ReactNode;
  closeLabel?: string;
  confirmDiscard?: boolean;
  footer?: ReactNode;
  isDirty?: boolean;
  maxWidthClassName?: string;
  onClose: () => void;
  title: string;
  titleClassName?: string;
  variant?: "confirmation" | "default";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const keepEditingButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const titleId = useId();

  const closeImmediately = useCallback(() => {
    onClose();
  }, [onClose]);

  const requestBackdropClose = useCallback(() => {
    if (confirmDiscard && isDirty) {
      setShowDiscardPrompt(true);
      return;
    }

    onClose();
  }, [confirmDiscard, isDirty, onClose]);

  useEffect(() => {
    if (!showDiscardPrompt) return;

    const frame = window.requestAnimationFrame(() => {
      keepEditingButtonRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [showDiscardPrompt]);

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const preferred = panel?.querySelector<HTMLElement>(
        "[data-dialog-autofocus]",
      );
      const firstUseful = getFocusableElements(panel).find(
        (element) => !element.hasAttribute("data-dialog-close"),
      );

      (preferred ?? firstUseful ?? closeButtonRef.current)?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeImmediately();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(panelRef.current);
      if (!focusable.length) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (
        event.shiftKey &&
        (active === first || !panelRef.current?.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !panelRef.current?.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;

      const opener = openerRef.current;
      window.requestAnimationFrame(() => opener?.focus());
    };
  }, [closeImmediately]);

  const dialog = (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-x-0 top-0 z-50 flex h-[var(--app-viewport-height)] min-h-0 items-center justify-center overflow-hidden bg-black/58 px-3 pb-[calc(var(--mobile-nav-height)+0.75rem)] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm lg:pb-[max(0.75rem,var(--safe-area-bottom))]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestBackdropClose();
      }}
      role="dialog"
    >
      <div
        className={cn(
          "relative flex max-h-full w-full flex-col overflow-hidden shadow-2xl lg:max-h-[min(88dvh,720px)]",
          variant === "confirmation"
            ? "rounded-lg bg-[var(--color-background)]"
            : "rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]",
          maxWidthClassName,
        )}
        data-dialog-variant={variant}
        ref={panelRef}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 px-4 py-3",
            variant === "default" &&
              "border-b border-[var(--color-border)] bg-[rgb(20_20_20/0.96)] backdrop-blur-xl",
          )}
        >
          <h2
            className={cn(
              "min-w-0 text-lg font-semibold",
              titleClassName ?? "truncate",
            )}
            id={titleId}
          >
            {title}
          </h2>
          <button
            aria-label={closeLabel}
            className={cn(
              "mac-focus inline-flex h-11 w-11 shrink-0 items-center justify-center text-[var(--color-text-muted)] transition hover:text-[var(--color-text)]",
              variant === "confirmation"
                ? "rounded-md hover:bg-[rgb(255_255_255/0.045)]"
                : "rounded-xl border border-[var(--color-border)] bg-[rgb(255_255_255/0.025)] hover:bg-[rgb(255_255_255/0.06)]",
            )}
            data-dialog-close
            onClick={closeImmediately}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden size={18} />
          </button>
        </div>

        {children ? (
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4",
              bodyClassName,
            )}
          >
            {children}
          </div>
        ) : null}

        {footer ? (
          <div
            className={cn(
              "shrink-0 p-4",
              variant === "default" &&
                "border-t border-[var(--color-border)] bg-[rgb(20_20_20/0.96)] backdrop-blur-xl",
            )}
          >
            {footer}
          </div>
        ) : null}

        {showDiscardPrompt ? (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/72 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowDiscardPrompt(false);
              }
            }}
          >
            <div
              className="w-full max-w-sm rounded-lg border border-[rgb(255_227_48/0.42)] bg-[var(--color-surface-raised)] p-4 shadow-[0_22px_70px_rgb(0_0_0/0.7)]"
              role="alert"
            >
              <p className="font-semibold">Discard unsaved changes?</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="mac-focus h-11 rounded-md border border-[var(--color-border)] text-sm font-semibold"
                  onClick={() => setShowDiscardPrompt(false)}
                  ref={keepEditingButtonRef}
                  type="button"
                >
                  Keep editing
                </button>
                <button
                  className="mac-focus h-11 rounded-md border border-[rgb(255_107_107/0.55)] bg-[rgb(255_107_107/0.07)] text-sm font-semibold text-[var(--color-danger)]"
                  onClick={onClose}
                  type="button"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(dialog, document.body);
}

function getFocusableElements(root: HTMLElement | null) {
  if (!root) return [];

  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}
