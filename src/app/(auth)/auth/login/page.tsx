import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = getSafeNextPath(params.next);

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null } };

    if (data.user) {
      redirect(next);
    }
  }

  return (
    <main className="min-h-dvh bg-[var(--color-background)] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col justify-center">
        <Link className="mac-focus mb-8 inline-flex items-center gap-3 rounded-md" href="/">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] font-semibold text-[#141414]">
            M
          </span>
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
              Use Google or an email magic link. After sign-in, MAC access is
              still gated by invite/admin approval.
            </p>
          </div>

          <LoginForm isConfigured={isSupabaseConfigured()} nextPath={next} />
        </section>
      </div>
    </main>
  );
}

function getSafeNextPath(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/app";
  }

  return next;
}
