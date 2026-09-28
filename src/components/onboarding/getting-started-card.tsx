"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, Download, Plus, X } from "lucide-react";

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

  return (
    <section className="relative overflow-hidden rounded-lg border border-[rgb(255_227_48/0.28)] bg-[rgb(255_227_48/0.055)] p-4 sm:p-5 xl:col-span-2">
      <button
        aria-label="Dismiss getting started"
        className="mac-focus absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.06)] hover:text-[var(--color-text)]"
        onClick={dismiss}
        type="button"
      >
        <X aria-hidden size={18} />
      </button>
      <p className="pr-10 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-mac-yellow)]">
        Getting started
      </p>
      <h2 className="mt-1 text-xl font-semibold">Make MAC Study yours</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ChecklistAction
          complete={hasStudySession}
          icon={Plus}
          label="Start a study session"
          onClick={onStartSession}
        />
        <a
          className="mac-focus flex min-h-12 items-center gap-3 rounded-md border border-[var(--color-border)] bg-[rgb(23_23_23/0.72)] px-3 text-left text-sm font-semibold transition hover:bg-[rgb(255_255_255/0.05)]"
          href="/app/units"
        >
          <StatusIcon complete={hasUnit} icon={Plus} />
          <span>Add your units</span>
        </a>
        <ChecklistAction
          icon={Download}
          label="Add the app to this device"
          onClick={() => window.dispatchEvent(new Event("mac-open-install-guide"))}
        />
        <ChecklistAction
          icon={BellRing}
          label="Turn on useful alerts"
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
      className="mac-focus flex min-h-12 items-center gap-3 rounded-md border border-[var(--color-border)] bg-[rgb(23_23_23/0.72)] px-3 text-left text-sm font-semibold transition hover:bg-[rgb(255_255_255/0.05)]"
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
          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)]"
      }
    >
      {complete ? <Check aria-hidden size={16} /> : <Icon aria-hidden size={16} />}
    </span>
  );
}
