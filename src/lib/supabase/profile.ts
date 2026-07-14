import type { SupabaseClient } from "@supabase/supabase-js";

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

export function needsProfileSetup(profile: Profile | null) {
  return !profile?.display_name?.trim() || !profile.username?.trim();
}

export async function getProfileById(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, username, avatar_url, course, study_icon, profile_color, access_status, access_granted_at, created_at, updated_at",
    )
    .eq("id", userId)
    .maybeSingle<Profile>();

  if (error) {
    throw error;
  }

  return data;
}
