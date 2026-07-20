"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Check,
  CircleStop,
  Globe2,
  Lock,
  LogOut,
  Play,
  Plus,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useAppHeaderDetail } from "@/components/app-header-detail";
import { subjects as defaultSubjects } from "@/lib/demo-data";
import {
  cacheRemoteSocialSnapshot,
  cacheRemoteTimerState,
  getCachedRemoteSocialSnapshot,
  getCachedRemoteTimerState,
} from "@/lib/client-cache";
import {
  PERSON_ICON_KEYS,
  SOCIAL_STORAGE_KEY,
  defaultSocialState,
  getLiveRankingSeconds,
  normalizeSocialState,
  type GroupRole,
  type GroupVisibility,
  type PersonIconKey,
  type RankingWindow,
  type SocialFriend,
  type SocialGroup,
  type SocialState,
} from "@/lib/social-state";
import {
  createRemoteGroup,
  fetchRemoteTimerState,
  fetchRemoteSocialSnapshot,
  inviteRemoteFriendToGroup,
  joinRemotePublicGroup,
  leaveRemoteGroup,
  removeRemoteGroupMember,
  setRemoteGroupMemberRole,
  startRemoteStudySession,
  stopRemoteStudySession,
  subscribeToRemoteAppChanges,
  type RemoteActiveSession,
  type RemoteSubject,
  updateRemoteGroupDetails,
  updateRemoteStudyIcon,
  type RemotePublicGroup,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { NudgePill } from "@/components/social/nudge-pill";
import { useNudgeQueue } from "@/components/social/use-nudge-queue";
import { StartStudyDialog } from "@/components/study/start-study-dialog";
import { formatDuration, isLongSession } from "@/lib/timer";
import { cn } from "@/lib/utils";
import { GroupChat } from "@/components/groups/group-chat";

const rankingWindows = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
] satisfies { id: RankingWindow; label: string }[];

const MEMBER_ACTIVE_COLOR = "#ff7a00";
const MEMBER_INACTIVE_COLOR = "#737b91";
const emptySocialState: SocialState = { friends: [], groups: [] };
const TIMER_STORAGE_KEY = "mac-study-demo-state";
const fallbackStudySubjects = defaultSubjects.map((subject) => ({
  id: subject.id,
  name: subject.code,
  color: subject.color,
})) satisfies RemoteSubject[];

const personIconLabels = {
  "flame-desk": "Flame",
  "clock-desk": "Clock",
  "lamp-desk": "Lamp",
  "spark-desk": "Spark",
} satisfies Record<PersonIconKey, string>;

