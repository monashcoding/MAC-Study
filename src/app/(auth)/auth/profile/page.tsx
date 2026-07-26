import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileIdentityForm } from "@/components/auth/profile-identity-form";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import { getServerStudySession } from "@/lib/auth/server-session";
import { getProfileById, needsProfileSetup } from "@/lib/supabase/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProfileSetupPageProps = {
  searchParams: Promise<{
    edit?: string;
    error?: string;
    name?: string;
    next?: string;
    username?: string;
  }>;
};

export default async function ProfileSetupPage({
  searchParams,
}: ProfileSetupPageProps) {
  const params = await searchParams;
  const isEditing = params.edit === "1";
  const safeNext = getSafeNextPath(params.next);
  const next = safeNext.startsWith("/auth/profile") ? "/app" : safeNext;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(next);
  }

  const session = await getServerStudySession();

  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const profile = await getProfileById(supabase, session.sub);

  if (!isEditing && !needsProfileSetup(profile)) {
    redirect(next);
  }

  const defaultName =
    params.name?.trim() ?? profile?.display_name?.trim() ?? "";
  const defaultUsername =
    params.username?.trim() ?? profile?.username?.trim() ?? "";

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
              {isEditing ? "Edit profile" : "Profile setup"}
            </span>
          </span>
        </Link>

        <section className="rounded-md bg-[rgb(255_255_255/0.035)] p-5">
          <p className="text-sm font-medium text-[var(--color-mac-yellow)]">
            {isEditing ? "Your identity" : "Choose your identity"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {isEditing ? "Edit your profile" : "Set your name and @username"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
            Your name can match someone else. Your username is unique and is how
            friends find the right account.
          </p>

          <ProfileIdentityForm
            defaultName={defaultName}
            defaultUsername={defaultUsername}
            errorText={params.error ? getErrorText(params.error) : null}
            isEditing={isEditing}
            next={next}
            submitLabel={isEditing ? "Save changes" : "Continue"}
            userId={session.sub}
          />
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
