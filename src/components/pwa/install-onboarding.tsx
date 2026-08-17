"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Download,
  MoreVertical,
  Share,
  Smartphone,
  SquarePlus,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallPlatform = "ios" | "android";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { mobile?: boolean };
};

const installGuides = {
  ios: {
    steps: [
      { title: "Open study.monashcoding.com", icon: Smartphone },
      { title: "Open the Share menu", icon: Share },
      { title: "Add to Home Screen", icon: SquarePlus },
    ],
  },
  android: {
    steps: [
      { title: "Open study.monashcoding.com", icon: Smartphone },
      { title: "Open Chrome’s menu", icon: MoreVertical },
      { title: "Add to Home Screen", icon: SquarePlus },
    ],
  },
} as const;

export function InstallOnboarding({
  onComplete,
  userId,
}: {
  onComplete: () => void;
  userId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [activePlatform, setActivePlatform] = useState<InstallPlatform>("ios");
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const isDesktopRef = useRef(false);
  const dontShowAgainRef = useRef(false);
  const tabRefs = useRef<Record<InstallPlatform, HTMLButtonElement | null>>({
    ios: null,
    android: null,
  });
  const tabsId = useId();
  // Version the preference so people who dismissed the earlier tutorial see
  // this revised tutorial until they explicitly opt out.
  const storageKey = `mac-install-onboarding-v3:${userId}`;

  useEffect(() => {
    const desktopDevice = !isMobileDevice();
    isDesktopRef.current = desktopDevice;
    const syncFrame = window.requestAnimationFrame(() => {
      setIsDesktop(desktopDevice);
    });

    return () => {
      window.cancelAnimationFrame(syncFrame);
    };
  }, []);

  useEffect(() => {
    const desktopDevice = !isMobileDevice();
    isDesktopRef.current = desktopDevice;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone ===
          true);

    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    }

    function handleInstalled() {
      setIsOpen(false);
      onComplete();
    }

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    let openingFrame: number | null = null;

    if (
      standalone ||
      desktopDevice ||
      window.localStorage.getItem(storageKey) === "seen"
    ) {
      onComplete();
    } else {
      openingFrame = window.requestAnimationFrame(() => setIsOpen(true));
    }

    return () => {
      if (openingFrame !== null) {
        window.cancelAnimationFrame(openingFrame);
      }
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [onComplete, storageKey]);

  function openDesktopGuide() {
    setIsOpen(true);
  }

  const closeGuide = useCallback(() => {
    setIsOpen(false);

    if (isDesktopRef.current) return;

    if (dontShowAgainRef.current) {
      window.localStorage.setItem(storageKey, "seen");
    } else {
      window.localStorage.removeItem(storageKey);
    }
    onComplete();
  }, [onComplete, storageKey]);

  async function install() {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsOpen(false);
        onComplete();
      }
    } finally {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setIsInstalling(false);
    }
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    platform: InstallPlatform,
  ) {
    let nextPlatform: InstallPlatform | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextPlatform = platform === "ios" ? "android" : "ios";
    } else if (event.key === "Home") {
      nextPlatform = "ios";
    } else if (event.key === "End") {
      nextPlatform = "android";
    }

    if (!nextPlatform) return;

    event.preventDefault();
    setActivePlatform(nextPlatform);
    tabRefs.current[nextPlatform]?.focus();
  }

  const activeGuide = installGuides[activePlatform];

  return (
    <>
      {isDesktop ? (
        <button
          aria-haspopup="dialog"
          className="mac-focus group fixed bottom-6 right-6 z-40 inline-flex min-h-14 items-center gap-3 rounded-xl border border-[rgb(255_227_48/0.28)] bg-[rgb(28_28_28/0.96)] px-3 py-2.5 text-left shadow-[0_18px_48px_rgb(0_0_0/0.42)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-[rgb(255_227_48/0.55)] hover:bg-[rgb(32_32_32/0.98)]"
          onClick={openDesktopGuide}
          type="button"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-mac-yellow)] text-[#141414] shadow-[0_8px_24px_rgb(255_227_48/0.16)]">
            <Smartphone aria-hidden size={20} strokeWidth={2.2} />
          </span>
          <span className="pr-1">
            <span className="block text-sm font-semibold text-[var(--color-text)]">
              Add to your phone
            </span>
            <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
              Installation instructions
            </span>
          </span>
        </button>
      ) : null}

      {isOpen ? (
        <AppDialog
          bodyClassName="space-y-4 sm:p-5"
          closeLabel="Close phone install guide"
          footer={
            isDesktop ? (
              <div className="grid gap-2">
                {canInstall ? (
                  <button
                    className="mac-focus inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-45"
                    disabled={isInstalling}
                    onClick={() => void install()}
                    type="button"
                  >
                    <Download aria-hidden size={18} />
                    {isInstalling ? "Installing…" : "Install MAC Study on PC"}
                  </button>
                ) : null}
                <button
                  className="mac-focus h-11 rounded-lg text-sm font-semibold text-[var(--color-text-muted)]"
                  disabled={isInstalling}
                  onClick={closeGuide}
                  type="button"
                >
                  {canInstall ? "Not now" : "Got it"}
                </button>
              </div>
            ) : (
              <button
                className="mac-focus h-11 w-full rounded-lg text-sm font-semibold text-[var(--color-text-muted)]"
                disabled={isInstalling}
                onClick={closeGuide}
                type="button"
              >
                Not now
              </button>
            )
          }
          maxWidthClassName="max-w-lg"
          onClose={closeGuide}
          title="Add MAC Study to your phone"
          titleClassName="whitespace-normal text-xl leading-6 sm:text-2xl sm:leading-7"
        >
          <div>
            <div
              aria-label="Choose your phone"
              className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--color-border)] bg-[rgb(10_10_10/0.34)] p-1"
              role="tablist"
            >
              {(["ios", "android"] as const).map((platform) => (
                <button
                  aria-controls={`${tabsId}-${platform}-panel`}
                  aria-selected={activePlatform === platform}
                  className={cn(
                    "mac-focus min-h-11 rounded-md px-3 text-sm font-semibold transition",
                    activePlatform === platform
                      ? "bg-[var(--color-mac-yellow)] text-[#141414] shadow-[0_6px_18px_rgb(255_227_48/0.10)]"
                      : "text-[var(--color-text-muted)] hover:bg-[rgb(255_255_255/0.035)] hover:text-[var(--color-text)]",
                  )}
                  data-dialog-autofocus={
                    activePlatform === platform ? true : undefined
                  }
                  id={`${tabsId}-${platform}-tab`}
                  key={platform}
                  onClick={() => setActivePlatform(platform)}
                  onKeyDown={(event) => handleTabKeyDown(event, platform)}
                  ref={(element) => {
                    tabRefs.current[platform] = element;
                  }}
                  role="tab"
                  tabIndex={activePlatform === platform ? 0 : -1}
                  type="button"
                >
                  {platform === "ios" ? "iOS" : "Android"}
                </button>
              ))}
            </div>

            <div
              aria-labelledby={`${tabsId}-${activePlatform}-tab`}
              className="mt-4"
              id={`${tabsId}-${activePlatform}-panel`}
              role="tabpanel"
              tabIndex={0}
            >
              <ol className="grid gap-2.5">
                {activeGuide.steps.map((step, index) => {
                  const StepIcon = step.icon;

                  return (
                    <li
                      className="relative flex min-h-16 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[rgb(255_255_255/0.018)] px-16 py-3 text-center text-sm font-semibold"
                      key={step.title}
                    >
                      <span className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(255_227_48/0.10)] text-[var(--color-mac-yellow)]">
                        <StepIcon aria-hidden size={18} />
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--color-background)] bg-[var(--color-mac-yellow)] px-1 text-[0.62rem] font-bold text-[#141414]">
                          {index + 1}
                        </span>
                      </span>
                      {step.title}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {!isDesktop ? (
            <label className="mac-focus flex min-h-11 items-center gap-3 rounded-md px-1 text-sm text-[var(--color-text-muted)]">
              <input
                checked={dontShowAgain}
                className="h-5 w-5 accent-[var(--color-mac-yellow)]"
                disabled={isInstalling}
                onChange={(event) => {
                  dontShowAgainRef.current = event.target.checked;
                  setDontShowAgain(event.target.checked);
                }}
                type="checkbox"
              />
              <span>Don&apos;t show again</span>
            </label>
          ) : null}
        </AppDialog>
      ) : null}
    </>
  );
}

function isMobileDevice() {
  const userAgent = navigator.userAgent;

  if (
    /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
  ) {
    return true;
  }

  return (
    (navigator as NavigatorWithUserAgentData).userAgentData?.mobile === true
  );
}
