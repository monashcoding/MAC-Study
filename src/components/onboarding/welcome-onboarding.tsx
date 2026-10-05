"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Clock3, Play, UsersRound } from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import {
  ONBOARDING_VERSION,
  shouldAutoOpenWelcome,
  type OnboardingState,
} from "@/lib/onboarding";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type WelcomeOutcome = "completed" | "dismissed";

export function WelcomeOnboarding({
  onComplete,
  userId,
}: {
  onComplete: () => void;
  userId: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const hasNotifiedComplete = useRef(false);
  const storageKey = `mac-welcome-onboarding-v${ONBOARDING_VERSION}:${userId}`;

  useEffect(() => {
    let cancelled = false;

    async function loadWelcomeState() {
      let shouldOpen = true;

      try {
        shouldOpen = window.localStorage.getItem(storageKey) !== "complete";
      } catch {
        // Continue with the remote state or the first-run fallback below.
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("user_onboarding_states")
          .select("is_existing_at_rollout, welcome_version")
          .eq("user_id", userId)
          .maybeSingle<OnboardingState>();

        if (!error) {
          shouldOpen = shouldAutoOpenWelcome(data);
        }
      } catch {
        // A missing migration or an offline request must never block study.
      }

      const frame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        setIsOpen(shouldOpen);
        setIsReady(true);
      });

      return () => window.cancelAnimationFrame(frame);
    }

    void loadWelcomeState();

    return () => {
      cancelled = true;
    };
  }, [storageKey, userId]);

  useEffect(() => {
    function reopenWelcome() {
      setIsOpen(true);
    }

    window.addEventListener("mac-open-welcome", reopenWelcome);
    return () => window.removeEventListener("mac-open-welcome", reopenWelcome);
  }, []);

  useEffect(() => {
    if (!isReady || isOpen || hasNotifiedComplete.current) return;

    hasNotifiedComplete.current = true;
    onComplete();
  }, [isOpen, isReady, onComplete]);

  function saveOutcome(outcome: WelcomeOutcome) {
    try {
      window.localStorage.setItem(storageKey, "complete");
    } catch {
      // The database update below remains the durable record when storage fails.
    }
    const timestamp = new Date().toISOString();

    void createSupabaseBrowserClient()
      .from("user_onboarding_states")
      .upsert(
        {
          user_id: userId,
          welcome_version: ONBOARDING_VERSION,
          welcome_completed_at: outcome === "completed" ? timestamp : null,
          welcome_dismissed_at: outcome === "dismissed" ? timestamp : null,
        },
        { onConflict: "user_id" },
      );
  }

  function closeWelcome(outcome: WelcomeOutcome) {
    saveOutcome(outcome);
    setIsOpen(false);
  }

  function startFirstSession() {
    closeWelcome("completed");
    router.push("/app");
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("mac-open-start-study"));
    });
  }

  if (!isOpen) return null;

  return (
    <AppDialog
      bodyClassName="space-y-4 sm:p-5"
      closeLabel="Explore MAC Study"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            className="mac-focus inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414] sm:px-4 sm:text-base"
            data-dialog-autofocus
            onClick={startFirstSession}
            type="button"
          >
            <Play aria-hidden size={18} />
            Start studying
          </button>
          <button
            className="mac-focus h-12 rounded-lg border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)] sm:px-4"
            onClick={() => closeWelcome("completed")}
            type="button"
          >
            Explore the app
          </button>
        </div>
      }
      maxWidthClassName="max-w-2xl"
      onClose={() => closeWelcome("dismissed")}
      title={
        <span>
          Study with your friends.{" "}
          <span className="text-[var(--color-mac-yellow)]">
            Track your progress.
          </span>
        </span>
      }
      titleClassName="whitespace-normal text-xl leading-6 tracking-[-0.02em] sm:text-2xl sm:leading-7"
    >
      <p className="max-w-xl text-sm leading-6 text-[var(--color-text-muted)]">
        Make study time visible and keep each other going.
      </p>
      <div className="grid grid-cols-3 divide-x divide-[var(--color-border)] rounded-xl bg-[rgb(255_255_255/0.035)] py-3 sm:py-4">
        <WelcomeBenefit icon={Clock3} label="Track your time" />
        <WelcomeBenefit icon={BookOpen} label="Find classmates" />
        <WelcomeBenefit icon={UsersRound} label="Study together" />
      </div>
    </AppDialog>
  );
}

function WelcomeBenefit({
  icon: Icon,
  label,
}: {
  icon: typeof UsersRound;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 px-2 text-center sm:flex-row sm:justify-center sm:px-3 sm:text-left">
      <Icon
        aria-hidden
        className="shrink-0 text-[var(--color-mac-yellow)]"
        size={20}
      />
      <span className="text-xs font-semibold leading-4 text-[var(--color-text)] sm:text-sm">
        {label}
      </span>
    </div>
  );
}
