"use client";

import { useEffect, useState, useTransition } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import {
  completeMacSignIn,
  MacSignInRequiredError,
  type MacProvider,
  startMacSignIn,
} from "@/lib/auth/mac-auth-browser";

export function LoginForm({
  autoComplete,
  nextPath,
  returnedFromProvider,
}: {
  autoComplete: boolean;
  nextPath: string;
  returnedFromProvider: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!autoComplete) {
      return;
    }

    let cancelled = false;

    async function completeExistingMacSession() {
      try {
        await completeMacSignIn();

        if (!cancelled) {
          window.location.replace(nextPath);
        }
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        if (caughtError instanceof MacSignInRequiredError) {
          if (returnedFromProvider) {
            setError("MAC sign-in did not complete. Please try again.");
          }
          return;
        }

        setError(getErrorMessage(caughtError));
      }
    }

    void completeExistingMacSession();

    return () => {
      cancelled = true;
    };
  }, [autoComplete, nextPath, returnedFromProvider]);

  function signIn(provider: MacProvider) {
    setError(null);

    startTransition(async () => {
      try {
        // This completes immediately when another MAC app has already created
        // the shared session; otherwise continue through the selected provider.
        await completeMacSignIn();
        window.location.replace(nextPath);
      } catch (caughtError) {
        if (caughtError instanceof MacSignInRequiredError) {
          try {
            await startMacSignIn(provider, nextPath);
          } catch (startError) {
            setError(getErrorMessage(startError));
          }
          return;
        }

        setError(getErrorMessage(caughtError));
      }
    });
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        className="mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-55"
        disabled={isPending}
        onClick={() => signIn("google")}
        type="button"
      >
        <LogIn aria-hidden size={18} />
        Continue with Google via MAC
      </button>

      <button
        className="mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 font-semibold text-[var(--color-text)] disabled:opacity-55"
        disabled={isPending}
        onClick={() => signIn("microsoft")}
        type="button"
      >
        <LogIn aria-hidden size={18} />
        Continue with Microsoft via MAC
      </button>

      <div className="flex items-start gap-2 rounded-md border border-[rgb(66_211_146/0.3)] bg-[rgb(66_211_146/0.06)] p-3 text-sm text-[var(--color-text-muted)]">
        <ShieldCheck
          aria-hidden
          className="mt-0.5 shrink-0 text-[var(--color-success)]"
          size={17}
        />
        <span>
          One MAC account signs you into participating MAC websites and apps.
        </span>
      </div>

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
