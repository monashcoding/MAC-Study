"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type LaunchPhase = "visible" | "leaving" | "hidden";

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

    const leaveTimeout = window.setTimeout(() => setPhase("leaving"), 560);
    const removeTimeout = window.setTimeout(() => setPhase("hidden"), 780);

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
        "mac-pwa-launch fixed inset-0 z-[100] items-center justify-center bg-black transition-opacity duration-200",
        phase === "leaving" && "opacity-0",
      )}
    >
      <Image
        alt=""
        className="h-24 w-24 rounded-full"
        height={96}
        priority
        src="/icons/mac-square.png"
        width={96}
      />
    </div>
  );
}
