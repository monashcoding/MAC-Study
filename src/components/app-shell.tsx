"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
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
import { AppHeaderDetailProvider } from "@/components/app-header-detail";
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
    href: "/app/units",
    label: "Units",
    title: "Units",
    subtitle: "Find MAC members taking the same units.",
    icon: BookOpen,
  },
  {
    href: "/app/statistics",
    label: "Statistics",
    mobileLabel: "Stats",
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
  const [headerDetail, setHeaderDetail] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const currentNav =
    navItems.find((item) => isActive(displayPathname, item.href)) ??
    navItems[0];
  const accountName =
    authState.mode === "authenticated"
      ? authState.profile.display_name?.trim() || "MAC member"
      : "Demo member";
  const accountHandle =
    authState.mode === "authenticated" && authState.profile.username
      ? `@${authState.profile.username}`
      : authState.mode === "authenticated"
        ? "MAC member"
        : "Local workspace";

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
    <AppHeaderDetailProvider onChange={setHeaderDetail}>
      <>
        <div className="mac-desktop-shell fixed inset-0 flex flex-col overflow-hidden bg-[var(--color-background)] lg:static lg:block lg:min-h-dvh lg:overflow-visible">
          <div
            className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-y-auto lg:grid lg:min-h-dvh lg:max-w-none lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:overflow-visible"
            ref={scrollContainerRef}
          >
            <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-[rgb(255_255_255/0.08)] lg:bg-[rgb(17_17_17/0.94)] lg:p-5 lg:backdrop-blur-xl">
              <div>
                <Brand />
                <p className="mb-2 mt-9 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Workspace
                </p>
                <nav aria-label="Primary navigation" className="grid gap-1.5">
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

              <DesktopAccount
                handle={accountHandle}
                mode={authState.mode}
                name={accountName}
              />
            </aside>

            <main className="min-w-0 flex-1 lg:min-h-dvh">
              <header className="sticky top-0 z-20 bg-[rgb(23_23_23/0.94)] px-4 pb-3 pt-[calc(var(--safe-area-top)+0.85rem)] backdrop-blur lg:z-30 lg:border-b lg:border-[rgb(255_255_255/0.07)] lg:bg-[rgb(23_23_23/0.84)] lg:px-8 lg:py-5 xl:px-12">
                <div className="mx-auto flex max-w-[80rem] items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3 lg:hidden">
                    <LogoMark size="sm" />
                    <h1 className="min-w-0 truncate text-xl font-semibold">
                      {currentNav.title}
                    </h1>
                  </div>
                  <div className="hidden lg:block">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-mac-yellow)]">
                      MAC Study / {currentNav.label}
                    </p>
                    <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.025em]">
                      {currentNav.title}
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm text-[var(--color-text-muted)]">
                      {currentNav.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive(displayPathname, "/app/units") && headerDetail ? (
                      <span className="max-w-28 truncate font-mono text-sm font-semibold text-[var(--color-mac-yellow)] lg:hidden">
                        {headerDetail}
                      </span>
                    ) : null}
                    <span className="hidden h-10 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[rgb(255_255_255/0.025)] px-3 text-xs font-semibold text-[var(--color-text-muted)] xl:inline-flex">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          authState.mode === "authenticated"
                            ? "bg-[var(--color-success)]"
                            : "bg-[var(--color-mac-yellow)]",
                        )}
                      />
                      {authState.mode === "authenticated"
                        ? "Synced"
                        : "Demo mode"}
                    </span>
                    {authState.mode === "authenticated" ? (
                      <a
                        className="mac-focus hidden h-10 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-muted)] transition hover:border-[rgb(255_255_255/0.2)] hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)] lg:inline-flex"
                        href="/auth/logout"
                      >
                        <LogOut aria-hidden size={17} />
                        <span>Sign out</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              </header>

              <div className="px-4 pb-[calc(var(--mobile-nav-height)+1.5rem)] pt-5 sm:px-6 lg:mx-auto lg:w-full lg:max-w-[80rem] lg:px-8 lg:py-8 xl:px-12 xl:py-10">
                <div className="lg:rounded-lg lg:border lg:border-[rgb(255_255_255/0.065)] lg:bg-[rgb(20_20_20/0.5)] lg:p-6 lg:shadow-[0_28px_80px_rgb(0_0_0/0.28)] xl:p-8">
                  <AppWorkspace
                    activePathname={displayPathname}
                    authState={authState}
                    fallback={children}
                  />
                </div>
              </div>
            </main>
          </div>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 h-[var(--mobile-nav-height)] bg-[var(--color-background)] px-2 pb-[var(--safe-area-bottom)] shadow-[0_-16px_36px_rgb(0_0_0/0.28)] backdrop-blur lg:hidden">
          <div className="mx-auto grid h-[var(--mobile-nav-content-height)] max-w-lg grid-cols-6 items-center gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(displayPathname, item.href);

              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "mac-focus flex h-12 min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-md border text-[0.625rem] font-medium transition active:scale-[0.98] sm:text-xs",
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
                  <Icon aria-hidden size={18} />
                  <span className="max-w-full truncate px-0.5">
                    {"mobileLabel" in item ? item.mobileLabel : item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>

        {authState.mode === "authenticated" ? (
          <NudgeNotifications userId={authState.user.id} />
        ) : null}
      </>
    </AppHeaderDetailProvider>
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
          <span className="mt-0.5 block text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            Focus together
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
        "mac-focus group flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-sm font-semibold transition",
        isActive
          ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)] text-[#141414] shadow-[0_10px_28px_rgb(255_227_48/0.08)]"
          : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border)] hover:bg-[rgb(255_255_255/0.035)] hover:text-[var(--color-text)]",
      )}
      href={href}
      onClick={(event) => onNavigate(href, event)}
      onFocus={() => onIntent(href)}
      onPointerDown={() => onIntent(href)}
      onPointerEnter={() => onIntent(href)}
      prefetch
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition",
          isActive
            ? "bg-[rgb(20_20_20/0.1)]"
            : "bg-[rgb(255_255_255/0.035)] group-hover:bg-[rgb(255_255_255/0.06)]",
        )}
      >
        <Icon aria-hidden size={18} />
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      <ChevronRight
        aria-hidden
        className={cn(
          "transition",
          isActive
            ? "opacity-70"
            : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60",
        )}
        size={15}
      />
    </Link>
  );
}

function DesktopAccount({
  handle,
  mode,
  name,
}: {
  handle: string;
  mode: AppAuthState["mode"];
  name: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mt-auto rounded-lg border border-[rgb(255_255_255/0.08)] bg-[rgb(255_255_255/0.025)] p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-sm font-bold text-[#141414]">
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
            {handle}
          </span>
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-[rgb(255_255_255/0.07)] pt-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            mode === "authenticated"
              ? "bg-[var(--color-success)]"
              : "bg-[var(--color-mac-yellow)]",
          )}
        />
        {mode === "authenticated" ? "Account connected" : "Demo workspace"}
      </div>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/app") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
