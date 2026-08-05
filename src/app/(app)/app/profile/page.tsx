import { getAppAuthState } from "@/lib/auth/app-auth";
import { ProfileDashboard } from "@/components/profile/profile-dashboard";

export default async function ProfilePage() {
  const authState = await getAppAuthState("/app/profile");
  const profile = authState.mode === "authenticated" ? authState.profile : null;
  const displayName = profile?.display_name?.trim() || "Student";
  return (
    <ProfileDashboard
      displayName={displayName}
      initialDiscoverable={profile?.is_discoverable ?? true}
      userId={profile?.id ?? null}
      username={profile?.username ?? null}
    />
  );
}