export function GroupsDashboard() {
  const [socialState, setSocialState] = useState<SocialState>(emptySocialState);
  const [timerSubjects, setTimerSubjects] = useState<RemoteSubject[]>(
    fallbackStudySubjects,
  );
  const [activeStudySession, setActiveStudySession] =
    useState<RemoteActiveSession | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isChoosingStudy, setIsChoosingStudy] = useState(false);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [groupView, setGroupView] = useState<"class" | "rankings" | "chat">(
    "class",
  );
  const [rankingWindow, setRankingWindow] = useState<RankingWindow>("day");
  const [groupName, setGroupName] = useState("");
  const [groupVisibility, setGroupVisibility] =
    useState<GroupVisibility>("private");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [publicGroups, setPublicGroups] = useState<RemotePublicGroup[]>([]);
  const [joiningPublicGroupId, setJoiningPublicGroupId] = useState<
    string | null
  >(null);
  const [publicGroupFeedback, setPublicGroupFeedback] = useState<string | null>(
    null,
  );
  const [remoteClient, setRemoteClient] = useState<SupabaseClient | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const nudgeQueue = useNudgeQueue(Boolean(remoteClient));

  const refreshRemoteSocial = useCallback(async (supabase: SupabaseClient) => {
    const snapshot = await fetchRemoteSocialSnapshot(supabase);

    if (snapshot) {
      cacheRemoteSocialSnapshot(snapshot);
      setCurrentUserId(snapshot.currentUserId);
      setSocialState(snapshot.socialState);
      setPublicGroups(snapshot.publicGroups ?? []);
    }
  }, []);

  const refreshRemoteTimer = useCallback(async (supabase: SupabaseClient) => {
    const timerState = await fetchRemoteTimerState(supabase);

    if (timerState) {
      cacheRemoteTimerState(timerState);
      setTimerSubjects(timerState.subjects);
      setActiveStudySession(timerState.activeSession);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      let supabase: SupabaseClient | null = null;
      const cachedSocial = getCachedRemoteSocialSnapshot();
      const cachedTimer = getCachedRemoteTimerState();

      if (cachedSocial) {
        setCurrentUserId(cachedSocial.currentUserId);
        setSocialState(cachedSocial.socialState);
        setPublicGroups(cachedSocial.publicGroups ?? []);
        setIsLoaded(true);
      }

      if (cachedTimer) {
        setTimerSubjects(cachedTimer.subjects);
        setActiveStudySession(cachedTimer.activeSession);
      }

      try {
        supabase = createSupabaseBrowserClient();
        if (!cancelled) {
          setRemoteClient(supabase);
        }
        const [snapshot, timerState] = await Promise.all([
          fetchRemoteSocialSnapshot(supabase),
          fetchRemoteTimerState(supabase),
        ]);

        if (!cancelled && snapshot) {
          cacheRemoteSocialSnapshot(snapshot);
          setCurrentUserId(snapshot.currentUserId);
          setSocialState(snapshot.socialState);
          setPublicGroups(snapshot.publicGroups ?? []);
          if (timerState) {
            cacheRemoteTimerState(timerState);
            setTimerSubjects(timerState.subjects);
            setActiveStudySession(timerState.activeSession);
          }
          setIsLoaded(true);
          return;
        }
      } catch {
        if (supabase) {
          setRemoteClient(supabase);
          if (!cachedSocial) {
            setSocialState(emptySocialState);
            setIsLoaded(true);
          }
          return;
        }
      }

      if (cachedSocial) {
        return;
      }

      if (!cancelled) {
        const saved = window.localStorage.getItem(SOCIAL_STORAGE_KEY);

        if (saved) {
          try {
            setSocialState(normalizeSocialState(JSON.parse(saved)));
          } catch {
            setSocialState(defaultSocialState);
          }
        } else {
          setSocialState(defaultSocialState);
        }

        const localTimerState = readLocalTimerState();
        setTimerSubjects(normalizeTimerSubjects(localTimerState?.subjects));
        setActiveStudySession(localTimerState?.activeSession ?? null);
        setIsLoaded(true);
      }
    }

    void loadInitialState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || remoteClient) {
      return;
    }

    window.localStorage.setItem(
      SOCIAL_STORAGE_KEY,
      JSON.stringify(socialState),
    );
  }, [isLoaded, remoteClient, socialState]);

  useEffect(() => {
    if (!remoteClient) {
      return;
    }

    return subscribeToRemoteAppChanges(remoteClient, () => {
      void refreshRemoteSocial(remoteClient);
      void refreshRemoteTimer(remoteClient);
    });
  }, [refreshRemoteSocial, refreshRemoteTimer, remoteClient]);

  const selectedGroup = socialState.groups.find(
    (group) => group.id === selectedGroupId,
  );
  useAppHeaderDetail(selectedGroup?.name ?? null);
  const friendsById = useMemo(
    () => new Map(socialState.friends.map((friend) => [friend.id, friend])),
    [socialState.friends],
  );
  const groupSummaries = socialState.groups.map((group) => {
    const members = getGroupMembers(group, friendsById);
    const activeNow = members.filter((member) => member.studying).length;

    return {
      group,
      activeNow,
      memberCount: members.length,
    };
  });
  const activeTotal = groupSummaries.reduce(
    (total, group) => total + group.activeNow,
    0,
  );
  const uniqueMemberCount = new Set(
    socialState.groups.flatMap((group) => group.memberIds),
  ).size;

  async function createGroup() {
    const name = groupName.trim();
    const invitedMemberIds = selectedMembers.filter(
      (memberId) => memberId !== "you" && memberId !== currentUserId,
    );

    if (!name) {
      return;
    }

    if (remoteClient) {
      const newGroupId = await createRemoteGroup({
        name,
        supabase: remoteClient,
        visibility: groupVisibility,
      });

      if (newGroupId) {
        await Promise.all(
          invitedMemberIds.map((friendId) =>
            inviteRemoteFriendToGroup({
              friendId,
              groupId: newGroupId,
              supabase: remoteClient,
            }),
          ),
        );
        setSelectedGroupId(newGroupId);
      }

      setGroupName("");
      setGroupVisibility("private");
      setSelectedMembers([]);
      setIsCreating(false);
      await refreshRemoteSocial(remoteClient);
      return;
    }

    const newGroup: SocialGroup = {
      id: `group-${crypto.randomUUID()}`,
      name,
      icon: "users",
      memberIds: uniqueIds(["you", ...invitedMemberIds]),
      memberRoles: Object.fromEntries(
        uniqueIds(["you", ...invitedMemberIds]).map((id) => [
          id,
          id === "you" ? "owner" : "member",
        ]),
      ),
      currentUserRole: "owner",
      visibility: groupVisibility,
    };

    setSocialState((current) => ({
      ...current,
      groups: [newGroup, ...current.groups],
    }));
    setSelectedGroupId(newGroup.id);
    setGroupName("");
    setGroupVisibility("private");
    setSelectedMembers([]);
    setIsCreating(false);
  }

  function toggleMember(friendId: string) {
    setSelectedMembers((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId],
    );
  }

  async function updateGroupDetails(name: string, visibility: GroupVisibility) {
    if (!selectedGroup) return;

    if (remoteClient) {
      await updateRemoteGroupDetails({
        groupId: selectedGroup.id,
        name,
        supabase: remoteClient,
        visibility,
      });
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroup.id ? { ...group, name, visibility } : group,
      ),
    }));
  }

  async function inviteGroupMember(friendId: string) {
    if (!selectedGroup) return;

    if (remoteClient) {
      await inviteRemoteFriendToGroup({
        friendId,
        groupId: selectedGroup.id,
        supabase: remoteClient,
      });
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroup.id
          ? {
              ...group,
              memberIds: uniqueIds([...group.memberIds, friendId]),
              memberRoles: { ...group.memberRoles, [friendId]: "member" },
            }
          : group,
      ),
    }));
  }

  async function removeGroupMember(userId: string) {
    if (!selectedGroup) return;

    if (remoteClient) {
      await removeRemoteGroupMember({
        groupId: selectedGroup.id,
        supabase: remoteClient,
        userId,
      });
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) => {
        if (group.id !== selectedGroup.id) return group;
        const memberRoles = { ...group.memberRoles };
        delete memberRoles[userId];
        return {
          ...group,
          memberIds: group.memberIds.filter((id) => id !== userId),
          memberRoles,
        };
      }),
    }));
  }

  async function updateGroupMemberRole(
    userId: string,
    role: Exclude<GroupRole, "owner">,
  ) {
    if (!selectedGroup) return;

    if (remoteClient) {
      await setRemoteGroupMemberRole({
        groupId: selectedGroup.id,
        role,
        supabase: remoteClient,
        userId,
      });
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroup.id
          ? {
              ...group,
              memberRoles: { ...group.memberRoles, [userId]: role },
            }
          : group,
      ),
    }));
  }

  async function leaveGroup() {
    if (!selectedGroup) return;

    if (remoteClient) {
      await leaveRemoteGroup({
        groupId: selectedGroup.id,
        supabase: remoteClient,
      });
      setSelectedGroupId(null);
      setIsGroupSettingsOpen(false);
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== selectedGroup.id),
    }));
    setSelectedGroupId(null);
    setIsGroupSettingsOpen(false);
  }

  async function joinPublicGroup(groupId: string) {
    if (!remoteClient) return;
    setJoiningPublicGroupId(groupId);
    setPublicGroupFeedback(null);
    try {
      await joinRemotePublicGroup({ groupId, supabase: remoteClient });
      await refreshRemoteSocial(remoteClient);
      setSelectedGroupId(groupId);
    } catch {
      setPublicGroupFeedback("That public group could not be joined.");
    } finally {
      setJoiningPublicGroupId(null);
    }
  }

  async function startGroupStudy(subjectId: string | null) {
    if (!selectedGroup || activeStudySession) {
      setIsChoosingStudy(false);
      return;
    }

    if (remoteClient) {
      try {
        await startRemoteStudySession({
          groupId: selectedGroup.id,
          subjectId,
          supabase: remoteClient,
        });
      } finally {
        setIsChoosingStudy(false);
        await Promise.all([
          refreshRemoteTimer(remoteClient),
          refreshRemoteSocial(remoteClient),
        ]);
      }

      return;
    }

    const nextSession = {
      groupId: selectedGroup.id,
      subjectId,
      startedAt: new Date().toISOString(),
    };
    const currentTimerState = readLocalTimerState();

    writeLocalTimerState({
      ...currentTimerState,
      activeSession: nextSession,
      subjects: timerSubjects,
    });
    setActiveStudySession(nextSession);
    setIsChoosingStudy(false);
  }

  async function stopGroupStudy() {
    if (!activeStudySession) {
      return;
    }

    if (remoteClient) {
      try {
        await stopRemoteStudySession(remoteClient);
      } finally {
        await Promise.all([
          refreshRemoteTimer(remoteClient),
          refreshRemoteSocial(remoteClient),
        ]);
      }

      return;
    }

    const endedAt = new Date();
    const currentTimerState = readLocalTimerState();

    writeLocalTimerState({
      ...currentTimerState,
      activeSession: null,
      sessions: [
        {
          id: crypto.randomUUID(),
          groupId: activeStudySession.groupId ?? null,
          subjectId: activeStudySession.subjectId,
          startedAt: activeStudySession.startedAt,
          endedAt: endedAt.toISOString(),
          status: isLongSession(activeStudySession.startedAt, endedAt)
            ? "needs_confirmation"
            : "completed",
          source: "timer",
        },
        ...(currentTimerState?.sessions ?? []),
      ],
      subjects: timerSubjects,
    });
    setActiveStudySession(null);
  }

  async function updateFriendIcon(friendId: string, personIcon: PersonIconKey) {
    if (remoteClient) {
      await updateRemoteStudyIcon({
        icon: personIcon,
        supabase: remoteClient,
        userId: friendId,
      });
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      friends: current.friends.map((friend) =>
        friend.id === friendId ? { ...friend, personIcon } : friend,
      ),
    }));
  }

  function nudgeMember(memberId: string, groupId: string) {
    nudgeQueue.enqueue({
      groupId,
      key: `${groupId}:${memberId}`,
      recipientId: memberId,
    });
  }

  if (selectedGroup) {
    const members = getGroupMembers(selectedGroup, friendsById).sort(
      (first, second) =>
        getLiveRankingSeconds(second, "day", now) -
        getLiveRankingSeconds(first, "day", now),
    );
    const activeNow = members.filter((member) => member.studying).length;
    const ranking = [...members].sort(
      (first, second) =>
        getLiveRankingSeconds(second, rankingWindow, now) -
        getLiveRankingSeconds(first, rankingWindow, now),
    );
    const activeInSelectedGroup =
      activeStudySession?.groupId === selectedGroup.id;
    const isStudyingElsewhere = Boolean(
      activeStudySession && !activeInSelectedGroup,
    );
    const selectedMember =
      members.find((member) => member.id === selectedMemberId) ?? null;
    const selectedMemberNudgeState = selectedMember
      ? nudgeQueue.getState(`${selectedGroup.id}:${selectedMember.id}`)
      : null;

    return (
      <div className="space-y-4 pb-24 pt-1 lg:space-y-5 lg:pb-0 lg:pt-0">
        <section className="space-y-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              aria-label="Back to groups"
              className="mac-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.045)] hover:text-[var(--color-text)]"
              onClick={() => {
                setSelectedGroupId(null);
                setSelectedMemberId(null);
                setGroupView("class");
              }}
              type="button"
            >
              <ArrowLeft aria-hidden size={19} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] sm:text-sm">
              <span className="shrink-0">
                <span className="text-[#ff7a00]">{activeNow}</span> active
              </span>
              <span aria-hidden>·</span>
              <span className="shrink-0">{members.length} members</span>
              <VisibilityBadge visibility={selectedGroup.visibility} />
            </div>
            <button
              aria-label="Group settings"
              className="mac-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(255_255_255/0.045)] text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.08)]"
              onClick={() => setIsGroupSettingsOpen(true)}
              type="button"
            >
              <Settings aria-hidden size={18} />
            </button>
          </div>

          <div className="grid grid-cols-3 rounded-xl bg-[rgb(255_255_255/0.04)] p-1 lg:max-w-lg">
            {[
              { id: "class", label: "Class view" },
              { id: "rankings", label: "Rankings" },
              { id: "chat", label: "Chat" },
            ].map((view) => (
              <button
                className={cn(
                  "mac-focus h-11 rounded-lg text-sm font-semibold transition",
                  groupView === view.id
                    ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                    : "text-[var(--color-text-muted)]",
                )}
                key={view.id}
                onClick={() =>
                  setGroupView(view.id as "class" | "rankings" | "chat")
                }
                type="button"
              >
                {view.label}
              </button>
            ))}
          </div>

          {groupView === "rankings" ? (
            <div className="grid grid-cols-3 rounded-md bg-[rgb(255_255_255/0.035)] p-1 lg:max-w-md">
              {rankingWindows.map((window) => (
                <button
                  className={cn(
                    "mac-focus h-9 rounded px-3 text-xs font-semibold transition",
                    rankingWindow === window.id
                      ? "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)]",
                  )}
                  key={window.id}
                  onClick={() => setRankingWindow(window.id)}
                  type="button"
                >
                  {window.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {groupView === "class" ? (
          <section>
            <div className="grid grid-cols-3 gap-2 py-1 sm:grid-cols-4 lg:grid-cols-6 lg:gap-3">
              {members.map((member) => (
                <button
                  className={cn(
                    "mac-focus min-w-0 rounded-xl border px-2 py-3 text-center transition hover:bg-[rgb(255_255_255/0.045)] active:scale-[0.98]",
                    member.studying
                      ? "border-[rgb(255_122_0/0.18)] bg-[rgb(255_122_0/0.045)] text-[#ff7a00]"
                      : "border-[rgb(255_255_255/0.045)] bg-[rgb(255_255_255/0.018)] text-[var(--color-text-muted)]",
                  )}
                  key={member.id}
                  onClick={() => {
                    setSelectedMemberId(member.id);
                  }}
                  type="button"
                >
                  <StudyPersonIcon
                    active={member.studying}
                    icon={member.personIcon}
                  />
                  <p
                    className={cn(
                      "mt-2 truncate text-sm font-semibold",
                      member.studying
                        ? "text-[var(--color-text)]"
                        : "text-[var(--color-text-muted)]",
                    )}
                    title={member.handle}
                  >
                    {member.handle}
                  </p>
                  <p className="mt-1 font-mono text-xs font-semibold tabular-nums text-[var(--color-text-muted)]">
                    {formatDuration(getLiveRankingSeconds(member, "day", now))}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {groupView === "chat" ? (
          <GroupChat
            currentUserId={currentUserId}
            groupId={selectedGroup.id}
            key={selectedGroup.id}
            members={members}
            remoteClient={remoteClient}
          />
        ) : null}

        {selectedMember ? (
          <GroupMemberDialog
            canNudge={
              selectedMember.id !== (currentUserId ?? "you") &&
              selectedMember.id !== "you"
            }
            group={selectedGroup}
            member={selectedMember}
            nudgeFeedback={selectedMemberNudgeState?.feedback ?? null}
            now={now}
            onClose={() => {
              setSelectedMemberId(null);
            }}
            onNudge={() => nudgeMember(selectedMember.id, selectedGroup.id)}
            pendingNudges={selectedMemberNudgeState?.pending ?? 0}
          />
        ) : null}

        {isGroupSettingsOpen ? (
          <GroupSettingsDialog
            allFriends={socialState.friends}
            currentUserId={currentUserId ?? "you"}
            members={members}
            onClose={() => setIsGroupSettingsOpen(false)}
            onGroupDetailsUpdate={updateGroupDetails}
            onInvite={inviteGroupMember}
            onLeave={leaveGroup}
            onMemberRemove={removeGroupMember}
            onMemberRoleUpdate={updateGroupMemberRole}
            selectedGroup={selectedGroup}
            remoteCurrentUserId={remoteClient ? currentUserId : null}
            onUpdate={updateFriendIcon}
          />
        ) : null}

        {isChoosingStudy ? (
          <StartStudyDialog
            onClose={() => setIsChoosingStudy(false)}
            onStart={(subjectId) => void startGroupStudy(subjectId)}
            subjects={timerSubjects}
            title={`Study in ${selectedGroup.name}`}
          />
        ) : null}

        {groupView === "rankings" ? (
          <section className="space-y-3">
            <div className="grid gap-2 lg:grid-cols-2 lg:gap-3">
              {ranking.map((member, index) => (
                <button
                  className="mac-focus grid min-h-14 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-2.5 text-left transition active:scale-[0.99]"
                  key={member.id}
                  onClick={() => {
                    setSelectedMemberId(member.id);
                  }}
                  type="button"
                >
                  <span className="font-mono text-sm font-semibold text-[var(--color-text-muted)]">
                    #{index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{member.name}</p>
                    <p className="truncate text-xs font-medium text-[var(--color-text-muted)]">
                      {member.handle}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatDuration(
                      getLiveRankingSeconds(member, rankingWindow, now),
                    )}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {groupView !== "chat" ? (
          <div className="fixed inset-x-4 bottom-[calc(var(--mobile-nav-height)+0.75rem)] z-20 mx-auto max-w-lg lg:static lg:inset-x-auto lg:max-w-none lg:pt-2">
            <button
              className={cn(
                "mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold shadow-[0_16px_34px_rgb(0_0_0/0.32)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55",
                activeInSelectedGroup
                  ? "bg-[var(--color-danger)] text-white"
                  : "bg-[var(--color-mac-yellow)] text-[#141414]",
              )}
              disabled={isStudyingElsewhere}
              onClick={() =>
                void (activeInSelectedGroup
                  ? stopGroupStudy()
                  : setIsChoosingStudy(true))
              }
              type="button"
            >
              {activeInSelectedGroup ? (
                <CircleStop aria-hidden size={18} />
              ) : (
                <Play aria-hidden size={18} />
              )}
              {activeInSelectedGroup
                ? "Stop study"
                : isStudyingElsewhere
                  ? "Studying in another session"
                  : "Start study"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1 lg:space-y-6 lg:pt-0">
      <section className="grid grid-cols-3 gap-2 lg:gap-4">
        <SummaryStat label="Groups" value={`${socialState.groups.length}`} />
        <SummaryStat label="Active" value={`${activeTotal}`} />
        <SummaryStat label="Members" value={`${uniqueMemberCount}`} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            {socialState.groups.length
              ? `${socialState.groups.length} ${socialState.groups.length === 1 ? "group" : "groups"}`
              : "Create a group to study together"}
          </p>
          <button
            className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414]"
            onClick={() => setIsCreating(true)}
            type="button"
          >
            <Plus aria-hidden size={17} />
            Create
          </button>
        </div>

        <div className="grid gap-2 lg:grid-cols-2 lg:gap-3">
          {groupSummaries.map(({ group, activeNow, memberCount }) => (
            <button
              className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-transparent bg-[rgb(255_255_255/0.035)] px-3 py-3 text-left transition hover:border-[rgb(255_255_255/0.1)] hover:bg-[rgb(255_255_255/0.05)] active:scale-[0.99] lg:min-h-20 lg:px-4"
              key={group.id}
              onClick={() => {
                setGroupView("class");
                setSelectedGroupId(group.id);
              }}
              type="button"
            >
              <GroupIconBadge />
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold">{group.name}</h3>
                <div className="mt-1 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                  <span>{activeNow} active</span>
                  <span aria-hidden>·</span>
                  <span>
                    {group.visibility === "public" ? "Public" : "Private"}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold tabular-nums">
                  {memberCount}
                </p>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  members
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {publicGroups.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Public groups</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Open groups you can join immediately.
            </p>
          </div>
          {publicGroupFeedback ? (
            <p className="text-sm text-[var(--color-danger)]" role="status">
              {publicGroupFeedback}
            </p>
          ) : null}
          <div className="grid gap-2 lg:grid-cols-2 lg:gap-3">
            {publicGroups.map((group) => (
              <div
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] p-3"
                key={group.id}
              >
                <GroupIconBadge />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{group.name}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {group.memberCount}{" "}
                    {group.memberCount === 1 ? "member" : "members"}
                  </p>
                </div>
                <button
                  className="mac-focus h-9 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414] disabled:opacity-45"
                  disabled={joiningPublicGroupId === group.id}
                  onClick={() => void joinPublicGroup(group.id)}
                  type="button"
                >
                  {joiningPublicGroupId === group.id ? "Joining…" : "Join"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isCreating ? (
        <CreateGroupDialog
          groupName={groupName}
          groupVisibility={groupVisibility}
          onClose={() => setIsCreating(false)}
          onCreate={createGroup}
          onMemberToggle={toggleMember}
          onNameChange={setGroupName}
          onVisibilityChange={setGroupVisibility}
          currentUserId={currentUserId}
          selectedMembers={selectedMembers}
          socialState={socialState}
        />
      ) : null}
    </div>
  );
}

function CreateGroupDialog({
  groupName,
  groupVisibility,
  onClose,
  onCreate,
  onMemberToggle,
  onNameChange,
  onVisibilityChange,
  currentUserId,
  selectedMembers,
  socialState,
}: {
  groupName: string;
  groupVisibility: GroupVisibility;
  onClose: () => void;
  onCreate: () => void | Promise<void>;
  onMemberToggle: (friendId: string) => void;
  onNameChange: (name: string) => void;
  onVisibilityChange: (visibility: GroupVisibility) => void;
  currentUserId: string | null;
  selectedMembers: string[];
  socialState: SocialState;
}) {
  const inviteableFriends = socialState.friends.filter(
    (friend) =>
      friend.id !== "you" &&
      friend.id !== currentUserId &&
      friend.isFriend !== false,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submitGroup() {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await onCreate();
    } catch (error) {
      setFeedback(getErrorMessage(error, "The group could not be created."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-x-0 top-0 z-50 flex h-[var(--app-viewport-height)] items-center justify-center bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm"
      role="dialog"
    >
      <div className="max-h-[min(88dvh,680px)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[var(--color-background)] p-4">
          <h2 className="text-lg font-semibold">Create group</h2>
          <button
            className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="space-y-5 p-4">
          <label className="block text-sm font-medium">
            Name
            <input
              className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Study group"
              value={groupName}
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium">Privacy</legend>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  {
                    description: "Anyone can find and join it.",
                    icon: Globe2,
                    label: "Public",
                    value: "public",
                  },
                  {
                    description: "Only invited people can join.",
                    icon: Lock,
                    label: "Private",
                    value: "private",
                  },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const selected = groupVisibility === option.value;

                return (
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "mac-focus rounded-md border p-3 text-left transition",
                      selected
                        ? "border-[var(--color-mac-yellow)] bg-[rgb(255_227_48/0.08)]"
                        : "border-[var(--color-border)]",
                    )}
                    key={option.value}
                    onClick={() => onVisibilityChange(option.value)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Icon aria-hidden size={16} /> {option.label}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <p className="text-sm font-medium">Members</p>
            <div className="mt-3 grid gap-2">
              {inviteableFriends.map((friend) => {
                const selected = selectedMembers.includes(friend.id);

                return (
                  <button
                    className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3 text-left"
                    key={friend.id}
                    onClick={() => onMemberToggle(friend.id)}
                    type="button"
                  >
                    <ProfileBadge friend={friend} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{friend.name}</p>
                      <p className="truncate text-sm text-[var(--color-text-muted)]">
                        {friend.handle}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-full border",
                        selected
                          ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)] text-[#141414]"
                          : "border-[var(--color-border)]",
                      )}
                    >
                      {selected ? <Check aria-hidden size={15} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {feedback ? (
            <p className="text-sm text-[var(--color-danger)]" role="status">
              {feedback}
            </p>
          ) : null}
        </div>

        <div className="sticky bottom-0 bg-[var(--color-background)] p-4">
          <button
            className="mac-focus inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414] disabled:opacity-45"
            disabled={!groupName.trim() || isSubmitting}
            onClick={() => void submitGroup()}
            type="button"
          >
            {isSubmitting ? "Creating…" : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgb(255_255_255/0.055)] bg-[linear-gradient(145deg,rgb(255_255_255/0.045),rgb(255_255_255/0.018))] px-3 py-3 text-center lg:px-4 lg:py-4">
      <p className="text-xl font-semibold tabular-nums lg:text-2xl">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function GroupIconBadge() {
  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
      <Users aria-hidden size={20} />
    </span>
  );
}

function VisibilityBadge({ visibility }: { visibility: GroupVisibility }) {
  const Icon = visibility === "public" ? Globe2 : Lock;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgb(255_255_255/0.06)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
      title={visibility === "public" ? "Public group" : "Private group"}
    >
      <Icon aria-hidden size={11} />
      {visibility}
    </span>
  );
}

function ProfileBadge({ friend }: { friend: SocialFriend }) {
  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[#141414]",
        friend.studying
          ? "ring-2 ring-[var(--color-success)] ring-offset-2 ring-offset-[var(--color-background)]"
          : "grayscale",
      )}
      style={{ backgroundColor: friend.color }}
    >
      {friend.initials}
    </span>
  );
}

function GroupMemberDialog({
  canNudge,
  group,
  member,
  now,
  nudgeFeedback,
  onClose,
  onNudge,
  pendingNudges,
}: {
  canNudge: boolean;
  group: SocialGroup;
  member: SocialFriend;
  now: Date;
  nudgeFeedback: string | null;
  onClose: () => void;
  onNudge: () => void;
  pendingNudges: number;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-x-0 top-0 z-50 flex h-[var(--app-viewport-height)] items-center justify-center bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm"
      role="dialog"
    >
      <div className="max-h-[calc(var(--app-viewport-height)-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ProfileBadge friend={member} />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{member.name}</h2>
              <p className="truncate text-sm text-[var(--color-text-muted)]">
                {member.handle}
              </p>
            </div>
          </div>
          <button
            className="mac-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={17} />
            <span className="sr-only">Close member details</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <NudgePill
            disabled={!canNudge}
            onClick={onNudge}
            pendingCount={pendingNudges}
          />
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {nudgeFeedback ??
              (canNudge
                ? `Send from ${group.name}`
                : "You cannot nudge yourself.")}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MemberStat
            label="Today"
            value={formatDuration(getLiveRankingSeconds(member, "day", now))}
          />
          <MemberStat
            label="Week"
            value={formatDuration(getLiveRankingSeconds(member, "week", now))}
          />
          <MemberStat
            label="Month"
            value={formatDuration(getLiveRankingSeconds(member, "month", now))}
          />
        </div>
      </div>
    </div>
  );
}

function MemberStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[rgb(255_255_255/0.035)] px-2 py-2.5 text-center">
      <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function GroupSettingsDialog({
  allFriends,
  currentUserId,
  members,
  onClose,
  onGroupDetailsUpdate,
  onInvite,
  onLeave,
  onMemberRemove,
  onMemberRoleUpdate,
  onUpdate,
  remoteCurrentUserId,
  selectedGroup,
}: {
  allFriends: SocialFriend[];
  currentUserId: string;
  members: SocialFriend[];
  onClose: () => void;
  onGroupDetailsUpdate: (
    name: string,
    visibility: GroupVisibility,
  ) => void | Promise<void>;
  onInvite: (friendId: string) => void | Promise<void>;
  onLeave: () => void | Promise<void>;
  onMemberRemove: (userId: string) => void | Promise<void>;
  onMemberRoleUpdate: (
    userId: string,
    role: Exclude<GroupRole, "owner">,
  ) => void | Promise<void>;
  onUpdate: (friendId: string, icon: PersonIconKey) => void | Promise<void>;
  remoteCurrentUserId: string | null;
  selectedGroup: SocialGroup;
}) {
  const [name, setName] = useState(selectedGroup.name);
  const [visibility, setVisibility] = useState<GroupVisibility>(
    selectedGroup.visibility ?? "private",
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const currentRole =
    selectedGroup.currentUserRole ??
    selectedGroup.memberRoles?.[currentUserId] ??
    "member";
  const isLeader = currentRole === "owner";
  const canManageMembers = isLeader || currentRole === "admin";
  const inviteableFriends = allFriends.filter(
    (friend) =>
      friend.id !== currentUserId &&
      friend.id !== "you" &&
      friend.isFriend !== false &&
      !selectedGroup.memberIds.includes(friend.id),
  );
  const editableMembers = remoteCurrentUserId
    ? members.filter((member) => member.id === remoteCurrentUserId)
    : members.filter(
        (member) => member.id === currentUserId || member.id === "you",
      );

  async function runAction(
    key: string,
    action: () => void | Promise<void>,
    success: string,
  ) {
    setBusyKey(key);
    setFeedback(null);
    try {
      await action();
      setFeedback(success);
    } catch (error) {
      setFeedback(getErrorMessage(error, "That change could not be saved."));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-x-0 top-0 z-50 flex h-[var(--app-viewport-height)] items-center justify-center bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm"
      role="dialog"
    >
      <div className="max-h-[min(88dvh,680px)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[var(--color-background)] p-4">
          <h2 className="text-lg font-semibold">Group settings</h2>
          <button
            className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="grid gap-5 p-4">
          {feedback ? (
            <p
              className="rounded-md bg-[rgb(255_255_255/0.045)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
              role="status"
            >
              {feedback}
            </p>
          ) : null}

          <section className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Group details</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {isLeader
                  ? "As group leader, you control the name and privacy."
                  : "Only the group leader can change these settings."}
              </p>
            </div>
            <label className="block text-sm font-medium">
              Name
              <input
                className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 disabled:opacity-60"
                disabled={!isLeader}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["public", "private"] as const).map((option) => {
                const Icon = option === "public" ? Globe2 : Lock;
                return (
                  <button
                    className={cn(
                      "mac-focus flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-semibold capitalize disabled:opacity-60",
                      visibility === option
                        ? "border-[var(--color-mac-yellow)] bg-[rgb(255_227_48/0.08)]"
                        : "border-[var(--color-border)]",
                    )}
                    disabled={!isLeader}
                    key={option}
                    onClick={() => setVisibility(option)}
                    type="button"
                  >
                    <Icon aria-hidden size={15} /> {option}
                  </button>
                );
              })}
            </div>
            {isLeader ? (
              <button
                className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] disabled:opacity-45"
                disabled={!name.trim() || busyKey !== null}
                onClick={() =>
                  void runAction(
                    "details",
                    () => onGroupDetailsUpdate(name.trim(), visibility),
                    "Group details updated.",
                  )
                }
                type="button"
              >
                Save details
              </button>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-[var(--color-border)] pt-5">
            <div>
              <p className="text-sm font-semibold">Members</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Leaders and moderators can invite people and remove regular
                members.
              </p>
            </div>
            <div className="grid gap-2">
              {members.map((member) => {
                const role = selectedGroup.memberRoles?.[member.id] ?? "member";
                const canRemove =
                  member.id !== currentUserId &&
                  role !== "owner" &&
                  (isLeader || (currentRole === "admin" && role === "member"));

                return (
                  <div
                    className="rounded-md bg-[rgb(255_255_255/0.035)] p-3"
                    key={member.id}
                  >
                    <div className="flex items-center gap-3">
                      <ProfileBadge friend={member} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {member.name}
                          {member.id === currentUserId ? " (You)" : ""}
                        </p>
                        <p className="truncate text-sm text-[var(--color-text-muted)]">
                          {member.handle}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                          {role === "owner"
                            ? "Group leader"
                            : role === "admin"
                              ? "Moderator"
                              : "Member"}
                        </p>
                      </div>
                    </div>
                    {isLeader && role !== "owner" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="mac-focus h-9 rounded-md border border-[var(--color-border)] px-3 text-xs font-semibold disabled:opacity-45"
                          disabled={busyKey !== null}
                          onClick={() =>
                            void runAction(
                              `role:${member.id}`,
                              () =>
                                onMemberRoleUpdate(
                                  member.id,
                                  role === "admin" ? "member" : "admin",
                                ),
                              role === "admin"
                                ? "Moderator removed."
                                : "Moderator promoted.",
                            )
                          }
                          type="button"
                        >
                          {role === "admin"
                            ? "Make member"
                            : "Promote moderator"}
                        </button>
                        {canRemove ? (
                          <button
                            className="mac-focus h-9 rounded-md border border-[var(--color-danger)] px-3 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-45"
                            disabled={busyKey !== null}
                            onClick={() =>
                              void runAction(
                                `remove:${member.id}`,
                                () => onMemberRemove(member.id),
                                "Member removed.",
                              )
                            }
                            type="button"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ) : canRemove ? (
                      <button
                        className="mac-focus mt-3 h-9 rounded-md border border-[var(--color-danger)] px-3 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-45"
                        disabled={busyKey !== null}
                        onClick={() =>
                          void runAction(
                            `remove:${member.id}`,
                            () => onMemberRemove(member.id),
                            "Member removed.",
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {canManageMembers && inviteableFriends.length ? (
            <section className="space-y-3 border-t border-[var(--color-border)] pt-5">
              <p className="text-sm font-semibold">Invite friends</p>
              <div className="grid gap-2">
                {inviteableFriends.map((friend) => (
                  <div
                    className="flex items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] p-3"
                    key={friend.id}
                  >
                    <ProfileBadge friend={friend} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{friend.name}</p>
                      <p className="truncate text-sm text-[var(--color-text-muted)]">
                        {friend.handle}
                      </p>
                    </div>
                    <button
                      className="mac-focus h-9 rounded-md bg-[var(--color-mac-yellow)] px-3 text-xs font-semibold text-[#141414] disabled:opacity-45"
                      disabled={busyKey !== null}
                      onClick={() =>
                        void runAction(
                          `invite:${friend.id}`,
                          () => onInvite(friend.id),
                          "Member invited.",
                        )
                      }
                      type="button"
                    >
                      Invite
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div>
              <p className="text-sm font-semibold">
                {remoteCurrentUserId ? "My class icon" : "Member icons"}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Choose how you appear in class view.
              </p>
            </div>
            {editableMembers.map((member) => (
              <div
                className="space-y-3 rounded-md bg-[rgb(255_255_255/0.035)] p-3"
                key={member.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {member.name}
                      {member.id === currentUserId ? " (You)" : ""}
                    </p>
                    <p className="truncate text-sm text-[var(--color-text-muted)]">
                      {member.handle}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
                    {formatDuration(member.daySeconds)}
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {PERSON_ICON_KEYS.map((icon) => {
                    const selected = member.personIcon === icon;

                    return (
                      <button
                        aria-label={`Use ${personIconLabels[icon]} icon for ${member.name}`}
                        className={cn(
                          "mac-focus flex h-20 items-center justify-center rounded-md border transition",
                          selected
                            ? "border-[var(--color-mac-yellow)] bg-[rgb(255_227_48/0.1)]"
                            : "border-[var(--color-border)]",
                        )}
                        key={icon}
                        onClick={() => void onUpdate(member.id, icon)}
                        type="button"
                      >
                        <StudyPersonIcon active={member.studying} icon={icon} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="border-t border-[var(--color-border)] pt-5">
            {isLeader ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Group leaders cannot leave or delete the group. This keeps
                shared study history intact.
              </p>
            ) : (
              <button
                className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--color-danger)] px-4 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-45"
                disabled={busyKey !== null}
                onClick={() =>
                  void runAction("leave", onLeave, "You left the group.")
                }
                type="button"
              >
                <LogOut aria-hidden size={16} /> Leave group
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StudyPersonIcon({
  active,
  icon,
}: {
  active: boolean;
  icon: PersonIconKey;
}) {
  const color = active ? MEMBER_ACTIVE_COLOR : MEMBER_INACTIVE_COLOR;

  return (
    <svg
      aria-hidden
      className="mx-auto h-14 w-14 sm:h-16 sm:w-16"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3.2"
      viewBox="0 0 72 72"
    >
      <PersonIconAccent icon={icon} />
      <circle cx="32" cy="25" r="7.5" />
      <path d="M18 53c0-10 6-17 14-17s14 7 14 17" />
      <path d="M12 56h40M17 64V49h31v15" />
      <path d="M52 37h10l3 19H50l2-19Z" />
      <path d="M56 37V28h8" />
    </svg>
  );
}

function PersonIconAccent({ icon }: { icon: PersonIconKey }) {
  if (icon === "clock-desk") {
    return (
      <>
        <circle cx="18" cy="14" r="7" />
        <path d="M18 10v5l4 2" />
      </>
    );
  }

  if (icon === "lamp-desk") {
    return (
      <>
        <path d="M20 13h15" />
        <path d="M23 13 20 23h18l-3-10" />
      </>
    );
  }

  if (icon === "spark-desk") {
    return (
      <>
        <path d="M19 12h.1M24 7h.1M27 15h.1" />
        <path d="M21 21c4-4 8-4 12 0" />
      </>
    );
  }

  return (
    <>
      <path d="M31 6c5 5 1 9 6 13" />
      <path d="M25 10c4 4 1 7 5 10" />
      <path d="M40 10c-3 4-1 7-5 10" />
    </>
  );
}

function getGroupMembers(
  group: SocialGroup,
  friendsById: Map<string, SocialFriend>,
) {
  return group.memberIds
    .map((friendId) => friendsById.get(friendId))
    .filter((friend): friend is SocialFriend => Boolean(friend));
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

type LocalTimerState = {
  activeSession?: RemoteActiveSession | null;
  sessions?: {
    id: string;
    subjectId: string | null;
    groupId?: string | null;
    startedAt: string;
    endedAt: string;
    status: "completed" | "needs_confirmation";
    source: "timer";
  }[];
  subjects?: Partial<RemoteSubject>[];
};

function readLocalTimerState(): LocalTimerState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem(TIMER_STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as LocalTimerState;
  } catch {
    return null;
  }
}

function writeLocalTimerState(state: LocalTimerState) {
  window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
}

function normalizeTimerSubjects(value: LocalTimerState["subjects"]) {
  if (!Array.isArray(value) || !value.length) {
    return fallbackStudySubjects;
  }

  const normalized = value
    .map((subject, index) => ({
      id: subject.id || fallbackStudySubjects[index]?.id || `subject-${index}`,
      name:
        subject.name ||
        fallbackStudySubjects[index]?.name ||
        `Subject ${index + 1}`,
      color: subject.color || fallbackStudySubjects[index]?.color || "#FFE330",
    }))
    .filter((subject) => subject.name);

  return normalized.length ? normalized : fallbackStudySubjects;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }

  return fallback;
}
