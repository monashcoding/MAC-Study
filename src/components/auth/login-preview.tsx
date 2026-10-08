"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Illustrative snapshot of the app for the sign-in page; the people are
// sample data, not real accounts.
const STUDYING_NOW = [
  { initials: "SP", minutes: 42, name: "Steven Phan", unit: "FIT2004" },
  { initials: "L", minutes: 18, name: "Lebron", unit: "ENG1005" },
];

const START_SECONDS = 2 * 3600 + 14 * 60 + 36;

export function LoginPreview({ compact = false }: { compact?: boolean }) {
  const seconds = useTickingSeconds(START_SECONDS);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none relative select-none",
        compact ? "h-[250px]" : "h-[560px]",
      )}
    >
      <div
        className={cn(
          "absolute",
          compact
            ? "left-0 top-[30px] w-[260px]"
            : "left-10 top-[70px] w-[380px]",
        )}
      >
        <div
          className={cn(
            "rounded-xl border border-[rgb(255_255_255/0.1)] bg-[#1f1f1f] text-center shadow-[0_24px_48px_rgb(0_0_0/0.4)]",
            compact ? "px-5 py-[18px]" : "px-6 py-[22px]",
          )}
        >
          <p
            className={cn(
              "font-semibold uppercase tracking-[0.2em] text-[var(--color-mac-yellow)]",
              compact ? "text-[9px]" : "text-[11px]",
            )}
          >
            Studied today
          </p>
          <p
            className={cn(
              "font-mono font-semibold leading-none tabular-nums",
              compact ? "mt-2.5 text-[35px]" : "mt-3 text-[44px]",
            )}
          >
            {formatClock(seconds)}
          </p>
          <div
            className={cn("flex justify-center", compact ? "mt-3" : "mt-3.5")}
          >
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-[rgb(255_227_48/0.12)] font-semibold text-[var(--color-mac-yellow)]",
                compact ? "h-6 px-2.5 text-[10px]" : "h-[30px] px-3 text-xs",
              )}
            >
              <span className="h-[7px] w-[7px] rounded-full bg-current" />
              FIT2102
            </span>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "absolute",
          compact
            ? "right-0 top-[132px] w-[240px]"
            : "right-5 top-[250px] w-[320px]",
        )}
      >
        <div
          className={cn(
            "rounded-xl border border-[rgb(255_255_255/0.1)] bg-[#1f1f1f] shadow-[0_24px_48px_rgb(0_0_0/0.4)]",
            compact ? "p-3" : "p-4",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-2 font-bold uppercase tracking-[0.18em] text-[#ff9a3d]",
              compact ? "text-[8px]" : "text-[11px]",
            )}
          >
            <span className="h-[7px] w-[7px] rounded-full bg-current" />
            Studying now
          </p>
          {STUDYING_NOW.map((person) => (
            <div
              className={cn(
                "flex items-center gap-2.5",
                compact ? "mt-2" : "mt-3",
              )}
              key={person.name}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] font-semibold text-[#141414]",
                  compact
                    ? "h-[26px] w-[26px] text-[9px]"
                    : "h-[34px] w-[34px] text-xs",
                )}
              >
                {person.initials}
              </span>
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block font-semibold",
                    compact ? "text-[11px]" : "text-sm",
                  )}
                >
                  {person.name}
                </span>
                <span
                  className={cn(
                    "block text-[var(--color-text-muted)]",
                    compact ? "text-[9px]" : "text-xs",
                  )}
                >
                  {person.unit}
                </span>
              </div>
              <span
                className={cn(
                  "font-mono font-semibold tabular-nums text-[var(--color-text-muted)]",
                  compact ? "text-[10px]" : "text-[13px]",
                )}
              >
                {person.minutes}m
              </span>
            </div>
          ))}
        </div>
      </div>

      <Image
        alt=""
        className={cn(
          "absolute object-contain",
          compact
            ? "-top-6 right-0 h-[120px] w-[120px]"
            : "left-[250px] top-[-60px] h-[170px] w-[170px]",
        )}
        height={170}
        priority
        src="/mascots/min-artist.svg"
        width={170}
      />
      {compact ? null : (
        <Image
          alt=""
          className="absolute bottom-[-10px] left-[30px] h-[200px] w-[200px] object-contain"
          height={200}
          priority
          src="/mascots/max-arms-up.svg"
          width={200}
        />
      )}
    </div>
  );
}

// Mobile hero: Min and Max over a soft glow, with the live timer card.
export function LoginGreeting() {
  const seconds = useTickingSeconds(START_SECONDS);

  return (
    <div aria-hidden className="pointer-events-none select-none">
      <div className="relative flex items-end justify-center">
        <span className="absolute bottom-[-13px] left-1/2 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_227_48/0.12),rgb(255_227_48/0)_65%)]" />
        <Image
          alt=""
          className="relative -mr-4 h-[120px] w-[120px] object-contain"
          height={120}
          priority
          src="/mascots/min-wave.svg"
          width={120}
        />
        <Image
          alt=""
          className="relative h-[120px] w-[120px] object-contain"
          height={120}
          priority
          src="/mascots/max-arms-up-happy.svg"
          width={120}
        />
      </div>
      <div className="relative mx-auto -mt-1 w-fit rounded-xl border border-[rgb(255_255_255/0.1)] bg-[#1f1f1f] px-5 py-3 text-center shadow-[0_24px_48px_rgb(0_0_0/0.4)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-mac-yellow)]">
          Studied today
        </p>
        <p className="mt-1.5 font-mono text-[28px] font-semibold leading-none tabular-nums">
          {formatClock(seconds)}
        </p>
      </div>
    </div>
  );
}

function useTickingSeconds(start: number) {
  const [seconds, setSeconds] = useState(start);

  useEffect(() => {
    const interval = window.setInterval(
      () => setSeconds((current) => current + 1),
      1000,
    );
    return () => window.clearInterval(interval);
  }, []);

  return seconds;
}

function formatClock(totalSeconds: number) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}`;
}
