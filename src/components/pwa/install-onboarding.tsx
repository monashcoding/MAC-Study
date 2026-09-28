"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Download,
  MonitorDown,
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
      { title: "Open study.monashcoding.com in Safari", icon: Smartphone },
      { title: "Open the Share menu", icon: Share },
      { title: "Choose Add to Home Screen", icon: SquarePlus },
    ],
  },
  android: {
    steps: [
      { title: "Open study.monashcoding.com in Chrome", icon: Smartphone },
      { title: "Open Chrome’s three-dot menu", icon: MoreVertical },
      { title: "Choose Install app or Add to Home Screen", icon: SquarePlus },
    ],
  },
} as const;

export function InstallOnboarding({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktopGuideOpen, setIsDesktopGuideOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [activePlatform, setActivePlatform] = useState<InstallPlatform>("ios");
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const tabRefs = useRef<Record<InstallPlatform, HTMLButtonElement | null>>({
    ios: null,
    android: null,
  });
  const tabsId = useId();

  useEffect(() => {
    const desktopDevice = !isMobileDevice();
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone ===
          true);

    const frame = window.requestAnimationFrame(() => {
      setIsDesktop(desktopDevice);
      setIsStandalone(standalone);
      setIsReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    }

    function handleInstalled() {
      setIsOpen(false);
      setIsDesktopGuideOpen(false);
    }

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    function openInstallGuide() {
      if (!enabled || !isReady || isStandalone) return;

      if (isDesktop) {
        setIsDesktopGuideOpen(true);
        setIsOpen(false);
      } else {
        setIsOpen(true);
        setIsDesktopGuideOpen(false);
      }
    }

    window.addEventListener("mac-open-install-guide", openInstallGuide);
    return () =>
      window.removeEventListener("mac-open-install-guide", openInstallGuide);
  }, [enabled, isDesktop, isReady, isStandalone]);

  async function install() {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsDesktopGuideOpen(false);
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
      {enabled && isDesktop && !isStandalone ? (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 sm:flex-row sm:items-stretch">
          <InstallLauncher
            icon={MonitorDown}
            label="Install on PC"
            onClick={() => setIsDesktopGuideOpen(true)}
            subtitle="Open it like an app"
          />
          <InstallLauncher
            icon={Smartphone}
            label="Add to your phone"
            onClick={() => setIsOpen(true)}
            subtitle="Keep it one tap away"
          />
        </div>
      ) : null}

      {isOpen ? (
        <AppDialog
          bodyClassName="space-y-4 sm:p-5"
          closeLabel="Close phone install guide"
          footer={
            <button
              className="mac-focus h-11 w-full rounded-lg text-sm font-semibold text-[var(--color-text-muted)]"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              Got it
            </button>
          }
          maxWidthClassName="max-w-lg"
          onClose={() => setIsOpen(false)}
          title="Keep MAC Study one tap away"
          titleClassName="whitespace-normal text-xl leading-6 sm:text-2xl sm:leading-7"
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            Add MAC Study to your Home Screen, then open it from its own icon
            whenever you want to study.
          </p>
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
                {platform === "ios" ? "iPhone / iPad" : "Android"}
              </button>
            ))}
          </div>

          <div
            aria-labelledby={`${tabsId}-${activePlatform}-tab`}
            id={`${tabsId}-${activePlatform}-panel`}
            role="tabpanel"
            tabIndex={0}
          >
            {activePlatform === "ios" ? <PhoneHomeScreenPreview /> : null}
            <ol className="mt-3 grid gap-2.5">
              {activeGuide.steps.map((step, index) => {
                const StepIcon = step.icon;

                return (
                  <li
                    className="relative flex min-h-16 items-center rounded-xl border border-[var(--color-border)] bg-[rgb(255_255_255/0.018)] py-3 pl-16 pr-4 text-sm font-semibold"
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
        </AppDialog>
      ) : null}

      {isDesktopGuideOpen ? (
        <AppDialog
          bodyClassName="space-y-4 sm:p-5"
          closeLabel="Close PC install guide"
          footer={
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
                onClick={() => setIsDesktopGuideOpen(false)}
                type="button"
              >
                Got it
              </button>
            </div>
          }
          maxWidthClassName="max-w-2xl"
          onClose={() => setIsDesktopGuideOpen(false)}
          title="Open MAC Study like an app"
          titleClassName="whitespace-normal text-xl leading-6"
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            Install it from Chrome to give MAC Study its own window and a place
            on your taskbar.
          </p>
          <DesktopAppPreview />
          <ol className="grid gap-2.5 sm:grid-cols-2">
            <DesktopInstallStep index={1} icon={MonitorDown}>
              Use Chrome&apos;s install icon in the address bar, or open the
              three-dot menu.
            </DesktopInstallStep>
            <DesktopInstallStep index={2} icon={Download}>
              Choose Install, then launch MAC Study from your taskbar.
            </DesktopInstallStep>
          </ol>
        </AppDialog>
      ) : null}
    </>
  );
}

function InstallLauncher({
  icon: Icon,
  label,
  onClick,
  subtitle,
}: {
  icon: typeof Download;
  label: string;
  onClick: () => void;
  subtitle: string;
}) {
  return (
    <button
      aria-haspopup="dialog"
      className="mac-focus group inline-flex min-h-14 items-center gap-3 rounded-xl border border-[rgb(255_227_48/0.28)] bg-[rgb(28_28_28/0.96)] px-3 py-2.5 text-left shadow-[0_18px_48px_rgb(0_0_0/0.42)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-[rgb(255_227_48/0.55)] hover:bg-[rgb(32_32_32/0.98)]"
      onClick={onClick}
      type="button"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-mac-yellow)] text-[#141414] shadow-[0_8px_24px_rgb(255_227_48/0.16)]">
        <Icon aria-hidden size={20} strokeWidth={2.1} />
      </span>
      <span className="pr-1">
        <span className="block text-sm font-semibold text-[var(--color-text)]">
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function PhoneHomeScreenPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#111] p-2">
      <Image
        alt="MAC Study highlighted on an iPhone Home Screen"
        className="mx-auto max-h-64 w-auto rounded-lg object-contain"
        height={2796}
        sizes="(max-width: 640px) 100vw, 440px"
        src="/images/onboarding/phone-home-screen-mac-study.png"
        width={1290}
      />
      <figcaption className="px-2 pb-1 pt-2 text-center text-xs leading-5 text-[var(--color-text-muted)]">
        MAC Study stays easy to find among the apps you already use.
      </figcaption>
    </figure>
  );
}

function DesktopAppPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#111] p-2">
      <Image
        alt="MAC Study open in its own desktop app window"
        className="w-full rounded-lg object-cover object-top"
        height={1599}
        sizes="(max-width: 640px) 100vw, 720px"
        src="/images/onboarding/mac-study-desktop-app.jpg"
        width={2559}
      />
      <figcaption className="px-2 pb-1 pt-2 text-center text-xs leading-5 text-[var(--color-text-muted)]">
        Your own MAC Study window, ready from the taskbar.
      </figcaption>
    </figure>
  );
}

function DesktopInstallStep({
  children,
  icon: Icon,
  index,
}: {
  children: React.ReactNode;
  icon: typeof Download;
  index: number;
}) {
  return (
    <li className="relative flex min-h-16 items-center rounded-xl border border-[var(--color-border)] bg-[rgb(255_255_255/0.018)] py-3 pl-16 pr-4 text-sm font-semibold">
      <span className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
        <Icon aria-hidden size={19} />
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--color-background)] bg-[var(--color-mac-yellow)] px-1 text-[0.62rem] font-bold text-[#141414]">
          {index}
        </span>
      </span>
      {children}
    </li>
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
