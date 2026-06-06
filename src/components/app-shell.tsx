"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useEffect, useOptimistic, useTransition } from "react";
import {
  BarChart3,
  BookOpen,
  Clock3,
  LogOut,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import type { AppAuthState } from "@/lib/auth/app-auth";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/app", label: "Timer", icon: Clock3 },
  { href: "/app/subjects", label: "Subjects", icon: BookOpen },
  { href: "/app/groups", label: "Groups", icon: Users },
  { href: "/app/leaderboards", label: "Ranks", icon: BarChart3 },
  { href: "/app/profile", label: "Profile", icon: Settings },
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
  const [isPending, startTransition] = useTransition();
  const [optimisticPathname, setOptimisticPathname] = useOptimistic(pathname);
  const isDemo = authState.mode === "demo";
  const displayName =
    authState.mode === "authenticated"
      ? (authState.profile.display_name ?? authState.user.email ?? "MAC member")
      : "Demo mode";

  useEffect(() => {
    navItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [router]);

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

    if (href === pathname) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    warmRoute(href);

    startTransition(() => {
      setOptimisticPathname(href);
      router.push(href);
    });
  }

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      {isPending ? (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-[var(--color-mac-yellow)] lg:hidden" />
      ) : null}
      <div className="mx-auto flex h-[calc(100dvh-var(--mobile-nav-height))] w-full max-w-6xl overflow-y-auto lg:h-auto lg:min-h-dvh lg:gap-5 lg:overflow-visible lg:px-6">
        <aside className="hidden w-64 shrink-0 py-6 lg:block">
          <div className="sticky top-6">
            <Brand />
            <nav className="mt-8 grid gap-2">
              {navItems.map((item) => (
                <NavLink
                  href={item.href}
                  icon={item.icon}
                  isActive={isActive(optimisticPathname, item.href)}
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
          <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[rgb(37_37_37/0.88)] px-4 py-3 backdrop-blur lg:border-b-0 lg:bg-transparent lg:px-0 lg:pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="lg:hidden">
                <Brand compact />
              </div>
              <div className="hidden lg:block">
                <p className="text-sm text-[var(--color-text-muted)]">
                  {displayName}
                </p>
                <p className="text-lg font-semibold">Today&apos;s study plan</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isDemo
                        ? "bg-[var(--color-mac-yellow)]"
                        : "bg-[var(--color-success)]",
                    )}
                  />
                  {isDemo ? "Demo" : "MAC-only"}
                </div>
                {!isDemo ? (
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

          <div className="px-4 pb-8 pt-4 sm:px-6 lg:px-0">{children}</div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 h-[var(--mobile-nav-height)] border-t border-[var(--color-border)] bg-[rgb(37_37_37/0.96)] px-2 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        <div className="mx-auto grid h-full max-w-lg grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(optimisticPathname, item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "mac-focus flex h-14 touch-manipulation flex-col items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors active:scale-[0.98]",
                  active
                    ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                    : "text-[var(--color-text-muted)]",
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
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="mac-focus flex items-center gap-3 rounded-md" href="/app">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
        <Sparkles aria-hidden size={20} />
      </span>
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
            Timers, crews, ranks
          </span>
        ) : null}
      </span>
    </Link>
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
        "mac-focus flex h-12 items-center gap-3 rounded-md px-3 text-sm font-medium",
        isActive
          ? "bg-[var(--color-mac-yellow)] text-[#141414]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
      )}
      href={href}
      onClick={(event) => onNavigate(href, event)}
      onFocus={() => onIntent(href)}
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
