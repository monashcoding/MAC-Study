"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import {
  endOnboardingPreview,
  isOnboardingPreview,
} from "@/lib/onboarding-preview";

export function OnboardingPreviewBanner() {
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsPreview(isOnboardingPreview());
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!isPreview) return null;

  return (
    <div
      className="fixed left-1/2 top-[calc(var(--safe-area-top)+0.5rem)] z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[rgb(108_182_255/0.45)] bg-[rgb(18_28_40/0.96)] py-1 pl-3 pr-1 text-sm shadow-[0_12px_32px_rgb(0_0_0/0.45)] backdrop-blur"
      role="status"
    >
      <FlaskConical
        aria-hidden
        className="shrink-0 text-[var(--color-info)]"
        size={16}
      />
      <span className="whitespace-nowrap font-medium">Onboarding preview</span>
      <button
        className="mac-focus h-8 rounded-full bg-[rgb(255_255_255/0.08)] px-3 text-sm font-semibold transition hover:bg-[rgb(255_255_255/0.14)]"
        onClick={endOnboardingPreview}
        type="button"
      >
        Exit
      </button>
    </div>
  );
}
