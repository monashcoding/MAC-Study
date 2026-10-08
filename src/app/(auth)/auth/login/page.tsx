import Image from "next/image";
import { redirect } from "next/navigation";
import { BookOpen, Clock3, UsersRound } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { LoginGreeting, LoginPreview } from "@/components/auth/login-preview";
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
    <main className="min-h-[var(--app-viewport-height)] overflow-x-hidden bg-[var(--color-background)] px-4 pb-[calc(var(--safe-area-bottom)+1.75rem)] pt-[calc(var(--safe-area-top)+1rem)] sm:px-8 lg:grid lg:h-[var(--app-viewport-height)] lg:min-h-0 lg:place-items-center lg:overflow-hidden lg:px-12 lg:py-0">
      {/* One tree for both layouts so the sign-in form (and its session
          check) only mounts once. Mobile: centred, Min and Max greet you.
          Desktop: split layout with the live app preview. */}
      <section
        aria-labelledby="login-title"
        className="mx-auto flex min-h-[calc(var(--app-viewport-height)-var(--safe-area-top)-var(--safe-area-bottom)-2.75rem)] w-full max-w-md flex-col lg:grid lg:min-h-0 lg:max-w-[68rem] lg:grid-cols-[440px_minmax(0,1fr)] lg:items-center lg:gap-20"
      >
        <div className="flex flex-1 flex-col lg:block lg:flex-none">
          <div className="flex items-center gap-3">
            <Image
              alt="MAC Study"
              className="h-9 w-9 rounded-lg lg:h-12 lg:w-12"
              height={48}
              priority
              src="/icons/mac-square.png"
              width={48}
            />
            <span className="text-base font-semibold lg:text-lg">
              MAC Study
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-center py-6 lg:block lg:py-0">
            <div className="lg:hidden">
              <LoginGreeting />
            </div>

            <h1
              className="mt-6 text-center text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] lg:mt-14 lg:text-left lg:text-[52px]"
              id="login-title"
            >
              <span className="block">Study with your friends.</span>
              <span className="mt-1 block text-[var(--color-mac-yellow)]">
                Track your progress.
              </span>
            </h1>

            <ul className="mt-9 hidden gap-5 lg:grid">
              <FeatureTile
                detail="See your time and consistency"
                icon={Clock3}
                title="Track study time"
              />
              <FeatureTile
                detail="Bring your friends together"
                icon={UsersRound}
                title="Create groups"
              />
              <FeatureTile
                detail="Connect through your units"
                icon={BookOpen}
                title="Find classmates"
              />
            </ul>

            <div className="mt-7 lg:mt-8 lg:max-w-[380px]">
              <h2 className="sr-only">Sign in</h2>
              <LoginForm
                autoComplete={params.signedOut !== "1"}
                nextPath={next}
                returnedFromProvider={params.complete === "1"}
              />
            </div>
          </div>

          <ul className="grid grid-cols-3 gap-2 lg:hidden">
            <CompactTile icon={Clock3} title="Track study time" />
            <CompactTile icon={UsersRound} title="Create groups" />
            <CompactTile icon={BookOpen} title="Find classmates" />
          </ul>
        </div>

        <div className="hidden lg:block">
          <LoginPreview />
        </div>
      </section>
    </main>
  );
}

function CompactTile({
  icon: Icon,
  title,
}: {
  icon: typeof UsersRound;
  title: string;
}) {
  return (
    <li className="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-[rgb(255_255_255/0.08)] bg-[rgb(255_255_255/0.02)] px-2 py-3 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)]">
        <Icon aria-hidden size={17} strokeWidth={2.2} />
      </span>
      <p className="text-xs font-semibold leading-4">{title}</p>
    </li>
  );
}

function FeatureTile({
  detail,
  icon: Icon,
  title,
}: {
  detail: string;
  icon: typeof UsersRound;
  title: string;
}) {
  return (
    <li className="flex items-center gap-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)]">
        <Icon aria-hidden size={18} strokeWidth={2.2} />
      </span>
      <div>
        <p className="text-[15px] font-semibold">{title}</p>
        {/* Desktop only; mobile keeps the list to titles. */}
        <p className="mt-0.5 hidden text-[13px] text-[var(--color-text-muted)] lg:block">
          {detail}
        </p>
      </div>
    </li>
  );
}
