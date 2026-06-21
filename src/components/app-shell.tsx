"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  BarChart3,
  House,
  LogOut,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import type { AppAuthState } from "@/lib/auth/app-auth";
import {
  cacheRemoteSocialSnapshot,
  cacheRemoteTimerState,
} from "@/lib/client-cache";
import {
  fetchRemoteSocialSnapshot,
  fetchRemoteTimerState,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { AppWorkspace } from "@/components/app-workspace";
import { NudgeNotifications } from "@/components/social/nudge-notifications";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/app",
    label: "Home",
    title: "Home",
    subtitle: "Track today's study and jump straight into a subject.",
    icon: House,
  },
  {
    href: "/app/groups",
    label: "Group",
    title: "Group",
    subtitle: "Study with friends and compare group effort.",
    icon: Users,
  },
  {
    href: "/app/friends",
    label: "Friends",
    title: "Friends",
    subtitle: "See friends, profiles, and group invites.",
    icon: UserRound,
  },
  {
    href: "/app/statistics",
    label: "Statistics",
    title: "Statistics",
    subtitle: "Review time, streaks, and subject split.",
    icon: BarChart3,
  },
  {
    href: "/app/profile",
    label: "Profile",
    title: "Profile",
    subtitle: "Control access, nudges, and account settings.",
    icon: Settings,
  },
];

