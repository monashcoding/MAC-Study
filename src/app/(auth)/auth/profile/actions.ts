"use server";

import { redirect } from "next/navigation";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import { getServerStudySession } from "@/lib/auth/server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveProfileIdentity(formData: FormData) {
  const isEditing = formData.get("edit") === "1";
  const nextValue = formData.get("next");
  const safeNext = getSafeNextPath(
    typeof nextValue === "string" ? nextValue : undefined,
  );
  const next = safeNext.startsWith("/auth/profile") ? "/app" : safeNext;
  const displayName = `${formData.get("displayName") ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  const username = normalizeUsername(`${formData.get("username") ?? ""}`);

  if (!displayName || !username) {
    redirect(
      getProfileErrorUrl({
        displayName,
        error: "missing",
        isEditing,
        next,
        username,
      }),
    );
  }

  if (displayName.length < 2 || displayName.length > 60) {
    redirect(
      getProfileErrorUrl({
        displayName,
        error: "name",
        isEditing,
        next,
        username,
      }),
    );
  }

  if (username.length < 3 || username.length > 24) {
    redirect(
      getProfileErrorUrl({
        displayName,
        error: "username",
        isEditing,
        next,
        username,
      }),
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(next);
  }

  const session = await getServerStudySession();

  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      username,
    })
    .eq("id", session.sub);

  if (error?.code === "23505") {
    redirect(
      getProfileErrorUrl({
        displayName,
        error: "taken",
        isEditing,
        next,
        username,
      }),
    );
  }

  if (error) {
    redirect(
      getProfileErrorUrl({
        displayName,
        error: "save",
        isEditing,
        next,
        username,
      }),
    );
  }

  redirect(next);
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

function getProfileErrorUrl({
  displayName,
  error,
  isEditing,
  next,
  username,
}: {
  displayName: string;
  error: string;
  isEditing: boolean;
  next: string;
  username: string;
}) {
  const query = new URLSearchParams({
    error,
    name: displayName,
    next,
    username,
  });

  if (isEditing) {
    query.set("edit", "1");
  }

  return `/auth/profile?${query.toString()}`;
}
