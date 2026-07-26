"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { AtSign, LoaderCircle, UserRound } from "lucide-react";
import { saveProfileIdentity } from "@/app/(auth)/auth/profile/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Availability =
  "available" | "checking" | "error" | "idle" | "invalid" | "taken";

export function ProfileIdentityForm({
  defaultName,
  defaultUsername,
  errorText,
  isEditing,
  next,
  submitLabel,
  userId,
}: {
  defaultName: string;
  defaultUsername: string;
  errorText: string | null;
  isEditing: boolean;
  next: string;
  submitLabel: string;
  userId: string;
}) {
  const [username, setUsername] = useState(defaultUsername);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const normalizedUsername = normalizeUsername(username);

  useEffect(() => {
    if (!normalizedUsername) {
      setAvailability("idle");
      return;
    }

    if (!isValidUsername(normalizedUsername)) {
      setAvailability("invalid");
      return;
    }

    if (normalizedUsername === normalizeUsername(defaultUsername)) {
      setAvailability("available");
      return;
    }

    let cancelled = false;
    setAvailability("checking");

    const timeout = window.setTimeout(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", normalizedUsername)
          .neq("id", userId)
          .limit(1);

        if (!cancelled) {
          setAvailability(
            error ? "error" : data?.length ? "taken" : "available",
          );
        }
      } catch {
        if (!cancelled) {
          setAvailability("error");
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [defaultUsername, normalizedUsername, userId]);

  return (
    <form
      action={saveProfileIdentity}
      className="mt-6 space-y-4"
      onSubmit={() => setIsSubmitting(true)}
    >
      <input name="edit" type="hidden" value={isEditing ? "1" : "0"} />
      <input name="next" type="hidden" value={next} />

      <div>
        <label className="block text-sm font-medium" htmlFor="displayName">
          Name
        </label>
        <div className="mt-2 flex h-12 items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 focus-within:border-[var(--color-mac-yellow)]">
          <UserRound
            aria-hidden
            className="shrink-0 text-[var(--color-text-muted)]"
            size={18}
          />
          <input
            autoComplete="name"
            className="mac-focus min-w-0 flex-1 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
            defaultValue={defaultName}
            id="displayName"
            maxLength={60}
            minLength={2}
            name="displayName"
            placeholder="Steven Phan"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="username">
          Username
        </label>
        <div className="mt-2 flex h-12 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 focus-within:border-[var(--color-mac-yellow)]">
          <AtSign
            aria-hidden
            className="shrink-0 text-[var(--color-text-muted)]"
            size={18}
          />
          <input
            aria-describedby="username-status"
            autoCapitalize="none"
            autoComplete="username"
            className="mac-focus min-w-0 flex-1 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
            id="username"
            maxLength={24}
            minLength={3}
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            pattern="[a-zA-Z0-9_]+"
            placeholder="stevenphanny"
            required
            value={username}
          />
          {availability === "checking" ? (
            <LoaderCircle
              aria-hidden
              className="shrink-0 animate-spin text-[var(--color-text-muted)]"
              size={17}
            />
          ) : null}
        </div>
        <UsernameStatus
          availability={availability}
          defaultUsername={defaultUsername}
          normalizedUsername={normalizedUsername}
        />
      </div>

      <SubmitButton
        disabled={
          availability === "checking" ||
          availability === "invalid" ||
          availability === "taken"
        }
        label={submitLabel}
        submitting={isSubmitting}
      />

      {errorText ? (
        <p className="rounded-md border border-[rgb(255_107_107/0.45)] bg-[rgb(255_107_107/0.08)] p-3 text-sm text-[var(--color-danger)]">
          {errorText}
        </p>
      ) : null}
    </form>
  );
}

function UsernameStatus({
  availability,
  defaultUsername,
  normalizedUsername,
}: {
  availability: Availability;
  defaultUsername: string;
  normalizedUsername: string;
}) {
  const unchanged = normalizedUsername === normalizeUsername(defaultUsername);

  if (availability === "available" && unchanged) {
    return null;
  }

  let className = "text-[var(--color-text-muted)]";
  let message = "Use 3–24 letters, numbers, or underscores.";

  if (availability === "checking") {
    message = "Checking availability…";
  } else if (availability === "invalid") {
    className = "text-[var(--color-danger)]";
    message = "Use 3–24 letters, numbers, or underscores.";
  } else if (availability === "taken") {
    className = "text-[var(--color-danger)]";
    message = `@${normalizedUsername} is taken.`;
  } else if (availability === "available") {
    className = "text-[var(--color-success)]";
    message = `@${normalizedUsername} is available.`;
  } else if (availability === "error") {
    message = "Could not check right now. You can still try saving.";
  }

  return (
    <p className={`mt-1.5 text-xs ${className}`} id="username-status">
      {message}
    </p>
  );
}

function SubmitButton({
  disabled,
  label,
  submitting,
}: {
  disabled: boolean;
  label: string;
  submitting: boolean;
}) {
  const { pending } = useFormStatus();
  const busy = pending || submitting;

  return (
    <button
      aria-busy={busy}
      className="mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-50"
      disabled={disabled || busy}
      type="submit"
    >
      {busy ? (
        <>
          <LoaderCircle aria-hidden className="animate-spin" size={18} />
          Saving…
        </>
      ) : (
        label
      )}
    </button>
  );
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function isValidUsername(value: string) {
  return /^[a-z0-9_]{3,24}$/.test(value);
}
