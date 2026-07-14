import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, TicketCheck } from "lucide-react";
import { getPendingAuthState } from "@/lib/auth/app-auth";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import { redeemInvite } from "./actions";

type AccessPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams;
  const next = getSafeNextPath(params.next);
  const authState = await getPendingAuthState(next);

  if (authState.mode === "demo") {
    redirect("/app");
  }

  if (authState.profile?.access_status === "active") {
    redirect(next);
  }

  return (
    <main className="min-h-dvh bg-[var(--color-background)] px-4 pb-8 pt-[calc(var(--safe-area-top)+2rem)]">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col justify-center">
        <Link
          className="mac-focus mb-8 inline-flex items-center gap-3 rounded-md"
          href="/"
        >
          <Image
            alt=""
            aria-hidden
            className="rounded-md"
            height={42}
            priority
            src="/icons/mac-square.png"
            width={42}
          />
          <span>
            <span className="block text-xl font-semibold">MAC Study</span>
            <span className="text-sm text-[var(--color-text-muted)]">
              MAC-only access
            </span>
          </span>
        </Link>

        <section className="mac-panel p-5">
          <p className="text-sm font-medium text-[var(--color-mac-yellow)]">
            Invite required
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Confirm you&apos;re part of MAC
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
            You are signed in as {authState.user.email ?? "a MAC member"}, but
            this account still needs an invite code before sessions count.
          </p>

          <form action={redeemInvite} className="mt-6 space-y-3">
            <input name="next" type="hidden" value={next} />
            <label className="block text-sm font-medium" htmlFor="inviteCode">
              Invite code
            </label>
            <input
              autoComplete="one-time-code"
              className="mac-focus h-12 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
              id="inviteCode"
              name="inviteCode"
              placeholder="MAC-FOUNDING"
              required
            />
            <button
              className="mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414]"
              type="submit"
            >
              <TicketCheck aria-hidden size={18} />
              Unlock MAC Study
            </button>
          </form>

          {params.error ? (
            <p className="mt-4 rounded-md border border-[rgb(255_107_107/0.45)] bg-[rgb(255_107_107/0.08)] p-3 text-sm text-[var(--color-danger)]">
              {params.error === "missing"
                ? "Enter an invite code to continue."
                : "That invite code is invalid, expired, or fully used."}
            </p>
          ) : null}

          <a
            className="mac-focus mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-muted)]"
            href="/auth/logout"
          >
            <LogOut aria-hidden size={17} />
            Use a different account
          </a>
        </section>
      </div>
    </main>
  );
}
