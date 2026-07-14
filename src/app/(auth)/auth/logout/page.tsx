"use client";

import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import {
  clearCachedStudySession,
  MAC_AUTH_BROWSER_URL,
} from "@/lib/auth/mac-auth-browser";

export default function LogoutPage() {
  useEffect(() => {
    async function signOut() {
      clearCachedStudySession();

      await Promise.allSettled([
        fetch("/api/auth/mac/session", { method: "DELETE" }),
        fetch(`${MAC_AUTH_BROWSER_URL}/api/auth/sign-out`, {
          credentials: "include",
          method: "POST",
        }),
      ]);

      window.location.replace("/auth/login?signedOut=1");
    }

    void signOut();
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--color-background)] px-4">
      <div className="mac-panel flex items-center gap-3 p-5 text-sm text-[var(--color-text-muted)]">
        <LoaderCircle
          aria-hidden
          className="animate-spin text-[var(--color-mac-yellow)]"
          size={20}
        />
        Signing out of your MAC account…
      </div>
    </main>
  );
}
