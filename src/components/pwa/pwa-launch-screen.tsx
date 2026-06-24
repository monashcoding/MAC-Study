"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type LaunchPhase = "visible" | "leaving" | "hidden";
const LEAVE_DELAY_MS = 1100;
const REMOVE_DELAY_MS = 1420;

export function PwaLaunchScreen() {
  const [phase, setPhase] = useState<LaunchPhase>("visible");

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone ===
          true);

    if (!standalone) {
      const frame = window.requestAnimationFrame(() => setPhase("hidden"));
      return () => window.cancelAnimationFrame(frame);
    }

    const leaveTimeout = window.setTimeout(
      () => setPhase("leaving"),
      LEAVE_DELAY_MS,
    );
    const removeTimeout = window.setTimeout(
      () => setPhase("hidden"),
      REMOVE_DELAY_MS,
    );

    return () => {
      window.clearTimeout(leaveTimeout);
      window.clearTimeout(removeTimeout);
    };
  }, []);

  if (phase === "hidden") {
    return null;
  }

  return (
    <div
      aria-hidden
      className={cn(
        "mac-pwa-launch fixed inset-0 z-[100] items-center justify-center bg-[var(--color-background)] transition-opacity duration-300 ease-out",
        phase === "leaving" && "opacity-0",
      )}
    >
      <div className="flex flex-col items-center gap-5">
        <Image
          alt=""
          className="mac-pwa-launch-logo h-24 w-24 rounded-[1.35rem] shadow-[0_18px_52px_rgb(0_0_0/0.32)]"
          height={96}
          priority
          src="/icons/mac-square.png"
          unoptimized
          width={96}
        />
        <div className="mac-pwa-launch-progress" />
      </div>
    </div>
  );
}
