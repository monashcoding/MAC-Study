"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Download,
  MonitorDown,
  MoreVertical,
  Pin,
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

type InstallStep = {
  action?: ReactNode;
  detail?: string;
  glyph?: typeof Share;
  media?: ReactNode;
  title: string;
};

export type InstallGuideTarget = "pc" | "phone";

// Closing a guide hides the launchers for the browser session; ticking
// "Don't show again" hides them for good. Settings can always reopen a guide.
const LAUNCHER_HIDDEN_KEY = "mac-install-launchers-hidden";
const LAUNCHER_CLOSED_SESSION_KEY = "mac-install-launchers-closed";

const phoneGuides: Record<InstallPlatform, InstallStep[]> = {
  ios: [
    { title: "Open study.monashcoding.com in Safari" },
    { glyph: Share, title: "Tap Share" },
    { glyph: SquarePlus, title: "Add to Home Screen" },
  ],
  android: [
    { title: "Open study.monashcoding.com in Chrome" },
    { glyph: MoreVertical, title: "Tap the menu" },
    { glyph: SquarePlus, title: "Add to Home screen" },
  ],
};

export function InstallOnboarding({ enabled = true }: { enabled?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktopGuideOpen, setIsDesktopGuideOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [activePlatform, setActivePlatform] = useState<InstallPlatform>("ios");
  const [areLaunchersHidden, setAreLaunchersHidden] = useState(true);
  const [dontShowAgain, setDontShowAgain] = useState(false);
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

    const android = /Android/i.test(navigator.userAgent);
    let launchersHidden = false;

    try {
      launchersHidden =
        window.localStorage.getItem(LAUNCHER_HIDDEN_KEY) === "true" ||
        window.sessionStorage.getItem(LAUNCHER_CLOSED_SESSION_KEY) === "true";
    } catch {
      // Without storage the launchers simply show again next visit.
    }

    const frame = window.requestAnimationFrame(() => {
      setIsDesktop(desktopDevice);
      setIsStandalone(standalone);
      setAreLaunchersHidden(launchersHidden);
      if (android) setActivePlatform("android");
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
    function openInstallGuide(event: Event) {
      if (!isReady || isStandalone) return;

      const target = (event as CustomEvent<InstallGuideTarget | undefined>)
        .detail;
      const showPcGuide = target ? target === "pc" : isDesktop;

      if (showPcGuide) {
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
  }, [isDesktop, isReady, isStandalone]);

  function closeGuides() {
    setIsOpen(false);
    setIsDesktopGuideOpen(false);
    setAreLaunchersHidden(true);

    try {
      window.sessionStorage.setItem(LAUNCHER_CLOSED_SESSION_KEY, "true");
      if (dontShowAgain) {
        window.localStorage.setItem(LAUNCHER_HIDDEN_KEY, "true");
      }
    } catch {
      // Hiding still applies for this page view.
    }
  }

  async function install() {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") closeGuides();
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

  const desktopSteps: InstallStep[] = [
    canInstall
      ? {
          action: (
            <button
              className="mac-focus inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414] disabled:opacity-45"
              disabled={isInstalling}
              onClick={() => void install()}
              type="button"
            >
              <Download aria-hidden size={15} />
              {isInstalling ? "Installing…" : "Install app"}
            </button>
          ),
          title: "Install the app",
        }
      : { glyph: MonitorDown, title: "Click install in the address bar" },
    {
      glyph: Pin,
      media: (
        <div className="relative mt-3 aspect-[346/63] w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-black">
          <Image
            alt="MAC Study pinned alongside other apps on the Windows taskbar"
            className="object-cover"
            fill
            loading="eager"
            sizes="(max-width: 672px) calc(100vw - 90px), 560px"
            src="/images/onboarding/mac-study-windows-taskbar.png"
          />
        </div>
      ),
      title: "Pin it to your taskbar",
    },
  ];

  return (
    <>
      {enabled && isReady && !isStandalone && !areLaunchersHidden ? (
        <div className="fixed bottom-[calc(var(--mobile-nav-height)+0.75rem)] right-3 z-40 flex items-end gap-2 lg:bottom-6 lg:right-6">
          {isDesktop ? (
            <InstallLauncher
              className="hidden lg:inline-flex"
              icon={MonitorDown}
              label="Install on PC"
              onClick={() => setIsDesktopGuideOpen(true)}
              subtitle="Open it like an app"
            />
          ) : null}
          <InstallLauncher
            icon={Smartphone}
            label={isDesktop ? "Add to your phone" : "Add to Home Screen"}
            onClick={() => setIsOpen(true)}
            subtitle="Keep it one tap away"
          />
        </div>
      ) : null}

      {isOpen ? (
        <AppDialog
          bodyClassName="p-4 sm:p-6"
          closeLabel="Close phone install guide"
          footer={
            <InstallFooter
              canInstall={canInstall && !isDesktop}
              dismissLabel={canInstall && !isDesktop ? "Not now" : "Done"}
              isInstalling={isInstalling}
              dontShowAgain={areLaunchersHidden ? undefined : dontShowAgain}
              onDismiss={closeGuides}
              onDontShowAgainChange={setDontShowAgain}
              onInstall={() => void install()}
            />
          }
          footerClassName="border-t-0 px-4 pb-4 pt-0 sm:px-6 sm:pb-6"
          headerClassName="border-b-0 px-4 pb-0 pt-4 sm:px-6 sm:pt-5"
          maxWidthClassName="max-w-3xl"
          onClose={closeGuides}
          title="Add MAC Study to your phone"
          titleClassName="whitespace-normal text-xl leading-7 sm:text-2xl"
        >
          <div className="grid gap-5 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center sm:gap-8">
            <PhoneHomeScreenPreview />

            <div className="min-w-0 space-y-5">
              <p className="text-sm leading-6 text-[var(--color-text-muted)]">
                It opens full screen like any other app, straight from your Home
                Screen.
              </p>

              <div
                aria-label="Choose your phone"
                className="inline-grid grid-cols-2 rounded-lg bg-[rgb(255_255_255/0.04)] p-1"
                role="tablist"
              >
                {(["ios", "android"] as const).map((platform) => (
                  <button
                    aria-controls={`${tabsId}-${platform}-panel`}
                    aria-selected={activePlatform === platform}
                    className={cn(
                      "mac-focus min-h-9 rounded-md px-4 text-sm font-semibold transition",
                      activePlatform === platform
                        ? "bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_4px_12px_rgb(0_0_0/0.35)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
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
                    {platform === "ios" ? "iPhone" : "Android"}
                  </button>
                ))}
              </div>

              <div
                aria-labelledby={`${tabsId}-${activePlatform}-tab`}
                id={`${tabsId}-${activePlatform}-panel`}
                role="tabpanel"
              >
                <InstallSteps steps={phoneGuides[activePlatform]} />
              </div>
            </div>
          </div>
        </AppDialog>
      ) : null}

      {isDesktopGuideOpen ? (
        <AppDialog
          bodyClassName="p-4 sm:p-6"
          closeLabel="Close PC install guide"
          footer={
            <InstallFooter
              canInstall={canInstall}
              dismissLabel={canInstall ? "Install later" : "Done"}
              isInstalling={isInstalling}
              dontShowAgain={areLaunchersHidden ? undefined : dontShowAgain}
              onDismiss={closeGuides}
              onDontShowAgainChange={setDontShowAgain}
              onInstall={() => void install()}
            />
          }
          footerClassName="border-t-0 px-4 pb-4 pt-0 sm:px-6 sm:pb-6"
          headerClassName="border-b-0 px-4 pb-0 pt-4 sm:px-6 sm:pt-5"
          maxWidthClassName="max-w-xl"
          onClose={closeGuides}
          title="Install MAC Study on your PC"
          titleClassName="whitespace-normal text-xl leading-7 sm:text-2xl"
        >
          <div className="space-y-5">
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              Get its own window and a spot on your taskbar, without the browser
              tabs.
            </p>
            <InstallSteps steps={desktopSteps} />
          </div>
        </AppDialog>
      ) : null}
    </>
  );
}

function InstallSteps({ steps }: { steps: InstallStep[] }) {
  return (
    <ol className="relative grid gap-5">
      <span
        aria-hidden
        className="absolute bottom-3 left-[0.8125rem] top-3 w-px bg-[var(--color-border)]"
      />
      {steps.map((step, index) => {
        const Glyph = step.glyph;

        return (
          <li
            className="relative grid grid-cols-[1.625rem_minmax(0,1fr)] gap-3"
            key={step.title}
          >
            <span className="flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-xs font-bold text-[#141414] ring-4 ring-[var(--color-background)]">
              {index + 1}
            </span>
            <span className="min-w-0 pt-0.5">
              <span
                className={cn(
                  "flex flex-wrap items-center gap-2 font-semibold text-[var(--color-text)]",
                  step.detail
                    ? "text-sm leading-5"
                    : "text-[0.95rem] leading-6",
                )}
              >
                {step.title}
                {step.action}
                {Glyph ? (
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[rgb(255_255_255/0.06)] text-[var(--color-text)]">
                    <Glyph aria-hidden size={14} strokeWidth={2.2} />
                  </span>
                ) : null}
              </span>
              {step.detail ? (
                <span className="mt-1 block text-sm leading-5 text-[var(--color-text-muted)]">
                  {step.detail}
                </span>
              ) : null}
              {step.media}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function InstallFooter({
  canInstall,
  dismissLabel,
  dontShowAgain,
  isInstalling,
  onDismiss,
  onDontShowAgainChange,
  onInstall,
}: {
  canInstall: boolean;
  dismissLabel: string;
  dontShowAgain?: boolean;
  isInstalling: boolean;
  onDismiss: () => void;
  onDontShowAgainChange: (value: boolean) => void;
  onInstall: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-3">
      {dontShowAgain !== undefined ? (
        <label className="mr-auto inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-[var(--color-text-muted)] has-[:focus-visible]:text-[var(--color-text)]">
          <input
            checked={dontShowAgain}
            className="mac-focus h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-mac-yellow)]"
            onChange={(event) => onDontShowAgainChange(event.target.checked)}
            type="checkbox"
          />
          Don’t show again
        </label>
      ) : null}
      <button
        className={cn(
          "mac-focus h-11 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-45",
          canInstall
            ? "text-[var(--color-text-muted)] hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)]"
            : "min-w-28 bg-[rgb(255_255_255/0.06)] text-[var(--color-text)] hover:bg-[rgb(255_255_255/0.1)]",
        )}
        data-dialog-autofocus={canInstall ? undefined : true}
        disabled={isInstalling}
        onClick={onDismiss}
        type="button"
      >
        {dismissLabel}
      </button>
      {canInstall ? (
        <button
          className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--color-mac-yellow)] px-5 text-sm font-semibold text-[#141414] disabled:opacity-45"
          data-dialog-autofocus
          disabled={isInstalling}
          onClick={onInstall}
          type="button"
        >
          <Download aria-hidden size={18} />
          {isInstalling ? "Installing…" : "Install app"}
        </button>
      ) : null}
    </div>
  );
}

function InstallLauncher({
  className,
  icon: Icon,
  label,
  onClick,
  subtitle,
}: {
  className?: string;
  icon: typeof Download;
  label: string;
  onClick: () => void;
  subtitle: string;
}) {
  return (
    <button
      aria-haspopup="dialog"
      className={cn(
        "mac-focus group inline-flex min-h-12 items-center gap-2.5 rounded-xl border border-[rgb(255_227_48/0.28)] bg-[rgb(28_28_28/0.96)] py-1.5 pl-1.5 pr-3 text-left shadow-[0_18px_48px_rgb(0_0_0/0.42)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-[rgb(255_227_48/0.55)] hover:bg-[rgb(32_32_32/0.98)] lg:min-h-14 lg:gap-3 lg:px-3 lg:py-2.5",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-mac-yellow)] lg:h-10 lg:w-10 text-[#141414] shadow-[0_8px_24px_rgb(255_227_48/0.16)]">
        <Icon aria-hidden size={20} strokeWidth={2.1} />
      </span>
      <span className="pr-1">
        <span className="block text-sm font-semibold text-[var(--color-text)]">
          {label}
        </span>
        <span className="mt-0.5 hidden text-xs text-[var(--color-text-muted)] lg:block">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

// The screenshot is 1290×2598; the ring sits over the MAC Study icon in its dock.
function PhoneHomeScreenPreview() {
  return (
    <figure className="relative mx-auto h-44 w-full overflow-hidden rounded-b-[1.75rem] rounded-t-xl border-[5px] border-[#2b2b28] bg-[#111] shadow-[0_24px_60px_rgb(0_0_0/0.55)] sm:h-auto sm:w-52 sm:rounded-[2.25rem]">
      <div className="absolute inset-x-0 bottom-0 aspect-[1290/2598] sm:relative">
        <Image
          alt="A phone Home Screen with MAC Study in the dock"
          className="object-cover"
          fill
          loading="eager"
          sizes="(max-width: 640px) calc(100vw - 48px), 208px"
          src="/images/onboarding/home_screen.png"
        />
        <span
          aria-hidden
          className="absolute left-[75.6%] top-[87.9%] h-[8.4%] w-[17%] rounded-[24%] ring-[3px] ring-[var(--color-mac-yellow)]"
        />
      </div>
    </figure>
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
