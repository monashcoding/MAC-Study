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
  onDirectMessageUnreadChange,
  onGroupChatUnreadChange,
  resetKeys,
}: {
  activePathname: string;
  authState: AppAuthState;
  fallback: React.ReactNode;
  onDirectMessageUnreadChange: (hasUnread: boolean) => void;
  onGroupChatUnreadChange: (hasUnread: boolean) => void;
  resetKeys: Record<string, number>;
}) {
  const activeView = getWorkspaceView(activePathname);
  const displayName =
    authState.mode === "authenticated"
      ? authState.profile.display_name?.trim() || "Student"
      : "Student";
  const username =
    authState.mode === "authenticated" ? authState.profile.username : null;
  const userId =
    authState.mode === "authenticated" ? authState.profile.id : null;
  const isDiscoverable =
    authState.mode === "authenticated"
      ? authState.profile.is_discoverable
      : true;

  if (!activeView) {
    return fallback;
  }

  return (
    <div
      className={cn(
        "relative",
        activeView === "friends" && "flex min-h-0 flex-1 flex-col",
      )}
    >
      <WorkspacePanel
        active={activeView === "home"}
        id="home"
        key={`home:${resetKeys["/app"] ?? 0}`}
      >
        <TimerDashboard />
      </WorkspacePanel>
      <WorkspacePanel
        active={activeView === "groups"}
        id="groups"
        key={`groups:${resetKeys["/app/groups"] ?? 0}`}
      >
        <GroupsDashboard onUnreadChange={onGroupChatUnreadChange} />
      </WorkspacePanel>
      <WorkspacePanel
        active={activeView === "friends"}
        id="friends"
        key={`friends:${resetKeys["/app/friends"] ?? 0}`}
      >
        <FriendsDashboard onUnreadChange={onDirectMessageUnreadChange} />
      </WorkspacePanel>
      <WorkspacePanel
        active={activeView === "units"}
        id="units"
        key={`units:${resetKeys["/app/units"] ?? 0}`}
      >
        <UnitsDashboard />
      </WorkspacePanel>
      <WorkspacePanel
        active={activeView === "statistics"}
        id="statistics"
        key={`statistics:${resetKeys["/app/statistics"] ?? 0}`}
      >
        <StatisticsDashboard />
      </WorkspacePanel>
      <WorkspacePanel
        active={activeView === "profile"}
        id="profile"
        key={`profile:${resetKeys["/app/profile"] ?? 0}`}
      >
        <ProfileDashboard
          displayName={displayName}
          initialDiscoverable={isDiscoverable}
          userId={userId}
          username={username}
        />
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
