"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Clock3, UsersRound } from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import {
  ONBOARDING_VERSION,
  shouldAutoOpenWelcome,
  type OnboardingState,
} from "@/lib/onboarding";
import {
  isOnboardingPreview,
  onboardingStorage,
} from "@/lib/onboarding-preview";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type WelcomeOutcome = "completed" | "dismissed";

export function WelcomeOnboarding({
  onComplete,
  userId,
}: {
  onComplete: () => void;
  userId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const hasNotifiedComplete = useRef(false);
  const storageKey = `mac-welcome-onboarding-v${ONBOARDING_VERSION}:${userId}`;

  useEffect(() => {
    let cancelled = false;

    async function loadWelcomeState() {
      let shouldOpen = onboardingStorage.get(storageKey) !== "complete";

      // A preview behaves like a brand new account, so skip the saved state.
      if (!isOnboardingPreview()) {
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
    onboardingStorage.set(storageKey, "complete");
    if (isOnboardingPreview()) return;

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

  if (!isOpen) return null;

  return (
    <AppDialog
      bodyClassName="pb-2 pt-4"
      closeLabel="Close welcome"
      footer={
        <button
          className="mac-focus inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] transition hover:brightness-105"
          data-dialog-autofocus
          onClick={() => closeWelcome("completed")}
          type="button"
        >
          Explore the app
        </button>
      }
      footerClassName="pt-5"
      maxWidthClassName="max-w-lg"
      onClose={() => closeWelcome("dismissed")}
      title={
        <>
          <span className="block">Study with your friends.</span>
          <span className="block text-[var(--color-mac-yellow)]">
            Track your progress.
          </span>
        </>
      }
      titleClassName="whitespace-normal pr-2 text-2xl leading-8 tracking-[-0.02em] sm:text-[1.75rem] sm:leading-9"
    >
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        <WelcomeBenefit icon={Clock3} label="Track your study" />
        <WelcomeBenefit icon={BookOpen} label="Find classmates" />
        <WelcomeBenefit icon={UsersRound} label="Study together" />
      </ul>
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
    <li className="flex min-w-0 flex-col items-start gap-3 rounded-xl bg-[rgb(255_255_255/0.04)] p-3 sm:p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)]">
        <Icon aria-hidden size={20} />
      </span>
      <span className="text-sm font-semibold leading-5 text-[var(--color-text)]">
        {label}
      </span>
    </li>
  );
}
