import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import { getServerStudySession } from "@/lib/auth/server-session";

type LoginPageProps = {
  searchParams: Promise<{
    complete?: string;
    next?: string;
    signedOut?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = getSafeNextPath(params.next);

  const session = await getServerStudySession();

  if (session) {
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
              Sign in to keep sessions synced
            </span>
          </span>
        </Link>

        <section className="mac-panel p-5">
          <div>
            <p className="text-sm font-medium text-[var(--color-mac-yellow)]">
              Welcome back
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              Study with your MAC crew
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
              Sign in through the central MAC account system. If you already
              signed into another MAC app, you will continue automatically.
            </p>
          </div>

          {params.signedOut === "1" ? (
            <p className="mt-5 rounded-md border border-[rgb(66_211_146/0.35)] bg-[rgb(66_211_146/0.07)] p-3 text-sm text-[var(--color-success)]">
              You have been signed out of your MAC account.
            </p>
          ) : null}

          <LoginForm
            autoComplete={params.signedOut !== "1"}
            nextPath={next}
            returnedFromProvider={params.complete === "1"}
          />
        </section>
      </div>
    </main>
  );
}