export function AppShell({
  authState,
  children,
}: {
  authState: AppAuthState;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [displayPathname, setDisplayPathname] = useState(pathname);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const currentNav =
    navItems.find((item) => isActive(displayPathname, item.href)) ??
    navItems[0];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDisplayPathname(pathname);
      const container = scrollContainerRef.current;

      if (container) {
        container.scrollTop = scrollPositionsRef.current[pathname] ?? 0;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const viewport = window.visualViewport;

    function syncViewportHeight() {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty(
        "--app-viewport-height",
        `${Math.round(height)}px`,
      );
    }

    syncViewportHeight();
    viewport?.addEventListener("resize", syncViewportHeight);
    window.addEventListener("resize", syncViewportHeight);
    window.addEventListener("orientationchange", syncViewportHeight);

    return () => {
      viewport?.removeEventListener("resize", syncViewportHeight);
      window.removeEventListener("resize", syncViewportHeight);
      window.removeEventListener("orientationchange", syncViewportHeight);
      document.documentElement.style.removeProperty("--app-viewport-height");
    };
  }, []);

  useEffect(() => {
    function prefetchAll() {
      navItems.forEach((item) => {
        router.prefetch(item.href);
      });
    }

    prefetchAll();
    const timeout = window.setTimeout(prefetchAll, 250);

    return () => window.clearTimeout(timeout);
  }, [router]);

  useEffect(() => {
    if (authState.mode !== "authenticated") {
      return;
    }

    let cancelled = false;

    async function warmAppData() {
      try {
        const supabase = createSupabaseBrowserClient();
        const [timerResult, socialResult] = await Promise.allSettled([
          fetchRemoteTimerState(supabase),
          fetchRemoteSocialSnapshot(supabase),
        ]);

        if (cancelled) {
          return;
        }

        if (timerResult.status === "fulfilled" && timerResult.value) {
          cacheRemoteTimerState(timerResult.value);
        }

        if (socialResult.status === "fulfilled" && socialResult.value) {
          cacheRemoteSocialSnapshot(socialResult.value);
        }
      } catch {
        // Route navigation should stay instant even if a background warm fails.
      }
    }

    void warmAppData();

    return () => {
      cancelled = true;
    };
  }, [authState.mode]);

  useEffect(() => {
    navItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [pathname, router]);

  function warmRoute(href: string) {
    router.prefetch(href);
  }

  function navigateTo(href: string, event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (href === displayPathname) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    warmRoute(href);
    rememberScroll(displayPathname);
    setDisplayPathname(href);
    restoreScroll(href);

    startTransition(() => {
      router.push(href);
    });
  }

  function rememberScroll(path: string) {
    const container = scrollContainerRef.current;

    if (container) {
      scrollPositionsRef.current[path] = container.scrollTop;
    }
  }

  function restoreScroll(path: string) {
    window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;

      if (container) {
        container.scrollTop = scrollPositionsRef.current[path] ?? 0;
      }
    });
  }

  return (
    <div className="fixed inset-x-0 top-0 flex h-[var(--app-viewport-height)] flex-col overflow-hidden bg-[var(--color-background)] lg:static lg:block lg:min-h-dvh lg:overflow-visible">
      <div
        className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-y-auto lg:min-h-dvh lg:gap-5 lg:overflow-visible lg:px-6"
        ref={scrollContainerRef}
      >
        <aside className="hidden w-64 shrink-0 py-6 lg:block">
          <div className="sticky top-6">
            <Brand />
            <nav className="mt-8 grid gap-2">
              {navItems.map((item) => (
                <NavLink
                  href={item.href}
                  icon={item.icon}
                  isActive={isActive(displayPathname, item.href)}
                  key={item.href}
                  label={item.label}
                  onIntent={warmRoute}
                  onNavigate={navigateTo}
                />
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 bg-[rgb(23_23_23/0.94)] px-4 pb-3 pt-[calc(var(--safe-area-top)+0.85rem)] backdrop-blur lg:static lg:bg-transparent lg:px-0 lg:pb-5 lg:pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3 lg:hidden">
                <LogoMark size="sm" />
                <h1 className="min-w-0 truncate text-xl font-semibold">
                  {currentNav.title}
                </h1>
              </div>
              <div className="hidden lg:block">
                <h1 className="mt-1 text-3xl font-semibold tracking-normal">
                  {currentNav.title}
                </h1>
                <p className="mt-2 max-w-xl text-sm text-[var(--color-text-muted)]">
                  {currentNav.subtitle}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {authState.mode === "authenticated" ? (
                  <a
                    className="mac-focus hidden h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] lg:inline-flex"
                    href="/auth/logout"
                  >
                    <LogOut aria-hidden size={17} />
                    <span className="sr-only">Sign out</span>
                  </a>
                ) : null}
              </div>
            </div>
          </header>

          <div className="px-4 pb-[calc(var(--mobile-nav-height)+1.5rem)] pt-5 sm:px-6 lg:px-0 lg:pb-8 lg:pt-0">
            <AppWorkspace
              activePathname={displayPathname}
              authState={authState}
              fallback={children}
            />
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 h-[var(--mobile-nav-height)] bg-[rgb(23_23_23/0.97)] px-2 pb-[max(0.55rem,var(--safe-area-bottom))] pt-2 shadow-[0_-16px_36px_rgb(0_0_0/0.28)] backdrop-blur lg:hidden">
        <div className="mx-auto grid h-full max-w-lg grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(displayPathname, item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "mac-focus flex h-12 touch-manipulation flex-col items-center justify-center gap-1 rounded-md border text-xs font-medium transition active:scale-[0.98]",
                  active
                    ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)] text-[#141414]"
                    : "border-transparent text-[var(--color-text-muted)]",
                )}
                href={item.href}
                key={item.href}
                onClick={(event) => navigateTo(item.href, event)}
                onFocus={() => warmRoute(item.href)}
                onPointerDown={() => warmRoute(item.href)}
                onPointerEnter={() => warmRoute(item.href)}
                prefetch
              >
                <Icon aria-hidden size={19} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {authState.mode === "authenticated" ? (
        <NudgeNotifications userId={authState.user.id} />
      ) : null}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="mac-focus flex items-center gap-3 rounded-md" href="/app">
      <LogoMark size={compact ? "sm" : "md"} />
      <span>
        <span
          className={cn(
            "block font-semibold leading-tight",
            compact ? "text-base" : "text-xl",
          )}
        >
          MAC Study
        </span>
        {!compact ? (
          <span className="text-sm text-[var(--color-text-muted)]">
            Study, crews, ranks
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function LogoMark({ size = "md" }: { size?: "sm" | "md" }) {
  const pixels = size === "sm" ? 36 : 42;

  return (
    <Image
      alt=""
      aria-hidden
      className="shrink-0 rounded-full"
      height={pixels}
      priority={size === "md"}
      src="/icons/mac-square.png"
      width={pixels}
    />
  );
}

function NavLink({
  href,
  icon: Icon,
  isActive,
  label,
  onIntent,
  onNavigate,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  isActive: boolean;
  label: string;
  onIntent: (href: string) => void;
  onNavigate: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "mac-focus flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium transition",
        isActive
          ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)] text-[#141414]"
          : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
      )}
      href={href}
      onClick={(event) => onNavigate(href, event)}
      onFocus={() => onIntent(href)}
      onPointerDown={() => onIntent(href)}
      onPointerEnter={() => onIntent(href)}
      prefetch
    >
      <Icon aria-hidden size={19} />
      {label}
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/app") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
