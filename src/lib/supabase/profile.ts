import type { AppSupabaseClient as SupabaseClient } from "./types";
import type { Tables } from "./types";

export type AccessStatus = "pending" | "active" | "blocked";

type ProfileColumns = Pick<
  Tables<"profiles">,
  | "access_granted_at"
  | "access_status"
  | "avatar_url"
  | "course"
  | "created_at"
  | "display_name"
  | "id"
  | "is_discoverable"
  | "profile_color"
  | "study_icon"
  | "updated_at"
  | "username"
>;

export type Profile = Omit<ProfileColumns, "access_status"> & {
  access_status: AccessStatus;
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
      "id, display_name, username, avatar_url, course, study_icon, profile_color, is_discoverable, access_status, access_granted_at, created_at, updated_at",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;

  if (!isAccessStatus(data.access_status)) {
    throw new Error(`Unknown profile access status: ${data.access_status}`);
  }

  return { ...data, access_status: data.access_status };
}

function isAccessStatus(value: string): value is AccessStatus {
  return value === "active" || value === "blocked" || value === "pending";
}
