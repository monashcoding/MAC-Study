"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookPlus,
  Check,
  ChevronRight,
  ListPlus,
  UserPlus,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  cacheRemoteGroupsSnapshot,
  dedupeRemoteRequest,
  getCachedRemoteGroupsSnapshot,
  subscribeToRemoteTableChanges,
} from "@/lib/client-cache";
import { getMascotSrc } from "@/lib/mascots";
import {
  isOnboardingPreview,
  onboardingStorage,
} from "@/lib/onboarding-preview";
import { fetchRemoteGroupsSnapshot } from "@/lib/supabase/app-data";
import type { RemoteGroupsSnapshot } from "@/lib/supabase/app-data/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mac-getting-started-card-hidden";
const SOCIAL_TABLES = new Set(["friendships", "group_members", "groups"]);

type Step = {
  action: { href: string } | { onClick: () => void };
  done: boolean;
  icon: LucideIcon;
  key: string;
  label: string;
};

export function GettingStartedCard({
  hasSubject: actualHasSubject,
  hasUnit: actualHasUnit,
  onAddSubject,
  userId,
}: {
  hasSubject: boolean;
  hasUnit: boolean;
  onAddSubject: () => void;
  userId: string | null;
}) {
  const [hidden, setHidden] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const social = useSocialSetup(userId);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsPreview(isOnboardingPreview());
      setHidden(onboardingStorage.get(STORAGE_KEY) === "true");
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  // A preview shows the checklist as a brand new account would see it.
  const steps: Step[] = [
    {
      action: { onClick: onAddSubject },
      done: actualHasSubject && !isPreview,
      icon: ListPlus,
      key: "subjects",
      label: "Add your subjects",
    },
    {
      action: { href: "/app/friends" },
      done: social.hasFriend && !isPreview,
      icon: UserPlus,
      key: "friends",
      label: "Add friends",
    },
    {
      action: { href: "/app/groups" },
      done: social.hasGroup && !isPreview,
      icon: UsersRound,
      key: "group",
      label: "Create a study group",
    },
    {
      action: { href: "/app/units" },
      done: actualHasUnit && !isPreview,
      icon: BookPlus,
      key: "units",
      label: "Add your units",
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const nextKey = steps.find((step) => !step.done)?.key;

  // Wait for the friend/group status so finished accounts never see a flash.
  if (hidden || !social.loaded || doneCount === steps.length) return null;

  function dismiss() {
    onboardingStorage.set(STORAGE_KEY, "true");
    setHidden(true);
  }

  return (
    <section className="relative hidden rounded-xl border border-[rgb(255_227_48/0.22)] bg-[#1d1c16] px-4 py-3 lg:block xl:col-span-2">
      <div className="flex items-center gap-3 pr-8">
        <Image
          alt=""
          className="-my-1 h-11 w-11 shrink-0 object-contain"
          height={44}
          src={getMascotSrc(doneCount >= 2 ? "max-arms-up-happy" : "min-wave")}
          width={44}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            Set up your study space
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <div
          aria-label={`${doneCount} of ${steps.length} steps done`}
          aria-valuemax={steps.length}
          aria-valuemin={0}
          aria-valuenow={doneCount}
          className="flex w-28 gap-1"
          role="progressbar"
        >
          {steps.map((step) => (
            <span
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                step.done
                  ? "bg-[var(--color-mac-yellow)]"
                  : "bg-[rgb(255_255_255/0.1)]",
              )}
              key={step.key}
            />
          ))}
        </div>
      </div>

      <button
        aria-label="Dismiss getting started"
        className="mac-focus absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.06)] hover:text-[var(--color-text)]"
        onClick={dismiss}
        type="button"
      >
        <X aria-hidden size={16} />
      </button>

      <ol className="mt-2.5 grid grid-cols-2 gap-1.5 xl:grid-cols-4">
        {steps.map((step) => (
          <li key={step.key}>
            <StepTile isNext={step.key === nextKey} step={step} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepTile({ isNext, step }: { isNext: boolean; step: Step }) {
  const Icon = step.icon;
  const className = cn(
    "mac-focus group flex h-11 w-full items-center gap-2.5 rounded-lg border px-2.5 text-left text-[13px] font-semibold transition",
    step.done
      ? "border-transparent bg-[rgb(255_255_255/0.025)] text-[var(--color-text-muted)]"
      : isNext
        ? "border-[rgb(255_227_48/0.4)] bg-[rgb(255_227_48/0.07)] text-[var(--color-text)] hover:bg-[rgb(255_227_48/0.11)]"
        : "border-transparent bg-[rgb(255_255_255/0.04)] text-[var(--color-text)] hover:bg-[rgb(255_255_255/0.07)]",
  );
  const content: ReactNode = (
    <>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          step.done
            ? "bg-[rgb(255_227_48/0.16)] text-[var(--color-mac-yellow)]"
            : "bg-[rgb(255_227_48/0.11)] text-[var(--color-mac-yellow)]",
        )}
      >
        {step.done ? (
          <Check aria-hidden size={15} strokeWidth={2.6} />
        ) : (
          <Icon aria-hidden size={15} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{step.label}</span>
      {step.done ? (
        <span className="sr-only">(done)</span>
      ) : (
        <ChevronRight
          aria-hidden
          className="shrink-0 text-[var(--color-text-muted)] transition group-hover:translate-x-0.5"
          size={15}
        />
      )}
    </>
  );

  return "href" in step.action ? (
    <Link className={className} href={step.action.href} prefetch>
      {content}
    </Link>
  ) : (
    <button className={className} onClick={step.action.onClick} type="button">
      {content}
    </button>
  );
}

// Friends and groups come from the groups snapshot the app shell already
// preloads, so the checklist adds no extra queries in the common case.
function useSocialSetup(userId: string | null) {
  const [snapshot, setSnapshot] = useState<RemoteGroupsSnapshot | null>(() =>
    getCachedRemoteGroupsSnapshot(userId),
  );
  const [loaded, setLoaded] = useState(() => !userId || Boolean(snapshot));

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const load = () => {
      const cached = getCachedRemoteGroupsSnapshot(userId);
      if (cached) {
        setSnapshot(cached);
        setLoaded(true);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        void dedupeRemoteRequest({
          key: "groups",
          load: () => fetchRemoteGroupsSnapshot(supabase),
          userId,
        })
          .then((next) => {
            if (cancelled) return;
            if (next) {
              cacheRemoteGroupsSnapshot(next);
              setSnapshot(next);
            }
            setLoaded(true);
          })
          .catch(() => {
            if (!cancelled) setLoaded(true);
          });
      } catch {
        setLoaded(true);
      }
    };

    void Promise.resolve().then(load);
    const unsubscribe = subscribeToRemoteTableChanges((table) => {
      if (SOCIAL_TABLES.has(table)) load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  return {
    hasFriend: Boolean(
      snapshot?.socialState.friends.some(
        (friend) => friend.isFriend && friend.id !== snapshot.currentUserId,
      ),
    ),
    hasGroup: Boolean(snapshot?.socialState.groups.length),
    loaded,
  };
}
