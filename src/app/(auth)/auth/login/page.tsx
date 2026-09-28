import Image from "next/image";
import { redirect } from "next/navigation";
import { BookOpen, Clock3, UsersRound } from "lucide-react";
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
    <main className="min-h-[var(--app-viewport-height)] overflow-x-hidden bg-[var(--color-background)] px-4 pb-[calc(var(--safe-area-bottom)+1rem)] pt-[calc(var(--safe-area-top)+1rem)] sm:px-8 lg:grid lg:h-[var(--app-viewport-height)] lg:min-h-0 lg:place-items-center lg:overflow-hidden lg:px-12 lg:py-0">
      <section
        aria-labelledby="login-title"
        className="mx-auto grid w-full max-w-6xl gap-5 py-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.65fr)] lg:grid-rows-[auto_auto] lg:items-center lg:gap-x-16 lg:gap-y-8 lg:py-0"
      >
        <div className="max-w-2xl lg:col-start-1 lg:row-start-1">
          <div className="flex items-center gap-3">
            <Image
              alt="MAC Study"
              className="h-10 w-10 rounded-lg sm:h-12 sm:w-12"
              height={48}
              priority
              src="/icons/mac-square.png"
              width={48}
            />
            <span className="text-lg font-semibold">MAC Study</span>
          </div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-mac-yellow)] sm:mt-10 sm:text-sm lg:mt-12">
            Study together
          </p>
          <h1
            className="mt-2 max-w-xl text-3xl font-semibold leading-[1.08] tracking-[-0.04em] sm:mt-3 sm:text-5xl"
            id="login-title"
          >
            <span className="block">Study with your friends.</span>
            <span className="mt-1 block text-[var(--color-mac-yellow)]">
              Track your progress.
            </span>
          </h1>
        </div>
        <div className="w-full rounded-xl border border-[var(--color-border)] bg-[rgb(255_255_255/0.018)] p-4 sm:p-7 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <h2 className="text-xl font-semibold sm:text-2xl">Sign in</h2>
          <p className="mt-1.5 text-xs text-[var(--color-text-muted)] sm:mt-2 sm:text-sm">
            Continue with your Google or Microsoft account.
          </p>
          <div className="mt-4 sm:mt-6">
            <LoginForm
              autoComplete={params.signedOut !== "1"}
              nextPath={next}
              returnedFromProvider={params.complete === "1"}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:col-start-1 lg:row-start-2">
          <ValuePreview
            detail="See your time and consistency"
            icon={Clock3}
            title="Track study time"
          />
          <ValuePreview
            detail="Bring your friends together"
            icon={UsersRound}
            title="Create groups"
          />
          <ValuePreview
            detail="Connect through your units"
            icon={BookOpen}
            title="Find classmates"
          />
        </div>
      </section>
    </main>
  );
}

function ValuePreview({
  detail,
  icon: Icon,
  title,
}: {
  detail: string;
  icon: typeof UsersRound;
  title: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[rgb(255_255_255/0.09)] bg-[rgb(255_255_255/0.018)] p-2.5 sm:p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)] sm:h-10 sm:w-10">
        <Icon aria-hidden size={18} strokeWidth={2.2} />
      </span>
      <p className="mt-3 text-xs font-semibold leading-4 text-[var(--color-text)] sm:mt-4 sm:text-sm sm:leading-5">
        {title}
      </p>
      <p className="mt-1 hidden text-xs leading-5 text-[var(--color-text-muted)] sm:block">
        {detail}
      </p>
    </div>
  );
}
