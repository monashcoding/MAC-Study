"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Play,
  UsersRound,
} from "lucide-react";
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
      bodyClassName="space-y-5 sm:p-5"
      closeLabel="Explore MAC Study"
      footer={
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="mac-focus inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414]"
            data-dialog-autofocus
            onClick={startFirstSession}
            type="button"
          >
            <Play aria-hidden size={18} />
            Start your first session
          </button>
          <button
            className="mac-focus h-12 rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)]"
            onClick={() => closeWelcome("completed")}
            type="button"
          >
            Explore the app
          </button>
        </div>
      }
      maxWidthClassName="max-w-3xl"
      onClose={() => closeWelcome("dismissed")}
      title="Your study space, with your people"
      titleClassName="whitespace-normal text-xl leading-6 sm:text-2xl"
    >
      <div data-dialog-autofocus tabIndex={-1}>
        <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
          Keep your study time visible, find people taking the same units, and
          make it easier to keep each other going.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <WelcomePreview
          description="See who&apos;s studying, compare time and give friends a nudge when they need it."
          icon={UsersRound}
          label="Study with your people"
          preview={<PeoplePreview />}
        />
        <WelcomePreview
          description="Add your units and connect with classmates who are learning the same things."
          icon={BookOpen}
          label="Find your classmates"
          preview={<UnitsPreview />}
        />
        <WelcomePreview
          description="Start a session in a tap and build a picture of your study habits over time."
          icon={BarChart3}
          label="See your progress"
          preview={<ProgressPreview />}
        />
      </div>
      <button
        className="mac-focus inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--color-text-muted)] transition hover:text-[var(--color-text)]"
        onClick={() => closeWelcome("dismissed")}
        type="button"
      >
        I&apos;ll look around first
        <ChevronRight aria-hidden size={16} />
      </button>
    </AppDialog>
  );
}

function WelcomePreview({
  description,
  icon: Icon,
  label,
  preview,
}: {
  description: string;
  icon: typeof UsersRound;
  label: string;
  preview: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[rgb(255_255_255/0.018)] p-3">
      <div className="flex items-center gap-2 text-[var(--color-mac-yellow)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[rgb(255_227_48/0.1)]">
          <Icon aria-hidden size={17} />
        </span>
        <h3 className="text-sm font-semibold text-[var(--color-text)]">
          {label}
        </h3>
      </div>
      <div className="mt-3">{preview}</div>
      <p className="mt-3 text-sm leading-5 text-[var(--color-text-muted)]">
        {description}
      </p>
    </section>
  );
}

function PeoplePreview() {
  return (
    <div className="rounded-lg border border-[rgb(255_255_255/0.08)] bg-[#191919] p-3">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>Group study</span>
        <span className="flex items-center gap-1 text-[var(--color-success)]">
          <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
          Studying
        </span>
      </div>
      <div className="mt-3 flex -space-x-2" aria-hidden>
        {["#FFE330", "#6CB6FF", "#42D392"].map((color) => (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#191919] text-[0.58rem] font-bold text-[#141414]"
            key={color}
            style={{ backgroundColor: color }}
          >
            •
          </span>
        ))}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]">
        <span className="block h-full w-2/3 rounded-full bg-[var(--color-mac-yellow)]" />
      </div>
    </div>
  );
}

function UnitsPreview() {
  return (
    <div className="rounded-lg border border-[rgb(255_255_255/0.08)] bg-[#191919] p-3">
      <p className="text-xs font-semibold text-[var(--color-text)]">Your units</p>
      <div className="mt-2 grid gap-1.5">
        {["Add a unit", "Meet your cohort"].map((label, index) => (
          <div
            className="flex items-center gap-2 rounded-md bg-[rgb(255_255_255/0.04)] px-2 py-2 text-xs text-[var(--color-text-muted)]"
            key={label}
          >
            <span
              className={
                index === 0
                  ? "h-2 w-2 rounded-full bg-[var(--color-mac-yellow)]"
                  : "h-2 w-2 rounded-full bg-[var(--color-info)]"
              }
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressPreview() {
  return (
    <div className="rounded-lg border border-[rgb(255_255_255/0.08)] bg-[#191919] p-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-mac-yellow)]">
            Studied today
          </p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums">00:00:00</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-[#141414]">
          <Play aria-hidden size={15} />
        </span>
      </div>
      <div className="mt-4 flex h-8 items-end gap-1.5" aria-hidden>
        {[35, 65, 45, 88, 55, 76].map((height) => (
          <span
            className="flex-1 rounded-t bg-[rgb(255_227_48/0.36)]"
            key={height}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
}
