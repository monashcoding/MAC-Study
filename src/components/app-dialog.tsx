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
  footer,
  isDirty = false,
  maxWidthClassName = "max-w-xl",
  onClose,
  title,
}: {
  bodyClassName?: string;
  children: ReactNode;
  closeLabel?: string;
  footer?: ReactNode;
  isDirty?: boolean;
  maxWidthClassName?: string;
  onClose: () => void;
  title: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const keepEditingButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const isDirtyRef = useRef(isDirty);
  const openerRef = useRef<HTMLElement | null>(null);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const titleId = useId();

  onCloseRef.current = onClose;
  isDirtyRef.current = isDirty;

  const requestClose = useCallback(() => {
    if (isDirtyRef.current) {
      setShowDiscardPrompt(true);
      return;
    }

    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!isDirty) setShowDiscardPrompt(false);
  }, [isDirty]);

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
        requestClose();
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
  }, [requestClose]);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-x-0 top-0 z-50 flex h-[var(--app-viewport-height)] items-center justify-center bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      role="dialog"
    >
      <div
        className={cn(
          "flex max-h-[min(88dvh,720px)] w-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl",
          maxWidthClassName,
        )}
        ref={panelRef}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[rgb(20_20_20/0.96)] px-4 py-3 backdrop-blur-xl">
          <h2 className="min-w-0 truncate text-lg font-semibold" id={titleId}>
            {title}
          </h2>
          <button
            aria-label={closeLabel}
            className="mac-focus inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[rgb(255_255_255/0.025)] text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.06)] hover:text-[var(--color-text)]"
            data-dialog-close
            onClick={requestClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden size={18} />
          </button>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4",
            bodyClassName,
          )}
        >
          {children}
        </div>

        {showDiscardPrompt ? (
          <div
            className="shrink-0 border-t border-[var(--color-border)] bg-[rgb(20_20_20/0.98)] p-4"
            role="alert"
          >
            <p className="text-sm font-semibold">Discard unsaved changes?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="mac-focus h-11 rounded-md border border-[var(--color-border)] text-sm font-semibold"
                onClick={() => setShowDiscardPrompt(false)}
                ref={keepEditingButtonRef}
                type="button"
              >
                Keep editing
              </button>
              <button
                className="mac-focus h-11 rounded-md border border-[rgb(255_107_107/0.45)] text-sm font-semibold text-[var(--color-danger)]"
                onClick={() => onCloseRef.current()}
                type="button"
              >
                Discard
              </button>
            </div>
          </div>
        ) : footer ? (
          <div className="shrink-0 border-t border-[var(--color-border)] bg-[rgb(20_20_20/0.96)] p-4 backdrop-blur-xl">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
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
