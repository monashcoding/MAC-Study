import { randomUUID } from "node:crypto";
import type { MacClaims } from "./mac-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type MacProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
};

export async function getOrCreateMacProfile(
  claims: MacClaims,
): Promise<MacProfile> {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    throw new Error("Supabase admin access is not configured.");
  }

  const profileFields = "id, display_name, username";
  const { data: existing, error: findError } = await admin
    .from("profiles")
    .select(profileFields)
    .eq("mac_user_id", claims.macUserId)
    .maybeSingle<MacProfile>();

  if (findError) {
    throw findError;
  }

  const now = new Date().toISOString();
  const identityUpdates = {
    mac_email: claims.email,
    mac_roles: claims.roles,
    mac_team: claims.team,
    mac_token_version: claims.ver,
    mac_last_seen_at: now,
  };

  if (existing) {
    const { data, error } = await admin
      .from("profiles")
      .update(identityUpdates)
      .eq("id", existing.id)
      .select(profileFields)
      .single<MacProfile>();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await admin
    .from("profiles")
    .insert({
      id: randomUUID(),
      display_name: claims.name || claims.email.split("@")[0],
      username: null,
      mac_user_id: claims.macUserId,
      ...identityUpdates,
      access_status: "active",
      access_granted_at: now,
      access_granted_source: "mac_central_auth",
      study_icon: "flame-desk",
      profile_color: "#FFE330",
    })
    .select(profileFields)
    .single<MacProfile>();

  if (!error) {
    return data;
  }

  // Two simultaneous first-login requests may race. The unique MAC user ID
  // decides the winner, so load and return that profile instead of failing.
  if (error.code === "23505") {
    const { data: racedProfile, error: racedError } = await admin
      .from("profiles")
      .select(profileFields)
      .eq("mac_user_id", claims.macUserId)
      .single<MacProfile>();

    if (!racedError) {
      return racedProfile;
    }
  }

  throw error;
}
