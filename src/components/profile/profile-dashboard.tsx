"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  FlaskConical,
  LoaderCircle,
  LogOut,
  MonitorDown,
  PencilLine,
  Smartphone,
  UserRound,
} from "lucide-react";
import {
  ProfileIdentityFields,
  useUsernameAvailability,
} from "@/components/auth/profile-identity-form";
import { DiscoverabilitySetting } from "@/components/profile/discoverability-setting";
import type { InstallGuideTarget } from "@/components/pwa/install-onboarding";
import { PushNotificationSettings } from "@/components/pwa/push-notification-settings";
import {
  isOnboardingPreviewAvailable,
  startOnboardingPreview,
} from "@/lib/onboarding-preview";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function ProfileDashboard({
  displayName,
  initialDiscoverable,
  userId,
  username,
}: {
  displayName: string;
  initialDiscoverable: boolean;
  userId: string | null;
  username: string | null;
}) {
  const [profile, setProfile] = useState({ displayName, username });
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)] lg:items-start lg:gap-6">
      {/* Mobile order: profile, privacy, notifications, getting started. */}
      <div className="contents lg:block lg:space-y-4">
        <section className={cn(cardClassName, "order-1")}>
          <div className="flex items-center gap-3 p-4 lg:p-5">
            <ProfileAvatar displayName={profile.displayName} />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {profile.displayName}
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                {profile.username ? `@${profile.username}` : "@set_username"}
              </p>
            </div>
            {userId && !isEditing ? (
              <button
                className="mac-focus ml-auto inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-muted)] transition hover:border-[rgb(255_255_255/0.2)] hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)]"
                onClick={() => setIsEditing(true)}
                type="button"
              >
                <PencilLine aria-hidden size={16} />
                <span>Edit profile</span>
              </button>
            ) : null}
          </div>

          {userId && isEditing ? (
            <ProfileEditor
              defaultName={profile.displayName}
              defaultUsername={profile.username ?? ""}
              onCancel={() => setIsEditing(false)}
              onSaved={(next) => {
                setProfile(next);
                setIsEditing(false);
              }}
              userId={userId}
            />
          ) : null}
        </section>

        <SettingsSection className="order-4" title="Getting started">
          <ActionRow
            className="hidden lg:flex"
            detail="Its own window and a spot on your taskbar"
            icon={MonitorDown}
            label="Install on your PC"
            onClick={() => openInstallGuide("pc")}
          />
          <ActionRow
            detail="Open it from your Home Screen like any app"
            icon={Smartphone}
            label="Add to your phone"
            onClick={() => openInstallGuide("phone")}
          />
          {isOnboardingPreviewAvailable ? (
            <ActionRow
              detail="Replay first sign-in as a new account. Your real progress stays as it is."
              icon={FlaskConical}
              label="Preview onboarding"
              onClick={startOnboardingPreview}
            />
          ) : null}
        </SettingsSection>
      </div>

      <div className="contents lg:block lg:space-y-4">
        <SettingsSection className="order-3" title="Notifications">
          <PushNotificationSettings />
        </SettingsSection>

        {userId ? (
          <SettingsSection className="order-2" title="Privacy">
            <DiscoverabilitySetting
              initialDiscoverable={initialDiscoverable}
              userId={userId}
            />
          </SettingsSection>
        ) : null}

        <a
          className="mac-focus order-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[rgb(255_107_107/0.35)] bg-[rgb(255_107_107/0.06)] font-semibold text-[var(--color-danger)] transition hover:border-[rgb(255_107_107/0.55)] hover:bg-[rgb(255_107_107/0.12)]"
          href="/auth/logout"
        >
          <LogOut aria-hidden size={18} />
          Sign out
        </a>
      </div>
    </div>
  );
}

const cardClassName =
  "overflow-hidden rounded-lg border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.025)]";

function SettingsSection({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={cn(cardClassName, className)}>
      <h2 className="px-4 pb-1 pt-4 text-base font-semibold lg:px-5">
        {title}
      </h2>
      <div className="divide-y divide-[rgb(255_255_255/0.07)] pb-1">
        {children}
      </div>
    </section>
  );
}

function ActionRow({
  className,
  detail,
  icon: Icon,
  label,
  onClick,
}: {
  className?: string;
  detail?: string;
  icon: typeof Smartphone;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "mac-focus flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[rgb(255_255_255/0.04)] lg:px-5",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
        <Icon aria-hidden size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {detail ? (
          <span className="mt-0.5 block text-sm text-[var(--color-text-muted)]">
            {detail}
          </span>
        ) : null}
      </span>
      <ChevronRight
        aria-hidden
        className="shrink-0 text-[var(--color-text-muted)]"
        size={18}
      />
    </button>
  );
}

function ProfileEditor({
  defaultName,
  defaultUsername,
  onCancel,
  onSaved,
  userId,
}: {
  defaultName: string;
  defaultUsername: string;
  onCancel: () => void;
  onSaved: (profile: { displayName: string; username: string }) => void;
  userId: string;
}) {
  const router = useRouter();
  const usernameField = useUsernameAvailability({ defaultUsername, userId });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.getElementById("displayName")?.focus();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (usernameField.isBlocked || isSaving) return;

    const formData = new FormData(event.currentTarget);
    const nextName = `${formData.get("displayName") ?? ""}`
      .replace(/\s+/g, " ")
      .trim();
    const nextUsername = usernameField.normalizedUsername;

    if (nextName.length < 2 || nextName.length > 60) {
      setError("Use a name between 2 and 60 characters.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ display_name: nextName, username: nextUsername })
        .eq("id", userId);

      if (updateError) {
        setError(
          updateError.code === "23505"
            ? "That username is already taken."
            : "Could not save your profile. Try again.",
        );
        return;
      }

      onSaved({ displayName: nextName, username: nextUsername });
      // The app shell reads the profile on the server, so refresh its copy.
      router.refresh();
    } catch {
      setError("Could not save your profile. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="space-y-4 border-t border-[rgb(255_255_255/0.07)] p-4 lg:p-5"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isSaving) onCancel();
      }}
      onSubmit={(event) => void save(event)}
    >
      <ProfileIdentityFields
        defaultName={defaultName}
        usernameField={usernameField}
      />

      {error ? (
        <p
          className="rounded-md border border-[rgb(255_107_107/0.45)] bg-[rgb(255_107_107/0.08)] p-3 text-sm text-[var(--color-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          className="mac-focus h-11 rounded-md px-4 text-sm font-semibold text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)] disabled:opacity-50"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          aria-busy={isSaving}
          className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] disabled:opacity-50"
          disabled={usernameField.isBlocked || isSaving}
          type="submit"
        >
          {isSaving ? (
            <>
              <LoaderCircle aria-hidden className="animate-spin" size={17} />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </form>
  );
}

function ProfileAvatar({ displayName }: { displayName: string }) {
  const initials = getInitials(displayName);

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-[#141414] lg:h-16 lg:w-16">
      {initials ? (
        <span className="font-semibold lg:text-xl">{initials}</span>
      ) : (
        <UserRound aria-hidden size={28} />
      )}
    </div>
  );
}

function openInstallGuide(target: InstallGuideTarget) {
  window.dispatchEvent(
    new CustomEvent<InstallGuideTarget>("mac-open-install-guide", {
      detail: target,
    }),
  );
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
