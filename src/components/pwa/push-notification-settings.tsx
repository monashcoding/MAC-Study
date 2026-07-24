"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Hand,
  MessagesSquare,
  UserRoundPlus,
} from "lucide-react";
import {
  fetchRemoteNotificationPreferences,
  updateRemoteNotificationPreferences,
  type RemoteNotificationPreferences,
} from "@/lib/supabase/app-data";
import {
  enablePushNotifications,
  getPushStatus,
  type PushStatus,
} from "@/lib/push/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const defaultPreferences: RemoteNotificationPreferences = {
  friendNotifications: true,
  nudgeNotifications: true,
  otherNotifications: true,
};

export function PushNotificationSettings() {
  const [pushStatus, setPushStatus] = useState<PushStatus>({
    message: "Checking…",
    publicKey: null,
    state: "checking",
  });
  const [preferences, setPreferences] =
    useState<RemoteNotificationPreferences>(defaultPreferences);
  const [savingKey, setSavingKey] = useState<
    keyof RemoteNotificationPreferences | null
  >(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const status = await getPushStatus();
      if (!cancelled) setPushStatus(status);

      try {
        const supabase = createSupabaseBrowserClient();
        const nextPreferences =
          await fetchRemoteNotificationPreferences(supabase);
        if (!cancelled) setPreferences(nextPreferences);
      } catch {
        // Keep safe defaults for demo mode or before the migration is applied.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enablePush() {
    setFeedback(null);
    setPushStatus((current) => ({
      ...current,
      message: "Waiting for permission…",
      state: "checking",
    }));

    try {
      await enablePushNotifications(pushStatus.publicKey);
      setPushStatus({
        message: "On for this device",
        publicKey: pushStatus.publicKey,
        state: "enabled",
      });
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not enable alerts.",
      );
      setPushStatus(await getPushStatus());
    }
  }

  async function togglePreference(
    key: keyof RemoteNotificationPreferences,
  ) {
    const previous = preferences;
    const next = { ...previous, [key]: !previous[key] };
    setPreferences(next);
    setSavingKey(key);
    setFeedback(null);

    try {
      const supabase = createSupabaseBrowserClient();
      await updateRemoteNotificationPreferences({
        preferences: next,
        supabase,
      });
      window.dispatchEvent(
        new CustomEvent("mac-notification-preferences-changed", {
          detail: next,
        }),
      );
    } catch {
      setPreferences(previous);
      setFeedback("Could not save notification settings.");
    } finally {
      setSavingKey(null);
    }
  }

  const enabled = pushStatus.state === "enabled";

  return (
    <div className="px-3 py-4">
      <div className="mb-3">
        <p className="font-semibold">Notifications</p>
        <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
          Choose what can alert you.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[rgb(255_255_255/0.018)]">
        <div className="flex items-center justify-between gap-4 px-3 py-3.5">
          <SettingIcon>
            {enabled ? (
              <CheckCircle2 aria-hidden size={18} />
            ) : (
              <Bell aria-hidden size={18} />
            )}
          </SettingIcon>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Device alerts</p>
            <p className="truncate text-sm text-[var(--color-text-muted)]">
              {pushStatus.message}
            </p>
          </div>
          <button
            className={cn(
              "mac-focus inline-flex h-10 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
              enabled
                ? "bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]"
                : "bg-[var(--color-mac-yellow)] text-[#141414]",
            )}
            disabled={
              enabled ||
              pushStatus.state === "blocked" ||
              pushStatus.state === "checking" ||
              pushStatus.state === "unsupported"
            }
            onClick={() => void enablePush()}
            type="button"
          >
            {enabled ? "Enabled" : "Enable"}
          </button>
        </div>

        <div className="border-t border-[var(--color-border)]">
          <PreferenceRow
            checked={preferences.friendNotifications}
            disabled={savingKey !== null}
            icon={<UserRoundPlus aria-hidden size={18} />}
            label="Friend activity"
            onChange={() => void togglePreference("friendNotifications")}
          />
          <PreferenceRow
            checked={preferences.nudgeNotifications}
            disabled={savingKey !== null}
            icon={<Hand aria-hidden size={18} />}
            label="Nudges"
            onChange={() => void togglePreference("nudgeNotifications")}
          />
          <PreferenceRow
            checked={preferences.otherNotifications}
            disabled={savingKey !== null}
            icon={<MessagesSquare aria-hidden size={18} />}
            label="Other activity"
            onChange={() => void togglePreference("otherNotifications")}
          />
        </div>
      </div>

      {feedback ? (
        <p className="mt-2 text-sm text-[var(--color-danger)]" role="status">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

function PreferenceRow({
  checked,
  disabled,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onChange: () => void;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-[var(--color-border)] px-3 last:border-b-0">
      <SettingIcon>{icon}</SettingIcon>
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      <button
        aria-checked={checked}
        aria-label={`${label} notifications`}
        className={cn(
          "mac-focus relative h-8 w-14 shrink-0 rounded-full border transition disabled:opacity-50",
          checked
            ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-raised)]",
        )}
        disabled={disabled}
        onClick={onChange}
        role="switch"
        type="button"
      >
        <span
          className={cn(
            "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

function SettingIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(255_255_255/0.045)] text-[var(--color-mac-yellow)]">
      {children}
    </span>
  );
}
