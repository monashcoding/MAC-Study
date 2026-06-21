"use client";

import type { AppAuthState } from "@/lib/auth/app-auth";
import { FriendsDashboard } from "@/components/friends/friends-dashboard";
import { GroupsDashboard } from "@/components/groups/groups-dashboard";
import { ProfileDashboard } from "@/components/profile/profile-dashboard";
import { StatisticsDashboard } from "@/components/statistics/statistics-dashboard";
import { TimerDashboard } from "@/components/timer/timer-dashboard";
import { UnitsDashboard } from "@/components/units/units-dashboard";
import { cn } from "@/lib/utils";

const workspaceViews = [
  { href: "/app", id: "home" },
  { href: "/app/groups", id: "groups" },
  { href: "/app/friends", id: "friends" },
  { href: "/app/units", id: "units" },
  { href: "/app/statistics", id: "statistics" },
  { href: "/app/profile", id: "profile" },
] as const;

type WorkspaceView = (typeof workspaceViews)[number]["id"];

export function AppWorkspace({
  activePathname,
  authState,
  fallback,
}: {
  activePathname: string;
  authState: AppAuthState;
  fallback: React.ReactNode;
}) {
  const activeView = getWorkspaceView(activePathname);
  const displayName =
    authState.mode === "authenticated"
      ? authState.profile.display_name?.trim() || "MAC member"
      : "MAC member";
  const username =
    authState.mode === "authenticated" ? authState.profile.username : null;

  if (!activeView) {
    return fallback;
  }

  return (
    <div className="relative">
      <WorkspacePanel active={activeView === "home"} id="home">
        <TimerDashboard />
      </WorkspacePanel>
      <WorkspacePanel active={activeView === "groups"} id="groups">
        <GroupsDashboard />
      </WorkspacePanel>
      <WorkspacePanel active={activeView === "friends"} id="friends">
        <FriendsDashboard />
      </WorkspacePanel>
      <WorkspacePanel active={activeView === "units"} id="units">
        <UnitsDashboard />
      </WorkspacePanel>
      <WorkspacePanel active={activeView === "statistics"} id="statistics">
        <StatisticsDashboard />
      </WorkspacePanel>
      <WorkspacePanel active={activeView === "profile"} id="profile">
        <ProfileDashboard displayName={displayName} username={username} />
      </WorkspacePanel>
    </div>
  );
}

function WorkspacePanel({
  active,
  children,
  id,
}: {
  active: boolean;
  children: React.ReactNode;
  id: WorkspaceView;
}) {
  return (
    <section
      aria-hidden={!active}
      className={cn(active ? "mac-view-enter block" : "hidden")}
      data-workspace-view={id}
    >
      {children}
    </section>
  );
}

function getWorkspaceView(pathname: string): WorkspaceView | null {
  const match = workspaceViews.find(({ href }) =>
    href === "/app"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`),
  );

  return match?.id ?? null;
}
