"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BellOff,
  Check,
  Clock3,
  Crown,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  MessagesSquare,
  Pause,
  Play,
  Plus,
  Settings,
  UserPlus,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { EmptyStateCta } from "@/components/empty-state-cta";
import { PaginatedList } from "@/components/paginated-list";
import { useAppHeaderDetail } from "@/components/app-header-detail";
import {
  cacheRemoteSocialSnapshot,
  cacheRemoteTimerState,
  getCachedRemoteSocialSnapshot,
  getCachedRemoteTimerState,
} from "@/lib/client-cache";
import {
  SOCIAL_STORAGE_KEY,
  defaultSocialState,
  getLiveRankingSeconds,
  normalizeSocialState,
  type GroupRole,
  type RankingWindow,
  type SocialFriend,
  type SocialGroup,
  type SocialState,
} from "@/lib/social-state";
import {
  createRemoteGroup,
  fetchRemoteGroupNotificationSettings,
  fetchRemoteUserNudgeMute,
  fetchRemoteTimerState,
  fetchRemoteSocialSnapshot,
  inviteRemoteFriendToGroup,
  leaveRemoteGroup,
  removeRemoteGroupMember,
  saveRemoteGroupNotificationSettings,
  setRemoteGroupMemberRole,
  setRemoteUserNudgeMute,
  startRemoteStudySession,
  stopRemoteStudySession,
  subscribeToRemoteAppChanges,
  transferRemoteGroupLeadership,
  updateRemoteGroupInvite,
  type RemoteActiveSession,
  type RemoteGroupInvite,
  type RemoteGroupNotificationSettings,
  type RemoteSubject,
  updateRemoteGroupDetails,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { NudgePill } from "@/components/social/nudge-pill";
import { useNudgeQueue } from "@/components/social/use-nudge-queue";
import { StartStudyDialog } from "@/components/study/start-study-dialog";
import { formatDuration, isLongSession } from "@/lib/timer";
import { cn } from "@/lib/utils";
import {
  GroupChat,
  prefetchRemoteGroupChat,
} from "@/components/groups/group-chat";

const rankingWindows = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
] satisfies { id: RankingWindow; label: string }[];

