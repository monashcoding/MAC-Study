"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import {
  enablePushNotifications,
  getPushStatus,
  supportsPushNotifications,
} from "@/lib/push/client";

export function NotificationOnboarding({
  enabled = true,
}: {
  enabled?: boolean;
  userId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;

    function openNotificationOnboarding() {
      if (!supportsPushNotifications()) {
        setFeedback("Notifications are unavailable on this device.");
      } else if (Notification.permission === "default") {
        setFeedback(null);
      } else if (Notification.permission === "denied") {
        setFeedback("Notifications are blocked in your browser settings.");
      } else {
        setFeedback("Notifications are already enabled on this device.");
      }

      setIsOpen(true);
    }

    window.addEventListener(
      "mac-open-notification-onboarding",
      openNotificationOnboarding,
    );
    return () =>
      window.removeEventListener(
        "mac-open-notification-onboarding",
        openNotificationOnboarding,
      );
  }, [enabled]);

  function dismiss() {
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
      setFeedback(getOnboardingError(error));
      setIsEnabling(false);
    }
  }

  if (!isOpen) return null;
  const canRequestPermission =
    supportsPushNotifications() && Notification.permission === "default";

  return (
    <AppDialog
      bodyClassName="space-y-5 text-center"
      closeLabel="Not now"
      footer={
        <div className="grid gap-2">
          <button
            className="mac-focus h-12 rounded-lg bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-45"
            disabled={isEnabling || !canRequestPermission}
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
          Get friend requests, nudges and study updates when they matter.
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          You can choose alert types in Settings anytime. We only ask after you
          choose to turn them on.
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

function getOnboardingError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/service worker|pushmanager|subscribe/i.test(message)) {
    return "Notifications are not ready yet. Reload the app and try again.";
  }

  if (/blocked|denied/i.test(message)) {
    return "Notifications are blocked in your browser settings.";
  }

  return "Could not enable notifications. Try again.";
}
