import Image from "next/image";
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
    <main className="grid h-[var(--app-viewport-height)] min-h-0 place-items-center overflow-hidden bg-[var(--color-background)] px-5 pb-[calc(var(--safe-area-bottom)+1.5rem)] pt-[calc(var(--safe-area-top)+1.5rem)]">
      <section
        aria-labelledby="login-title"
        className="relative -top-[clamp(0rem,4vh,2rem)] w-full max-w-sm"
      >
        <div className="flex flex-col items-center text-center">
          <Image
            alt="MAC Study"
            className="rounded-lg"
            height={64}
            priority
            src="/icons/mac-square.png"
            width={64}
          />
          <h1
            className="mt-4 text-2xl font-semibold tracking-tight"
            id="login-title"
          >
            MAC Study
          </h1>
        </div>

        <div className="mt-9">
          <LoginForm
            autoComplete={params.signedOut !== "1"}
            nextPath={next}
            returnedFromProvider={params.complete === "1"}
          />
        </div>
      </section>
    </main>
  );
}