const MEMBER_ACTIVE_COLOR = "#ff7a00";
const MEMBER_INACTIVE_COLOR = "#737b91";
const emptySocialState: SocialState = { friends: [], groups: [] };
const TIMER_STORAGE_KEY = "mac-study-demo-state";
const fallbackStudySubjects: RemoteSubject[] = [];

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
  const [isInvitingFriends, setIsInvitingFriends] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [groupView, setGroupView] = useState<"class" | "rankings" | "chat">(
    "class",
  );
  const [rankingWindow, setRankingWindow] = useState<RankingWindow>("day");
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"groups" | "requests">("groups");
  const [groupInvites, setGroupInvites] = useState<RemoteGroupInvite[]>([]);
  const [requestBusyKey, setRequestBusyKey] = useState<string | null>(null);
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);
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
      setGroupInvites(snapshot.groupInvites ?? []);
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
        setGroupInvites(cachedSocial.groupInvites ?? []);
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
          setGroupInvites(snapshot.groupInvites ?? []);
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
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const groupId = searchParams.get("group");
    if (!groupId || !socialState.groups.some((group) => group.id === groupId)) {
      return;
    }

    setSelectedGroupId(groupId);
    if (searchParams.get("view") === "chat") {
      setGroupView("chat");
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("group");
    url.searchParams.delete("view");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [socialState.groups]);

  useEffect(() => {
    function openGroupChat(event: Event) {
      const groupId = (event as CustomEvent<string>).detail;
      if (!socialState.groups.some((group) => group.id === groupId)) return;

      setSelectedGroupId(groupId);
      setGroupView("chat");
    }

    window.addEventListener("mac-open-group-chat", openGroupChat);
    return () => {
      window.removeEventListener("mac-open-group-chat", openGroupChat);
    };
  }, [socialState.groups]);

  useEffect(() => {
    if (!remoteClient || !selectedGroupId) return;

    void prefetchRemoteGroupChat(remoteClient, selectedGroupId).catch(
      () => undefined,
    );
  }, [remoteClient, selectedGroupId]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "requests") {
      setSelectedGroupId(null);
      setActiveTab("requests");
    }

    const openRequests = () => {
      setSelectedGroupId(null);
      setActiveTab("requests");
    };
    window.addEventListener("mac-open-group-requests", openRequests);

    return () =>
      window.removeEventListener("mac-open-group-requests", openRequests);
  }, []);
  useAppHeaderDetail("/app/groups", selectedGroup?.name ?? null);
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
  const incomingGroupInvites = groupInvites.filter(
    (invite) => invite.direction === "incoming",
  );
  const outgoingGroupInvites = groupInvites.filter(
    (invite) => invite.direction === "outgoing",
  );

  async function updateGroupInvite(
    invite: RemoteGroupInvite,
    action: "accept" | "cancel" | "decline",
  ) {
    const previousInvites = groupInvites;
    setGroupInvites((current) =>
      current.filter((item) => item.id !== invite.id),
    );
    setRequestBusyKey(`${action}:${invite.id}`);
    setRequestFeedback(null);

    try {
      await updateRemoteGroupInvite({ action, requestId: invite.id });
      if (remoteClient) await refreshRemoteSocial(remoteClient);
    } catch (error) {
      setGroupInvites(previousInvites);
      setRequestFeedback(
        getErrorMessage(error, "Could not update that group invitation."),
      );
    } finally {
      setRequestBusyKey(null);
    }
  }

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
      setSelectedMembers([]);
      setIsCreating(false);
      await refreshRemoteSocial(remoteClient);
      return;
    }

    const newGroup: SocialGroup = {
      id: `group-${crypto.randomUUID()}`,
      name,
      icon: "users",
      memberIds: ["you"],
      memberRoles: { you: "owner" },
      currentUserRole: "owner",
      visibility: "private",
    };

    setSocialState((current) => ({
      ...current,
      groups: [newGroup, ...current.groups],
    }));
    setSelectedGroupId(newGroup.id);
    setGroupName("");
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

  async function updateGroupDetails(name: string) {
    if (!selectedGroup) return;

    if (remoteClient) {
      await updateRemoteGroupDetails({
        groupId: selectedGroup.id,
        name,
        supabase: remoteClient,
      });
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroup.id
          ? { ...group, name, visibility: "private" }
          : group,
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

  async function transferGroupLeadership(userId: string) {
    if (!selectedGroup) return;

    if (remoteClient) {
      await transferRemoteGroupLeadership({
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

        const currentOwnerId =
          Object.entries(group.memberRoles).find(
            ([, role]) => role === "owner",
          )?.[0] ?? "you";

        return {
          ...group,
          currentUserRole: "admin",
          memberRoles: {
            ...group.memberRoles,
            [currentOwnerId]: "admin",
            [userId]: "owner",
          },
        };
      }),
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

  async function startGroupStudy(subjectId: string | null) {
    if (!selectedGroup || activeStudySession) {
      setIsChoosingStudy(false);
      return;
    }

    const nextSession = {
      groupId: selectedGroup.id,
      subjectId,
      startedAt: new Date().toISOString(),
    };
    setActiveStudySession(nextSession);
    setIsChoosingStudy(false);

    if (remoteClient) {
      try {
        await startRemoteStudySession({
          groupId: selectedGroup.id,
          subjectId,
          supabase: remoteClient,
        });
      } catch {
        setActiveStudySession((current) =>
          current?.startedAt === nextSession.startedAt ? null : current,
        );
      } finally {
        await Promise.allSettled([
          refreshRemoteTimer(remoteClient),
          refreshRemoteSocial(remoteClient),
        ]);
      }

      return;
    }

    const currentTimerState = readLocalTimerState();

    writeLocalTimerState({
      ...currentTimerState,
      activeSession: nextSession,
      subjects: timerSubjects,
    });
  }

  async function stopGroupStudy() {
    if (!activeStudySession) {
      return;
    }

    const stoppingSession = activeStudySession;
    setActiveStudySession(null);

    if (remoteClient) {
      try {
        await stopRemoteStudySession(remoteClient);
      } catch {
        setActiveStudySession((current) => current ?? stoppingSession);
      } finally {
        await Promise.allSettled([
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
          groupId: stoppingSession.groupId ?? null,
          subjectId: stoppingSession.subjectId,
          startedAt: stoppingSession.startedAt,
          endedAt: endedAt.toISOString(),
          status: isLongSession(stoppingSession.startedAt, endedAt)
            ? "needs_confirmation"
            : "completed",
          source: "timer",
        },
        ...(currentTimerState?.sessions ?? []),
      ],
      subjects: timerSubjects,
    });
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
    const canInviteFriends =
      selectedGroup.currentUserRole === "owner" ||
      selectedGroup.currentUserRole === "admin";
    const pendingInviteFriendIds = new Set(
      outgoingGroupInvites
        .filter((invite) => invite.group.id === selectedGroup.id)
        .map((invite) => invite.user.id),
    );

    if (groupView === "chat") {
      return (
        <GroupChat
          currentUserId={currentUserId}
          groupId={selectedGroup.id}
          groupName={selectedGroup.name}
          key={selectedGroup.id}
          members={members}
          onBack={() => setGroupView("class")}
          remoteClient={remoteClient}
        />
      );
    }

    return (
      <div className="space-y-4 pb-24 pt-1 lg:space-y-5 lg:pb-0 lg:pt-0">
        <section className="space-y-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              aria-label="Back to groups"
              className="mac-focus inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.045)] hover:text-[var(--color-text)]"
              onClick={() => {
                setSelectedGroupId(null);
                setSelectedMemberId(null);
                setGroupView("class");
                setIsInvitingFriends(false);
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
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canInviteFriends ? (
                <button
                  aria-label="Invite friends"
                  className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414] transition active:scale-[0.98]"
                  onClick={() => setIsInvitingFriends(true)}
                  title="Invite friends"
                  type="button"
                >
                  <UserPlus aria-hidden size={18} />
                </button>
              ) : null}
              <button
                aria-label="Group settings"
                className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md bg-[rgb(255_255_255/0.045)] text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.08)]"
                onClick={() => setIsGroupSettingsOpen(true)}
                type="button"
              >
                <Settings aria-hidden size={18} />
              </button>
            </div>
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
                    "mac-focus h-11 rounded px-3 text-xs font-semibold transition",
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
            <PaginatedList
              className="grid grid-cols-3 gap-2 py-1 sm:grid-cols-4 lg:grid-cols-6 lg:gap-3"
              items={members}
              pageSize={12}
              renderItem={(member) => (
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
                  <StudyPersonIcon active={member.studying} />
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
              )}
              resetKey={`${selectedGroup.id}:class`}
            />
          </section>
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
            remoteClient={remoteClient}
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
            onLeadershipTransfer={transferGroupLeadership}
            remoteClient={remoteClient}
            selectedGroup={selectedGroup}
          />
        ) : null}

        {isInvitingFriends ? (
          <GroupFriendInviteDialog
            currentUserId={currentUserId ?? "you"}
            friends={socialState.friends}
            group={selectedGroup}
            onClose={() => setIsInvitingFriends(false)}
            onInvite={inviteGroupMember}
            pendingFriendIds={pendingInviteFriendIds}
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
            <PaginatedList
              className="grid gap-2 lg:grid-cols-2 lg:gap-3"
              items={ranking}
              pageSize={12}
              renderItem={(member, _index, absoluteIndex) => (
                <button
                  className={cn(
                    "mac-focus grid min-h-14 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5 text-left transition active:scale-[0.99]",
                    absoluteIndex === 0
                      ? "border-[rgb(255_227_48/0.42)] bg-[rgb(255_227_48/0.14)]"
                      : absoluteIndex < 3
                        ? "border-[rgb(255_227_48/0.24)] bg-[rgb(255_227_48/0.08)]"
                        : "border-transparent bg-[rgb(255_255_255/0.035)]",
                  )}
                  key={member.id}
                  onClick={() => {
                    setSelectedMemberId(member.id);
                  }}
                  type="button"
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center font-mono text-sm font-semibold",
                      absoluteIndex < 3
                        ? "text-[var(--color-mac-yellow)]"
                        : "text-[var(--color-text-muted)]",
                    )}
                  >
                    {absoluteIndex === 0 ? (
                      <>
                        <Crown aria-hidden fill="currentColor" size={17} />
                        <span className="sr-only">Rank 1</span>
                      </>
                    ) : (
                      `#${absoluteIndex + 1}`
                    )}
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
              )}
              resetKey={`${selectedGroup.id}:${rankingWindow}`}
            />
          </section>
        ) : null}

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
              <Pause aria-hidden fill="currentColor" size={18} />
            ) : (
              <Play aria-hidden size={18} />
            )}
            {activeInSelectedGroup
              ? "Pause study"
              : isStudyingElsewhere
                ? "Studying in another session"
                : "Start study"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <section className="hidden grid-cols-3 gap-4 lg:grid">
        <SummaryStat label="Groups" value={`${socialState.groups.length}`} />
        <SummaryStat label="Active" value={`${activeTotal}`} />
        <SummaryStat label="Members" value={`${uniqueMemberCount}`} />
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">
          {socialState.groups.length
            ? `${socialState.groups.length} ${socialState.groups.length === 1 ? "group" : "groups"}`
            : "No groups yet"}
        </p>
        {socialState.groups.length ? (
          <button
            className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414]"
            onClick={() => setIsCreating(true)}
            type="button"
          >
            <Plus aria-hidden size={17} />
            Create
          </button>
        ) : null}
      </div>

      <div
        aria-label="Groups view"
        className="grid grid-cols-2 rounded-xl bg-[rgb(255_255_255/0.04)] p-1"
        role="tablist"
      >
        <button
          aria-selected={activeTab === "groups"}
          className={cn(
            "mac-focus h-11 rounded-lg text-sm font-semibold transition",
            activeTab === "groups"
              ? "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
              : "text-[var(--color-text-muted)]",
          )}
          onClick={() => setActiveTab("groups")}
          role="tab"
          type="button"
        >
          Groups
        </button>
        <button
          aria-selected={activeTab === "requests"}
          className={cn(
            "mac-focus flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition",
            activeTab === "requests"
              ? "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
              : "text-[var(--color-text-muted)]",
          )}
          onClick={() => setActiveTab("requests")}
          role="tab"
          type="button"
        >
          Requests
          {incomingGroupInvites.length ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
              {incomingGroupInvites.length}
            </span>
          ) : null}
        </button>
      </div>

      {requestFeedback ? (
        <p
          className="rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
          role="status"
        >
          {requestFeedback}
        </p>
      ) : null}

      {activeTab === "groups" ? (
        <section className="space-y-3" role="tabpanel">
          {groupSummaries.length ? (
            <PaginatedList
              className="grid gap-2 lg:grid-cols-2 lg:gap-3"
              items={groupSummaries}
              pageSize={10}
              renderItem={({ group, activeNow, memberCount }) => (
                <button
                  className="mac-focus grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-transparent bg-[rgb(255_255_255/0.035)] px-3 py-3 text-left transition hover:border-[rgb(255_255_255/0.1)] hover:bg-[rgb(255_255_255/0.05)] active:scale-[0.99] lg:min-h-20 lg:px-4"
                  key={group.id}
                  onClick={() => {
                    setGroupView("class");
                    setSelectedGroupId(group.id);
                  }}
                  type="button"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">
                      {group.name}
                    </h3>
                    <div className="mt-1 text-sm text-[var(--color-text-muted)]">
                      <span>{activeNow} active</span>
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
              )}
              resetKey="groups"
            />
          ) : (
            <EmptyStateCta
              action={
                <button
                  className="mac-focus inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] sm:w-auto"
                  onClick={() => setIsCreating(true)}
                  type="button"
                >
                  <Plus aria-hidden size={17} />
                  Create group
                </button>
              }
              description="Invite friends and study together."
              icon={<UserPlus aria-hidden size={18} />}
              title="Create your first group"
            />
          )}
        </section>
      ) : (
        <section className="space-y-6" role="tabpanel">
          {incomingGroupInvites.length ? (
            <GroupInviteSection
              title={`Incoming (${incomingGroupInvites.length})`}
            >
              <PaginatedList
                className="grid gap-2"
                items={incomingGroupInvites}
                pageSize={10}
                renderItem={(invite) => (
                  <GroupInviteRow
                    busyKey={requestBusyKey}
                    invite={invite}
                    key={invite.id}
                    onAction={(action) =>
                      void updateGroupInvite(invite, action)
                    }
                  />
                )}
                resetKey="incoming-group-invites"
              />
            </GroupInviteSection>
          ) : null}

          {outgoingGroupInvites.length ? (
            <GroupInviteSection title={`Sent (${outgoingGroupInvites.length})`}>
              <PaginatedList
                className="grid gap-2"
                items={outgoingGroupInvites}
                pageSize={10}
                renderItem={(invite) => (
                  <GroupInviteRow
                    busyKey={requestBusyKey}
                    invite={invite}
                    key={invite.id}
                    onAction={(action) =>
                      void updateGroupInvite(invite, action)
                    }
                  />
                )}
                resetKey="outgoing-group-invites"
              />
            </GroupInviteSection>
          ) : null}

          {!groupInvites.length ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] px-4 py-8 text-center">
              <p className="font-semibold">No group invitations</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Incoming and sent invitations will appear here.
              </p>
            </div>
          ) : null}
        </section>
      )}

      {isCreating ? (
        <CreateGroupDialog
          groupName={groupName}
          onClose={() => {
            setIsCreating(false);
            setGroupName("");
            setSelectedMembers([]);
          }}
          onCreate={createGroup}
          onMemberToggle={toggleMember}
          onNameChange={setGroupName}
          currentUserId={currentUserId}
          selectedMembers={selectedMembers}
          socialState={socialState}
        />
      ) : null}
    </div>
  );
}

function GroupInviteSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-2.5">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {title}
      </h2>
      {children}
    </div>
  );
}

function GroupInviteRow({
  busyKey,
  invite,
  onAction,
}: {
  busyKey: string | null;
  invite: RemoteGroupInvite;
  onAction: (action: "accept" | "cancel" | "decline") => void;
}) {
  const isBusy = busyKey?.endsWith(`:${invite.id}`) ?? false;

  return (
    <article className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[rgb(255_255_255/0.065)] bg-[rgb(255_255_255/0.028)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <ProfileBadge friend={invite.user} />
      <div className="min-w-0">
        <p className="truncate font-semibold">{invite.group.name}</p>
        <p className="truncate text-sm text-[var(--color-text-muted)]">
          {invite.direction === "incoming" ? "From" : "Sent to"}{" "}
          {invite.user.handle}
        </p>
      </div>

      {invite.direction === "incoming" ? (
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:flex">
          <button
            className="mac-focus h-11 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] disabled:opacity-45"
            disabled={isBusy}
            onClick={() => onAction("accept")}
            type="button"
          >
            Accept
          </button>
          <button
            className="mac-focus h-11 rounded-md border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text-muted)] disabled:opacity-45"
            disabled={isBusy}
            onClick={() => onAction("decline")}
            type="button"
          >
            Decline
          </button>
        </div>
      ) : (
        <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)]">
            <Clock3 aria-hidden size={15} />
            Pending
          </span>
          <button
            className="mac-focus h-11 rounded-md px-3 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-45"
            disabled={isBusy}
            onClick={() => onAction("cancel")}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}

function CreateGroupDialog({
  groupName,
  onClose,
  onCreate,
  onMemberToggle,
  onNameChange,
  currentUserId,
  selectedMembers,
  socialState,
}: {
  groupName: string;
  onClose: () => void;
  onCreate: () => void | Promise<void>;
  onMemberToggle: (friendId: string) => void;
  onNameChange: (name: string) => void;
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
    <AppDialog
      bodyClassName="space-y-5"
      footer={
        <button
          className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414] disabled:opacity-45"
          disabled={!groupName.trim() || isSubmitting}
          onClick={() => void submitGroup()}
          type="button"
        >
          {isSubmitting ? "Creating…" : "Create group"}
        </button>
      }
      isDirty={Boolean(groupName.trim()) || selectedMembers.length > 0}
      onClose={onClose}
      title="Create group"
    >
      <label className="block text-sm font-medium">
        Name
        <input
          className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
          data-dialog-autofocus
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Study group"
          value={groupName}
        />
      </label>

      <div>
        <p className="text-sm font-medium">Members</p>
        <div className="mt-3 grid gap-2">
          {inviteableFriends.map((friend) => {
            const selected = selectedMembers.includes(friend.id);

            return (
              <button
                className="mac-focus grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3 text-left"
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
    </AppDialog>
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

function GroupFriendInviteDialog({
  currentUserId,
  friends,
  group,
  onClose,
  onInvite,
  pendingFriendIds,
}: {
  currentUserId: string;
  friends: SocialFriend[];
  group: SocialGroup;
  onClose: () => void;
  onInvite: (friendId: string) => void | Promise<void>;
  pendingFriendIds: Set<string>;
}) {
  const [busyFriendIds, setBusyFriendIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sentFriendIds, setSentFriendIds] = useState<Set<string>>(
    () => new Set(pendingFriendIds),
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const inviteableFriends = friends
    .filter(
      (friend) =>
        friend.id !== currentUserId &&
        friend.id !== "you" &&
        friend.isFriend !== false &&
        !group.memberIds.includes(friend.id),
    )
    .sort((first, second) => first.handle.localeCompare(second.handle));

  async function invite(friend: SocialFriend) {
    if (sentFriendIds.has(friend.id) || busyFriendIds.has(friend.id)) return;

    setFeedback(null);
    setSentFriendIds((current) => new Set(current).add(friend.id));
    setBusyFriendIds((current) => new Set(current).add(friend.id));

    try {
      await onInvite(friend.id);
    } catch (error) {
      setSentFriendIds((current) => {
        const next = new Set(current);
        next.delete(friend.id);
        return next;
      });
      setFeedback(getErrorMessage(error, `Could not invite ${friend.handle}.`));
    } finally {
      setBusyFriendIds((current) => {
        const next = new Set(current);
        next.delete(friend.id);
        return next;
      });
    }
  }

  return (
    <AppDialog
      bodyClassName="grid gap-3"
      closeLabel="Close friend invitations"
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title="Invite friends"
    >
      {feedback ? (
        <p className="text-sm text-[var(--color-danger)]" role="status">
          {feedback}
        </p>
      ) : null}

      {inviteableFriends.length ? (
        <PaginatedList
          className="grid gap-1.5"
          items={inviteableFriends}
          pageSize={8}
          renderItem={(friend) => {
            const sent = sentFriendIds.has(friend.id);
            const busy = busyFriendIds.has(friend.id);

            return (
              <div
                className="flex min-w-0 items-center gap-3 rounded-md bg-[rgb(255_255_255/0.03)] px-3 py-2.5"
                key={friend.id}
              >
                <ProfileBadge friend={friend} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {friend.name}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {friend.handle}
                  </p>
                </div>
                <button
                  className={cn(
                    "mac-focus h-10 shrink-0 rounded-md px-3 text-xs font-semibold transition",
                    sent
                      ? "border border-[var(--color-border)] text-[var(--color-text-muted)]"
                      : "bg-[var(--color-mac-yellow)] text-[#141414]",
                  )}
                  disabled={sent || busy}
                  onClick={() => void invite(friend)}
                  type="button"
                >
                  {sent ? "Invite sent" : "Invite"}
                </button>
              </div>
            );
          }}
          resetKey={`${group.id}:invite-friends`}
        />
      ) : (
        <p className="rounded-md bg-[rgb(255_255_255/0.03)] px-3 py-4 text-sm text-[var(--color-text-muted)]">
          All available friends are already members or invited.
        </p>
      )}
    </AppDialog>
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
  remoteClient,
}: {
  canNudge: boolean;
  group: SocialGroup;
  member: SocialFriend;
  now: Date;
  nudgeFeedback: string | null;
  onClose: () => void;
  onNudge: () => void;
  pendingNudges: number;
  remoteClient: SupabaseClient | null;
}) {
  const [nudgesMuted, setNudgesMuted] = useState(false);
  const [muteSaving, setMuteSaving] = useState(false);

  useEffect(() => {
    if (!remoteClient || !canNudge) return;

    let cancelled = false;
    void fetchRemoteUserNudgeMute({
      groupId: group.id,
      supabase: remoteClient,
      userId: member.id,
    })
      .then((muted) => {
        if (!cancelled) setNudgesMuted(muted);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [canNudge, group.id, member.id, remoteClient]);

  async function toggleNudgeMute() {
    if (!remoteClient || muteSaving) return;

    const nextMuted = !nudgesMuted;
    setNudgesMuted(nextMuted);
    setMuteSaving(true);

    try {
      await setRemoteUserNudgeMute({
        groupId: group.id,
        muted: nextMuted,
        supabase: remoteClient,
        userId: member.id,
      });
    } catch {
      setNudgesMuted(!nextMuted);
    } finally {
      setMuteSaving(false);
    }
  }

  return (
    <AppDialog
      closeLabel="Close member details"
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title={member.name}
    >
      <div className="flex min-w-0 items-center gap-3">
        <ProfileBadge friend={member} />
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--color-text-muted)]">
            {member.handle}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <NudgePill
          disabled={!canNudge || member.studying}
          disabledLabel={member.studying ? "Studying now" : undefined}
          onClick={onNudge}
          pendingCount={pendingNudges}
        />
        <p className="text-xs font-medium text-[var(--color-text-muted)]">
          {nudgeFeedback ??
            (canNudge
              ? member.studying
                ? "They are already studying."
                : `Send from ${group.name}`
              : "You cannot nudge yourself.")}
        </p>
      </div>

      {canNudge && remoteClient ? (
        <button
          aria-pressed={nudgesMuted}
          className="mac-focus mt-4 flex min-h-11 w-full items-center gap-3 rounded-md border border-[var(--color-border)] px-3 text-left text-sm"
          disabled={muteSaving}
          onClick={() => void toggleNudgeMute()}
          type="button"
        >
          <BellOff
            aria-hidden
            className={
              nudgesMuted
                ? "text-[var(--color-mac-yellow)]"
                : "text-[var(--color-text-muted)]"
            }
            size={17}
          />
          <span className="min-w-0 flex-1 font-medium">
            Mute nudges from {member.handle}
          </span>
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">
            {nudgesMuted ? "On" : "Off"}
          </span>
        </button>
      ) : null}

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
    </AppDialog>
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

type PendingGroupAction =
  | {
      kind: "role";
      member: SocialFriend;
      nextRole: Exclude<GroupRole, "owner">;
    }
  | { kind: "leadership"; member: SocialFriend }
  | { kind: "remove"; member: SocialFriend }
  | { kind: "leave" };

function GroupSettingsDialog({
  allFriends,
  currentUserId,
  members,
  onClose,
  onGroupDetailsUpdate,
  onInvite,
  onLeave,
  onLeadershipTransfer,
  onMemberRemove,
  onMemberRoleUpdate,
  remoteClient,
  selectedGroup,
}: {
  allFriends: SocialFriend[];
  currentUserId: string;
  members: SocialFriend[];
  onClose: () => void;
  onGroupDetailsUpdate: (name: string) => void | Promise<void>;
  onInvite: (friendId: string) => void | Promise<void>;
  onLeave: () => void | Promise<void>;
  onLeadershipTransfer: (userId: string) => void | Promise<void>;
  onMemberRemove: (userId: string) => void | Promise<void>;
  onMemberRoleUpdate: (
    userId: string,
    role: Exclude<GroupRole, "owner">,
  ) => void | Promise<void>;
  remoteClient: SupabaseClient | null;
  selectedGroup: SocialGroup;
}) {
  const [name, setName] = useState(selectedGroup.name);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingGroupAction | null>(
    null,
  );
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
  const detailsChanged = name.trim() !== selectedGroup.name;

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
      return true;
    } catch (error) {
      setFeedback(getErrorMessage(error, "That change could not be saved."));
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;

    let succeeded = false;

    if (pendingAction.kind === "role") {
      const { member, nextRole } = pendingAction;
      succeeded = await runAction(
        `role:${member.id}`,
        () => onMemberRoleUpdate(member.id, nextRole),
        nextRole === "admin"
          ? `${member.name} is now a moderator.`
          : `${member.name} is now a member.`,
      );
    } else if (pendingAction.kind === "leadership") {
      succeeded = await runAction(
        `leader:${pendingAction.member.id}`,
        () => onLeadershipTransfer(pendingAction.member.id),
        `${pendingAction.member.name} is now the group leader.`,
      );
    } else if (pendingAction.kind === "remove") {
      succeeded = await runAction(
        `remove:${pendingAction.member.id}`,
        () => onMemberRemove(pendingAction.member.id),
        `${pendingAction.member.name} removed.`,
      );
    } else {
      succeeded = await runAction("leave", onLeave, "You left the group.");
    }

    if (succeeded) setPendingAction(null);
  }

  return (
    <>
      <AppDialog
        bodyClassName="grid gap-5"
        closeLabel="Close group settings"
        isDirty={detailsChanged}
        onClose={onClose}
        title="Group settings"
      >
        {feedback ? (
          <p
            className="rounded-md bg-[rgb(255_255_255/0.045)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
            role="status"
          >
            {feedback}
          </p>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Group details</h3>
          {isLeader ? (
            <label className="block text-sm font-medium">
              Name
              <input
                data-dialog-autofocus
                className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
          ) : (
            <div className="rounded-md bg-[rgb(255_255_255/0.035)] px-3">
              <SettingValue label="Name" value={selectedGroup.name} />
            </div>
          )}
          {isLeader ? (
            <button
              className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] disabled:opacity-45"
              disabled={!name.trim() || !detailsChanged || busyKey !== null}
              onClick={() =>
                void runAction(
                  "details",
                  () => onGroupDetailsUpdate(name.trim()),
                  "Group details updated.",
                )
              }
              type="button"
            >
              {busyKey === "details" ? (
                <>
                  <LoaderCircle
                    aria-hidden
                    className="animate-spin"
                    size={16}
                  />
                  Saving…
                </>
              ) : (
                "Save details"
              )}
            </button>
          ) : null}
        </section>

        <GroupNotificationControls
          groupId={selectedGroup.id}
          remoteClient={remoteClient}
        />

        <section className="space-y-3 border-t border-[var(--color-border)] pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Members</h3>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {members.length} {members.length === 1 ? "person" : "people"}
              </p>
            </div>
            {canManageMembers && inviteableFriends.length ? (
              <button
                aria-expanded={inviteOpen}
                className="mac-focus inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-xs font-semibold"
                onClick={() => {
                  setInviteOpen((current) => !current);
                  setOpenMemberMenuId(null);
                }}
                type="button"
              >
                <UserPlus aria-hidden size={14} />
                Invite
              </button>
            ) : null}
          </div>

          {inviteOpen ? (
            <div className="space-y-1.5 rounded-md border border-[var(--color-border)] bg-[rgb(255_255_255/0.02)] p-2">
              {inviteableFriends.map((friend) => (
                <div
                  className="flex items-center gap-3 rounded-md px-2 py-2"
                  key={friend.id}
                >
                  <ProfileBadge friend={friend} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {friend.name}
                    </p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                      {friend.handle}
                    </p>
                  </div>
                  <button
                    className="mac-focus h-10 rounded-md bg-[var(--color-mac-yellow)] px-3 text-xs font-semibold text-[#141414] disabled:opacity-45"
                    disabled={busyKey !== null}
                    onClick={() =>
                      void runAction(
                        `invite:${friend.id}`,
                        () => onInvite(friend.id),
                        `Invite sent to ${friend.name}.`,
                      )
                    }
                    type="button"
                  >
                    {busyKey === `invite:${friend.id}` ? "Inviting…" : "Invite"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2">
            {members.map((member) => {
              const role = selectedGroup.memberRoles?.[member.id] ?? "member";
              const canRemove =
                member.id !== currentUserId &&
                role !== "owner" &&
                (isLeader || (currentRole === "admin" && role === "member"));
              const canChangeRole = isLeader && role !== "owner";
              const canTransferLeadership =
                isLeader && role !== "owner" && member.id !== currentUserId;
              const hasActions =
                canChangeRole || canRemove || canTransferLeadership;

              return (
                <div
                  className="relative rounded-md bg-[rgb(255_255_255/0.035)] p-3"
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
                    </div>
                    <span className="shrink-0 rounded-full bg-[rgb(255_255_255/0.055)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      {role === "owner"
                        ? "Leader"
                        : role === "admin"
                          ? "Moderator"
                          : "Member"}
                    </span>
                    {hasActions ? (
                      <button
                        aria-expanded={openMemberMenuId === member.id}
                        aria-label={`Manage ${member.name}`}
                        className="mac-focus inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.06)] hover:text-[var(--color-text)]"
                        onClick={() => {
                          setInviteOpen(false);
                          setOpenMemberMenuId((current) =>
                            current === member.id ? null : member.id,
                          );
                        }}
                        type="button"
                      >
                        <MoreHorizontal aria-hidden size={18} />
                      </button>
                    ) : null}
                  </div>

                  {openMemberMenuId === member.id ? (
                    <div className="mt-2 grid gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1.5 shadow-[0_14px_34px_rgb(0_0_0/0.32)]">
                      {canChangeRole ? (
                        <button
                          className="mac-focus h-10 rounded px-2.5 text-left text-xs font-semibold transition hover:bg-[rgb(255_255_255/0.055)]"
                          disabled={busyKey !== null}
                          onClick={() => {
                            setOpenMemberMenuId(null);
                            setPendingAction({
                              kind: "role",
                              member,
                              nextRole: role === "admin" ? "member" : "admin",
                            });
                          }}
                          type="button"
                        >
                          {role === "admin" ? "Make member" : "Make moderator"}
                        </button>
                      ) : null}
                      {canTransferLeadership ? (
                        <button
                          className="mac-focus flex h-10 items-center gap-2 rounded px-2.5 text-left text-xs font-semibold text-[var(--color-mac-yellow)] transition hover:bg-[rgb(255_227_48/0.07)]"
                          disabled={busyKey !== null}
                          onClick={() => {
                            setOpenMemberMenuId(null);
                            setPendingAction({ kind: "leadership", member });
                          }}
                          type="button"
                        >
                          <Crown aria-hidden size={14} />
                          Transfer leadership
                        </button>
                      ) : null}
                      {canRemove ? (
                        <button
                          className="mac-focus h-10 rounded px-2.5 text-left text-xs font-semibold text-[var(--color-danger)] transition hover:bg-[rgb(255_107_107/0.07)]"
                          disabled={busyKey !== null}
                          onClick={() => {
                            setOpenMemberMenuId(null);
                            setPendingAction({ kind: "remove", member });
                          }}
                          type="button"
                        >
                          Remove from group
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--color-border)] pt-5">
          <h3 className="text-sm font-semibold">Your membership</h3>
          {isLeader ? (
            <div className="flex items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
                <Crown aria-hidden size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Group leader</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Transfer leadership before leaving.
                </p>
              </div>
            </div>
          ) : (
            <button
              className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--color-danger)] px-4 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-45"
              disabled={busyKey !== null}
              onClick={() => setPendingAction({ kind: "leave" })}
              type="button"
            >
              <LogOut aria-hidden size={16} /> Leave group
            </button>
          )}
        </section>
      </AppDialog>

      {pendingAction ? (
        <GroupActionConfirmation
          action={pendingAction}
          busy={busyKey !== null}
          onClose={() => setPendingAction(null)}
          onConfirm={() => void confirmPendingAction()}
        />
      ) : null}
    </>
  );
}

function GroupActionConfirmation({
  action,
  busy,
  onClose,
  onConfirm,
}: {
  action: PendingGroupAction;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isDanger = action.kind === "remove" || action.kind === "leave";
  const title =
    action.kind === "role"
      ? action.nextRole === "admin"
        ? "Make moderator?"
        : "Make member?"
      : action.kind === "leadership"
        ? "Transfer leadership?"
        : action.kind === "remove"
          ? "Remove from group?"
          : "Leave group?";
  const handle = action.kind === "leave" ? null : action.member.handle;
  const description =
    action.kind === "role"
      ? `${handle} will ${
          action.nextRole === "admin"
            ? "be able to invite and remove members."
            : "lose moderator permissions."
        }`
      : action.kind === "leadership"
        ? `${handle} will become leader and you will become a moderator.`
        : action.kind === "remove"
          ? `${handle} will lose access to this group.`
          : "You will lose access to this group.";
  const confirmLabel =
    action.kind === "role"
      ? action.nextRole === "admin"
        ? "Make moderator"
        : "Make member"
      : action.kind === "leadership"
        ? "Transfer"
        : action.kind === "remove"
          ? "Remove"
          : "Leave group";

  return (
    <AppDialog
      bodyClassName="pt-1"
      closeLabel="Close confirmation"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            className="mac-focus h-11 rounded-md border border-[var(--color-border)] text-sm font-semibold"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={cn(
              "mac-focus inline-flex h-11 items-center justify-center rounded-md text-sm font-semibold disabled:opacity-45",
              isDanger
                ? "border border-[rgb(255_107_107/0.5)] text-[var(--color-danger)]"
                : "bg-[var(--color-mac-yellow)] text-[#141414]",
            )}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? (
              <LoaderCircle aria-hidden className="animate-spin" size={16} />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      }
      maxWidthClassName="max-w-sm"
      onClose={onClose}
      title={title}
      variant="confirmation"
    >
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">
        {description}
      </p>
    </AppDialog>
  );
}

function GroupNotificationControls({
  groupId,
  remoteClient,
}: {
  groupId: string;
  remoteClient: SupabaseClient | null;
}) {
  const [settings, setSettings] = useState<RemoteGroupNotificationSettings>({
    chatMuted: false,
    nudgesMuted: false,
  });
  const [savingKey, setSavingKey] = useState<
    keyof RemoteGroupNotificationSettings | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!remoteClient) return;

    let cancelled = false;
    void fetchRemoteGroupNotificationSettings({
      groupId,
      supabase: remoteClient,
    })
      .then((nextSettings) => {
        if (!cancelled) setSettings(nextSettings);
      })
      .catch(() => {
        if (!cancelled) setError("Notification settings could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, [groupId, remoteClient]);

  async function toggle(key: keyof RemoteGroupNotificationSettings) {
    if (!remoteClient || savingKey) return;

    const previous = settings;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setSavingKey(key);
    setError(null);

    try {
      await saveRemoteGroupNotificationSettings({
        groupId,
        settings: next,
        supabase: remoteClient,
      });
    } catch {
      setSettings(previous);
      setError("Notification setting could not be saved.");
    } finally {
      setSavingKey(null);
    }
  }

  if (!remoteClient) return null;

  return (
    <section className="space-y-2 border-t border-[var(--color-border)] pt-5">
      <h3 className="text-sm font-semibold">Notifications</h3>
      <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
        <GroupNotificationRow
          enabled={!settings.chatMuted}
          icon={<MessagesSquare aria-hidden size={16} />}
          label="Group messages"
          onToggle={() => void toggle("chatMuted")}
          saving={savingKey === "chatMuted"}
        />
        <GroupNotificationRow
          enabled={!settings.nudgesMuted}
          icon={<BellOff aria-hidden size={16} />}
          label="Nudges"
          onToggle={() => void toggle("nudgesMuted")}
          saving={savingKey === "nudgesMuted"}
        />
      </div>
      {error ? (
        <p className="text-xs text-[var(--color-danger)]" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function GroupNotificationRow({
  enabled,
  icon,
  label,
  onToggle,
  saving,
}: {
  enabled: boolean;
  icon: React.ReactNode;
  label: string;
  onToggle: () => void;
  saving: boolean;
}) {
  return (
    <button
      aria-checked={enabled}
      className="mac-focus flex min-h-12 w-full items-center gap-3 border-b border-[var(--color-border)] px-3 text-left last:border-b-0"
      disabled={saving}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span className="text-[var(--color-mac-yellow)]">{icon}</span>
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      <span
        aria-hidden
        className={cn(
          "relative h-7 w-12 rounded-full border transition",
          enabled
            ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-raised)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-[#f7f7f2] transition",
            enabled ? "left-[1.35rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function SettingValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-sm font-semibold">{value}</span>
    </div>
  );
}

function StudyPersonIcon({ active }: { active: boolean }) {
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
      <path d="M31 6c5 5 1 9 6 13" />
      <path d="M25 10c4 4 1 7 5 10" />
      <path d="M40 10c-3 4-1 7-5 10" />
      <circle cx="32" cy="25" r="7.5" />
      <path d="M18 53c0-10 6-17 14-17s14 7 14 17" />
      <path d="M12 56h40M17 64V49h31v15" />
      <path d="M52 37h10l3 19H50l2-19Z" />
      <path d="M56 37V28h8" />
    </svg>
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
