"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BellRing,
  BookPlus,
  Check,
  Download,
  Play,
  Plus,
  X,
} from "lucide-react";

const STORAGE_KEY = "mac-getting-started-card-hidden";

export function GettingStartedCard({
  hasStudySession,
  hasUnit,
  onStartSession,
}: {
  hasStudySession: boolean;
  hasUnit: boolean;
  onStartSession: () => void;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHidden(window.localStorage.getItem(STORAGE_KEY) === "true");
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (hidden || (hasStudySession && hasUnit)) return null;

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setHidden(true);
  }

  const completedEssentials = Number(hasStudySession) + Number(hasUnit);
  const progressWidth = `${(completedEssentials / 2) * 100}%`;

  return (
    <section className="relative hidden overflow-hidden rounded-xl lg:block border border-[rgb(255_227_48/0.24)] bg-[#1d1c16] p-4 sm:p-5 xl:col-span-2">
      <button
        aria-label="Dismiss getting started"
        className="mac-focus absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.06)] hover:text-[var(--color-text)]"
        onClick={dismiss}
        type="button"
      >
        <X aria-hidden size={18} />
      </button>
      <div className="flex flex-wrap items-end justify-between gap-3 pr-10">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.015em] sm:text-xl">
            Set up your study space
          </h2>
          <p className="mt-1 text-xs text-[var(--color-text-muted)] sm:text-sm">
            {completedEssentials} of 2 essentials complete
          </p>
        </div>
        <div
          aria-label={`${completedEssentials} of 2 essentials complete`}
          className="h-1.5 w-32 overflow-hidden rounded-full bg-[rgb(255_255_255/0.1)] sm:w-40"
          role="progressbar"
          aria-valuemax={2}
          aria-valuemin={0}
          aria-valuenow={completedEssentials}
        >
          <span
            className="block h-full rounded-full bg-[var(--color-mac-yellow)] transition-[width] duration-300"
            style={{ width: progressWidth }}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ChecklistAction
          complete={hasStudySession}
          icon={Play}
          label="Start a session"
          onClick={onStartSession}
        />
        <Link
          className="mac-focus flex min-h-12 items-center gap-3 rounded-lg bg-[rgb(255_255_255/0.04)] px-3 text-left text-sm font-semibold transition hover:bg-[rgb(255_255_255/0.07)]"
          href="/app/units"
          prefetch
        >
          <StatusIcon complete={hasUnit} icon={BookPlus} />
          <span>Add your units</span>
        </Link>
        <ChecklistAction
          icon={Download}
          label="Install the app"
          onClick={() => window.dispatchEvent(new Event("mac-open-install-guide"))}
        />
        <ChecklistAction
          icon={BellRing}
          label="Turn on alerts"
          onClick={() =>
            window.dispatchEvent(new Event("mac-open-notification-onboarding"))
          }
        />
      </div>
    </section>
  );
}

function ChecklistAction({
  complete = false,
  icon,
  label,
  onClick,
}: {
  complete?: boolean;
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="mac-focus flex min-h-12 items-center gap-3 rounded-lg bg-[rgb(255_255_255/0.04)] px-3 text-left text-sm font-semibold transition hover:bg-[rgb(255_255_255/0.07)]"
      onClick={onClick}
      type="button"
    >
      <StatusIcon complete={complete} icon={icon} />
      <span>{label}</span>
    </button>
  );
}

function StatusIcon({
  complete,
  icon: Icon,
}: {
  complete: boolean;
  icon: typeof Plus;
}) {
  return (
    <span
      className={
        complete
          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)] text-[#141414]"
          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(255_227_48/0.11)] text-[var(--color-mac-yellow)]"
      }
    >
      {complete ? <Check aria-hidden size={16} /> : <Icon aria-hidden size={16} />}
    </span>
  );
}
