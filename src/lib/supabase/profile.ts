import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AccessStatus = "pending" | "active" | "blocked";

export type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  course: string | null;
  study_icon: string;
  profile_color: string;
  access_status: AccessStatus;
  access_granted_at: string | null;
  created_at: string;
  updated_at: string;
};

function getDisplayName(user: User) {
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  return metadataName ?? user.email?.split("@")[0] ?? "MAC member";
}

export function needsProfileSetup(profile: Profile | null) {
  return !profile?.display_name?.trim() || !profile.username?.trim();
}

export async function ensureProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<Profile | null> {
  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select(
      "id, display_name, username, avatar_url, course, study_icon, profile_color, access_status, access_granted_at, created_at, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (fetchError) {
    throw fetchError;
  }

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      display_name: getDisplayName(user),
      avatar_url:
        typeof user.user_metadata?.avatar_url === "string"
          ? user.user_metadata.avatar_url
          : null,
      username: null,
      study_icon: "flame-desk",
      profile_color: "#FFE330",
      access_status: "pending",
    })
    .select(
      "id, display_name, username, avatar_url, course, study_icon, profile_color, access_status, access_granted_at, created_at, updated_at",
    )
    .single<Profile>();

  if (error) {
    throw error;
  }

  return data;
}
