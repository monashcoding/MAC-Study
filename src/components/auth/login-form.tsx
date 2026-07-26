"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
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
  const [pendingProvider, setPendingProvider] = useState<MacProvider | null>(
    null,
  );
  const [isCompletingReturn, setIsCompletingReturn] = useState(
    returnedFromProvider,
  );
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
            setError("Sign-in did not complete. Please try again.");
            setIsCompletingReturn(false);
          }
          return;
        }

        setError(getErrorMessage(caughtError));
        setIsCompletingReturn(false);
      }
    }

    void completeExistingMacSession();

    return () => {
      cancelled = true;
    };
  }, [autoComplete, nextPath, returnedFromProvider]);

  function signIn(provider: MacProvider) {
    setError(null);
    setPendingProvider(provider);

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
            setPendingProvider(null);
          }
          return;
        }

        setError(getErrorMessage(caughtError));
        setPendingProvider(null);
      }
    });
  }

  if (pendingProvider || isCompletingReturn) {
    return <SigningInState />;
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        className="mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-55"
        disabled={isPending}
        onClick={() => signIn("google")}
        type="button"
      >
        <GoogleMark />
        Continue with Google
      </button>

      <button
        className="mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 font-semibold text-[var(--color-text)] disabled:opacity-55"
        disabled={isPending}
        onClick={() => signIn("microsoft")}
        type="button"
      >
        <MicrosoftMark />
        Continue with Microsoft
      </button>

      {error ? (
        <p className="rounded-md border border-[rgb(255_107_107/0.45)] bg-[rgb(255_107_107/0.08)] p-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SigningInState() {
  return (
    <div
      aria-live="polite"
      className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center bg-[var(--color-background)] px-6 pb-[var(--safe-area-bottom)] pt-[var(--safe-area-top)]"
      role="status"
    >
      <div className="mac-auth-pulse flex flex-col items-center text-center">
        <Image
          alt="MAC Study"
          className="rounded-xl"
          height={80}
          priority
          src="/icons/mac-square.png"
          width={80}
        />
        <h1 className="mt-7 text-2xl font-semibold tracking-tight">
          Signing you in
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Securely connecting your account
        </p>
        <span className="mt-7 h-1 w-16 overflow-hidden rounded-full bg-[rgb(255_227_48/0.16)]">
          <span className="mac-auth-progress block h-full w-1/2 rounded-full bg-[var(--color-mac-yellow)]" />
        </span>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function GoogleMark() {
  return (
    <svg aria-hidden height="18" viewBox="0 0 18 18" width="18">
      <path
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.614Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.91-2.258c-.805.54-1.835.859-3.046.859-2.344 0-4.328-1.585-5.037-3.715H.955v2.332A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.963 10.705A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.705V4.963H.955A9 9 0 0 0 0 9c0 1.452.347 2.827.955 4.037l3.008-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.582C13.464.892 11.426 0 9 0A9 9 0 0 0 .955 4.963l3.008 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg aria-hidden height="18" viewBox="0 0 18 18" width="18">
      <path d="M0 0h8.5v8.5H0z" fill="#F25022" />
      <path d="M9.5 0H18v8.5H9.5z" fill="#7FBA00" />
      <path d="M0 9.5h8.5V18H0z" fill="#00A4EF" />
      <path d="M9.5 9.5H18V18H9.5z" fill="#FFB900" />
    </svg>
  );
}
