"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share } from "lucide-react";
import { AppDialog } from "@/components/app-dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallOnboarding({
  onComplete,
  userId,
}: {
  onComplete: () => void;
  userId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const storageKey = `mac-install-onboarding:${userId}`;

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone ===
          true);
    const mobile = window.matchMedia("(max-width: 63.999rem)").matches;

    if (
      standalone ||
      !mobile ||
      window.localStorage.getItem(storageKey) === "seen"
    ) {
      onComplete();
      return;
    }

    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    }

    function handleInstalled() {
      window.localStorage.setItem(storageKey, "seen");
      setIsOpen(false);
      onComplete();
    }

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    const openingFrame = window.requestAnimationFrame(() => setIsOpen(true));

    return () => {
      window.cancelAnimationFrame(openingFrame);
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [onComplete, storageKey]);

  function dismiss() {
    window.localStorage.setItem(storageKey, "seen");
    setIsOpen(false);
    onComplete();
  }

  async function install() {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        window.localStorage.setItem(storageKey, "seen");
        setIsOpen(false);
        onComplete();
      }
    } finally {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setIsInstalling(false);
    }
  }

  if (!isOpen) return null;

  return (
    <AppDialog
      bodyClassName="space-y-4"
      closeLabel="Not now"
      footer={
        <div className="grid gap-2">
          {canInstall ? (
            <button
              className="mac-focus inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-45"
              disabled={isInstalling}
              onClick={() => void install()}
              type="button"
            >
              <Download aria-hidden size={18} />
              {isInstalling ? "Installing…" : "Install MAC Study"}
            </button>
          ) : null}
          <button
            className="mac-focus h-11 rounded-lg text-sm font-semibold text-[var(--color-text-muted)]"
            disabled={isInstalling}
            onClick={dismiss}
            type="button"
          >
            Not now
          </button>
        </div>
      }
      maxWidthClassName="max-w-sm"
      onClose={dismiss}
      title="Put MAC Study on your phone"
    >
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">
        Open MAC Study from your Home Screen for the full app experience.
      </p>
      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(255_227_48/0.12)] text-xs font-bold text-[var(--color-mac-yellow)]">
            1
          </span>
          <span>Open this page in Safari on iPhone.</span>
        </li>
        <li className="flex gap-3">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(255_227_48/0.12)] text-xs font-bold text-[var(--color-mac-yellow)]">
            2
          </span>
          <span className="inline-flex items-center gap-1">
            Tap Share <Share aria-hidden size={14} /> then Add to Home Screen.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(255_227_48/0.12)] text-xs font-bold text-[var(--color-mac-yellow)]">
            3
          </span>
          <span>Turn on Open as Web App, then tap Add. Bang.</span>
        </li>
      </ol>
      <p className="text-xs leading-5 text-[var(--color-text-muted)]">
        On Android, use Chrome’s three-dot menu, then Add to Home screen and
        Install.
      </p>
    </AppDialog>
  );
}
