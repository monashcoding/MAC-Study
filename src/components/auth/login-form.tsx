"use client";

import { useMemo, useState, useTransition } from "react";
import { Mail, Sparkles } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({
  isConfigured,
  nextPath,
}: {
  isConfigured: boolean;
  nextPath: string;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", nextPath);

    return callbackUrl.toString();
  }, [nextPath]);

  function signInWithGoogle() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { error: signInError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
          },
        });

        if (signInError) {
          setError(signInError.message);
        }
      } catch (caughtError) {
        setError(getErrorMessage(caughtError));
      }
    });
  }

  function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectTo,
            shouldCreateUser: true,
          },
        });

        if (signInError) {
          setError(signInError.message);
          return;
        }

        setMessage("Check your email for a MAC Study sign-in link.");
      } catch (caughtError) {
        setError(getErrorMessage(caughtError));
      }
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {!isConfigured ? (
        <div className="rounded-md border border-[rgb(255_227_48/0.45)] bg-[rgb(255_227_48/0.08)] p-3 text-sm text-[var(--color-text)]">
          Supabase is not configured yet. Add
          <code className="mx-1 text-[var(--color-mac-yellow)]">
            NEXT_PUBLIC_SUPABASE_URL
          </code>
          and
          <code className="mx-1 text-[var(--color-mac-yellow)]">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>
          to enable real sign-in.
        </div>
      ) : null}

      <button
        className="mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-55"
        disabled={!isConfigured || isPending}
        onClick={signInWithGoogle}
        type="button"
      >
        <Sparkles aria-hidden size={18} />
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        or
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <form className="space-y-3" onSubmit={sendMagicLink}>
        <label className="block text-sm font-medium" htmlFor="email">
          Email magic link
        </label>
        <input
          className="mac-focus h-12 w-full rounded-md border border-[var(--color-border)] bg-[#262626] px-3 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
          disabled={!isConfigured || isPending}
          id="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        <button
          className="mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 font-semibold text-[var(--color-text)] disabled:opacity-55"
          disabled={!isConfigured || isPending}
          type="submit"
        >
          <Mail aria-hidden size={18} />
          Email me a link
        </button>
      </form>

      {message ? (
        <p className="rounded-md border border-[rgb(66_211_146/0.45)] bg-[rgb(66_211_146/0.08)] p-3 text-sm text-[var(--color-success)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-[rgb(255_107_107/0.45)] bg-[rgb(255_107_107/0.08)] p-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
