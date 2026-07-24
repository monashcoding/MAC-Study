"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import {
  enablePushNotifications,
  getPushStatus,
  supportsPushNotifications,
} from "@/lib/push/client";

export function NotificationOnboarding({ userId }: { userId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const storageKey = `mac-notification-onboarding:${userId}`;

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 63.999rem)").matches;
    const alreadySeen = window.localStorage.getItem(storageKey) === "seen";

    if (
      isMobile &&
      !alreadySeen &&
      supportsPushNotifications() &&
      Notification.permission === "default"
    ) {
      setIsOpen(true);
    }
  }, [storageKey]);

  function dismiss() {
    window.localStorage.setItem(storageKey, "seen");
    setIsOpen(false);
  }

  async function enable() {
    setIsEnabling(true);
    setFeedback(null);

    try {
      const status = await getPushStatus();
      await enablePushNotifications(status.publicKey);
      dismiss();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Could not enable notifications.",
      );
      setIsEnabling(false);
    }
  }

  if (!isOpen) return null;

  return (
    <AppDialog
      bodyClassName="space-y-5 text-center"
      closeLabel="Not now"
      footer={
        <div className="grid gap-2">
          <button
            className="mac-focus h-12 rounded-lg bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-45"
            disabled={isEnabling}
            onClick={() => void enable()}
            type="button"
          >
            {isEnabling ? "Enabling…" : "Enable notifications"}
          </button>
          <button
            className="mac-focus h-11 rounded-lg text-sm font-semibold text-[var(--color-text-muted)]"
            disabled={isEnabling}
            onClick={dismiss}
            type="button"
          >
            Not now
          </button>
        </div>
      }
      maxWidthClassName="max-w-sm"
      onClose={dismiss}
      title="Stay in the loop"
    >
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)]">
        <BellRing aria-hidden size={28} />
      </span>
      <div>
        <p className="font-medium">
          Get friend requests, nudges and study updates.
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          You can enable or disable each alert type in Settings anytime.
        </p>
      </div>
      {feedback ? (
        <p className="text-sm text-[var(--color-danger)]" role="status">
          {feedback}
        </p>
      ) : null}
    </AppDialog>
  );
}
