import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AtSign, UserRound } from "lucide-react";
import { ensureProfile, needsProfileSetup } from "@/lib/supabase/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveProfileIdentity } from "./actions";

type ProfileSetupPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function ProfileSetupPage({
  searchParams,
}: ProfileSetupPageProps) {
  const params = await searchParams;
  const next = getSafeNextPath(params.next);
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(next);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const profile = await ensureProfile(supabase, user);

  if (!needsProfileSetup(profile)) {
    redirect(next);
  }

  const defaultName = profile?.display_name?.trim() ?? "";

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
            className="rounded-full"
            height={42}
            priority
            src="/icons/mac-square.png"
            width={42}
          />
          <span>
            <span className="block text-xl font-semibold">MAC Study</span>
            <span className="text-sm text-[var(--color-text-muted)]">
              Profile setup
            </span>
          </span>
        </Link>

        <section className="rounded-md bg-[rgb(255_255_255/0.035)] p-5">
          <p className="text-sm font-medium text-[var(--color-mac-yellow)]">
            Choose your identity
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Set your name and @username
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
            Your name can match someone else. Your username is unique and is how
            friends find the right account.
          </p>

          <form action={saveProfileIdentity} className="mt-6 space-y-4">
            <input name="next" type="hidden" value={next} />

            <label className="block text-sm font-medium" htmlFor="displayName">
              Name
            </label>
            <div className="flex h-12 items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3">
              <UserRound
                aria-hidden
                className="shrink-0 text-[var(--color-text-muted)]"
                size={18}
              />
              <input
                autoComplete="name"
                className="mac-focus min-w-0 flex-1 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
                defaultValue={defaultName}
                id="displayName"
                maxLength={60}
                minLength={2}
                name="displayName"
                placeholder="Steven Phan"
                required
              />
            </div>

            <label className="block text-sm font-medium" htmlFor="username">
              Username
            </label>
            <div className="flex h-12 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3">
              <AtSign
                aria-hidden
                className="shrink-0 text-[var(--color-text-muted)]"
                size={18}
              />
              <input
                autoCapitalize="none"
                autoComplete="username"
                className="mac-focus min-w-0 flex-1 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
                id="username"
                maxLength={24}
                minLength={3}
                name="username"
                pattern="[a-zA-Z0-9_]+"
                placeholder="stevenphanny"
                required
              />
            </div>

            <button
              className="mac-focus inline-flex h-12 w-full items-center justify-center rounded-md bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414]"
              type="submit"
            >
              Continue
            </button>
          </form>

          {params.error ? (
            <p className="mt-4 rounded-md border border-[rgb(255_107_107/0.45)] bg-[rgb(255_107_107/0.08)] p-3 text-sm text-[var(--color-danger)]">
              {getErrorText(params.error)}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function getErrorText(error: string) {
  if (error === "taken") {
    return "That username is already taken.";
  }

  if (error === "username") {
    return "Use 3-24 letters, numbers, or underscores.";
  }

  if (error === "name") {
    return "Use a name between 2 and 60 characters.";
  }

  if (error === "missing") {
    return "Add both your name and username.";
  }

  return "Could not save your profile. Try again.";
}

function getSafeNextPath(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/app";
  }

  if (next.startsWith("/auth/profile")) {
    return "/app";
  }

  return next;
}
