"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppSupabaseClient as SupabaseClient } from "@/lib/supabase/types";
import {
  ArrowLeft,
  BellOff,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Crown,
  Link2,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  MessagesSquare,
  Pause,
  Pin,
  Play,
  Plus,
  Settings,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { EmptyStateCta } from "@/components/empty-state-cta";
import { PaginatedList } from "@/components/paginated-list";
import { useAppHeaderDetail } from "@/components/app-header-detail";
import {
  cacheRemoteGroupsSnapshot,
  cacheRemoteTimerState,
  dedupeRemoteRequest,
  getCachedRemoteGroupsSnapshot,
  getCachedRemoteTimerState,
  subscribeToRemoteTableChanges,
} from "@/lib/client-cache";
import {
  emitStudySessionChange,
  onStudySessionChange,
} from "@/lib/study-session-events";
import {
  getMascotSrc,
  MASCOT_KEYS,
  resolveMascot,
  type MascotKey,
} from "@/lib/mascots";
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
  fetchRemoteGroupsSnapshot,
  inviteRemoteFriendToGroup,
  joinRemoteGroupByLink,
  leaveRemoteGroup,
  removeRemoteGroupMember,
  saveRemoteGroupNotificationSettings,
  setRemoteGroupMemberRole,
  setRemoteGroupPinned,
  setRemoteUserNudgeMute,
  startRemoteStudySession,
  stopRemoteStudySession,
  updateRemoteStudyIcon,
  transferRemoteGroupLeadership,
  updateRemoteGroupInvite,
  type RemoteActiveSession,
  type RemoteGroupInvite,
  type RemoteGroupNotificationSettings,
  type RemoteSubject,
  updateRemoteGroupDetails,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchGroupChatUnreadCounts } from "@/lib/supabase/group-chat-read-receipts";
import { getGroupLeaveAvailability } from "@/lib/group-membership";
import { NudgePill } from "@/components/social/nudge-pill";
import { useNudgeQueue } from "@/components/social/use-nudge-queue";
import { StartStudyDialog } from "@/components/study/start-study-dialog";
import { Switch } from "@/components/ui/switch";
import { formatDuration, getLocalDateKey, isLongSession } from "@/lib/timer";
import { cn } from "@/lib/utils";
import { ListSection } from "@/components/ui/list-section";
import { ListSkeleton } from "@/components/ui/skeleton";
import {
  GroupChat,
  prefetchRemoteGroupChat,
} from "@/components/groups/group-chat";

const rankingWindows = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
] satisfies { id: RankingWindow; label: string }[];

const emptySocialState: SocialState = { friends: [], groups: [] };
const TIMER_STORAGE_KEY = "mac-study-demo-state";
const fallbackStudySubjects: RemoteSubject[] = [];
const GROUP_SOCIAL_CHANGE_TABLES = new Set([
  "friendships",
  "group_invites",
  "group_members",
  "groups",
  "profiles",
  "study_sessions",
]);
const GROUP_TIMER_CHANGE_TABLES = new Set([
  "study_sessions",
  "subjects",
  "unit_enrolments",
]);
// Read receipts are left out: they never change your own unread counts.
const GROUP_CHAT_CHANGE_TABLES = new Set(["group_chat_messages"]);

export function GroupsDashboard({
  isActive = true,
  onUnreadChange,
  userId = null,
}: {
  isActive?: boolean;
  onUnreadChange?: (hasUnread: boolean) => void;
  userId?: string | null;
} = {}) {
  const [socialState, setSocialState] = useState<SocialState>(emptySocialState);
  const [timerSubjects, setTimerSubjects] = useState<RemoteSubject[]>(
    fallbackStudySubjects,
  );
  const [activeStudySession, setActiveStudySession] =
    useState<RemoteActiveSession | null>(null);
  // Your own start/stop, shown on your card before the server confirms it.
  const [selfStudyOverride, setSelfStudyOverride] = useState<
    | { studying: true; startedAt: string }
    | { studying: false; at: string }
    | null
  >(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isChoosingStudy, setIsChoosingStudy] = useState(false);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [isInvitingFriends, setIsInvitingFriends] = useState(false);
  const [pendingJoinLink, setPendingJoinLink] = useState<{
    code: string;
    groupId: string;
  } | null>(null);
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
  const [groupUnreadCounts, setGroupUnreadCounts] = useState<
    Record<string, number>
  >({});
  const [remoteClient, setRemoteClient] = useState<SupabaseClient | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const studyDateKey = getLocalDateKey(now);
  const previousStudyDateKeyRef = useRef(studyDateKey);
  const joinLinkHandledRef = useRef(false);
  const nudgeQueue = useNudgeQueue(Boolean(remoteClient));

  useEffect(() => {
    onUnreadChange?.(
      Object.values(groupUnreadCounts).some((count) => count > 0),
    );
  }, [groupUnreadCounts, onUnreadChange]);

  const refreshRemoteSocial = useCallback(
    async (supabase: SupabaseClient) => {
      const snapshot = userId
        ? await dedupeRemoteRequest({
            key: "groups",
            load: () => fetchRemoteGroupsSnapshot(supabase),
            userId,
          })
        : await fetchRemoteGroupsSnapshot(supabase);

      if (snapshot) {
        cacheRemoteGroupsSnapshot(snapshot);
        setCurrentUserId(snapshot.currentUserId);
        setSocialState(snapshot.socialState);
        setGroupInvites(snapshot.groupInvites ?? []);
      }
    },
    [userId],
  );

  const refreshRemoteTimer = useCallback(
    async (supabase: SupabaseClient) => {
      const timerState = userId
        ? await dedupeRemoteRequest({
            key: "timer",
            load: () => fetchRemoteTimerState(supabase),
            userId,
          })
        : await fetchRemoteTimerState(supabase);

      if (timerState) {
        cacheRemoteTimerState(timerState);
        setTimerSubjects(timerState.subjects);
        setActiveStudySession(timerState.activeSession);
      }
    },
    [userId],
  );

  const refreshGroupUnreadCounts = useCallback(
    async (supabase: SupabaseClient) => {
      const counts = userId
        ? await dedupeRemoteRequest({
            key: "group-chat-unread",
            load: () => fetchGroupChatUnreadCounts(supabase),
            userId,
          })
        : await fetchGroupChatUnreadCounts(supabase);
      setGroupUnreadCounts(counts);
    },
    [userId],
  );
  const clearGroupUnreadCount = useCallback((groupId: string) => {
    setGroupUnreadCounts((current) => ({
      ...current,
      [groupId]: 0,
    }));
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    if (!isActive || previousStudyDateKeyRef.current === studyDateKey) return;

    previousStudyDateKeyRef.current = studyDateKey;
    if (remoteClient) {
      window.queueMicrotask(() => {
        void refreshRemoteSocial(remoteClient);
        void refreshRemoteTimer(remoteClient);
      });
    }
  }, [
    isActive,
    refreshRemoteSocial,
    refreshRemoteTimer,
    remoteClient,
    studyDateKey,
  ]);

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;

    async function loadInitialState() {
      let supabase: SupabaseClient | null = null;
      const cachedSocial = getCachedRemoteGroupsSnapshot(userId);
      const cachedTimer = getCachedRemoteTimerState(userId);

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
        const client = createSupabaseBrowserClient();
        supabase = client;
        if (!cancelled) {
          setRemoteClient(client);
        }
        const [snapshot, timerState, unreadCounts] = await Promise.all([
          userId
            ? dedupeRemoteRequest({
                key: "groups",
                load: () => fetchRemoteGroupsSnapshot(client),
                userId,
              })
            : fetchRemoteGroupsSnapshot(client),
          userId
            ? dedupeRemoteRequest({
                key: "timer",
                load: () => fetchRemoteTimerState(client),
                userId,
              })
            : fetchRemoteTimerState(client),
          (userId
            ? dedupeRemoteRequest({
                key: "group-chat-unread",
                load: () => fetchGroupChatUnreadCounts(client),
                userId,
              })
            : fetchGroupChatUnreadCounts(client)
          ).catch(() => ({})),
        ]);

        if (!cancelled && snapshot) {
          cacheRemoteGroupsSnapshot(snapshot);
          setCurrentUserId(snapshot.currentUserId);
          setSocialState(snapshot.socialState);
          setGroupInvites(snapshot.groupInvites ?? []);
          setGroupUnreadCounts(unreadCounts);
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
  }, [isActive, userId]);

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
    if (!isActive || !remoteClient) {
      return;
    }

    return subscribeToRemoteTableChanges((table) => {
      if (GROUP_CHAT_CHANGE_TABLES.has(table)) {
        void refreshGroupUnreadCounts(remoteClient);
        return;
      }

      if (GROUP_SOCIAL_CHANGE_TABLES.has(table)) {
        void refreshRemoteSocial(remoteClient);
      }
      if (GROUP_TIMER_CHANGE_TABLES.has(table)) {
        void refreshRemoteTimer(remoteClient);
      }
    });
  }, [
    isActive,
    refreshGroupUnreadCounts,
    refreshRemoteSocial,
    refreshRemoteTimer,
    remoteClient,
  ]);

  const selectedGroup = socialState.groups.find(
    (group) => group.id === selectedGroupId,
  );
  useEffect(() => {
    if (!isActive) return;
    if (joinLinkHandledRef.current) return;

    const url = new URL(window.location.href);
    const groupId = url.searchParams.get("joinGroup")?.trim();
    const code = url.searchParams.get("joinCode")?.trim();

    if (!groupId || !code) return;

    joinLinkHandledRef.current = true;
    window.queueMicrotask(() => {
      setSelectedGroupId(null);
      setGroupView("class");
      setPendingJoinLink({ code, groupId });
    });
    url.searchParams.delete("joinGroup");
    url.searchParams.delete("joinCode");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [isActive]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const groupId = searchParams.get("group");
    if (!groupId || !socialState.groups.some((group) => group.id === groupId)) {
      return;
    }

    window.queueMicrotask(() => {
      setSelectedGroupId(groupId);
      if (searchParams.get("view") === "chat") {
        setGroupView("chat");
      }
    });
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
      window.queueMicrotask(() => {
        setSelectedGroupId(null);
        setActiveTab("requests");
      });
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
  const selfId = currentUserId ?? "you";
  const friendsById = useMemo(
    () =>
      new Map(
        socialState.friends.map((friend) => [
          friend.id,
          friend.id === selfId
            ? applySelfStudyOverride(friend, selfStudyOverride)
            : friend,
        ]),
      ),
    [selfId, selfStudyOverride, socialState.friends],
  );

  useEffect(() => {
    return onStudySessionChange((session) => {
      setActiveStudySession(session);
      setSelfStudyOverride(
        session
          ? { studying: true, startedAt: session.startedAt }
          : { studying: false, at: new Date().toISOString() },
      );
    });
  }, []);

  const serverSelfStudying = socialState.friends.find(
    (friend) => friend.id === selfId,
  )?.studying;

  useEffect(() => {
    // Hand back to server data once it agrees with the local change.
    if (
      selfStudyOverride &&
      serverSelfStudying === selfStudyOverride.studying
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears a resolved optimistic override
      setSelfStudyOverride(null);
    }
  }, [selfStudyOverride, serverSelfStudying]);
  const groupSummaries = socialState.groups.map((group) => {
    const members = getGroupMembers(group, friendsById);
    const activeNow = members.filter((member) => member.studying).length;

    return {
      group,
      activeNow,
      memberCount: members.length,
    };
  });
  const pinnedGroupSummaries = groupSummaries.filter(
    ({ group }) => group.isPinned,
  );
  const otherGroupSummaries = groupSummaries.filter(
    ({ group }) => !group.isPinned,
  );

  function setGroupPinnedLocally(groupId: string, pinned: boolean) {
    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...group, isPinned: pinned } : group,
      ),
    }));
  }

  async function toggleGroupPin(group: SocialGroup) {
    const pinned = !group.isPinned;
    setGroupPinnedLocally(group.id, pinned);
    if (!remoteClient) return;

    try {
      await setRemoteGroupPinned({
        groupId: group.id,
        pinned,
        supabase: remoteClient,
      });
    } catch {
      setGroupPinnedLocally(group.id, !pinned);
      setRequestFeedback(
        pinned ? "Group could not be pinned." : "Group could not be unpinned.",
      );
    }
  }

  function renderGroupRow({
    activeNow,
    group,
    memberCount,
  }: (typeof groupSummaries)[number]) {
    return (
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md border transition",
          group.isPinned
            ? "border-[rgb(255_227_48/0.16)] bg-[rgb(255_227_48/0.035)] hover:border-[rgb(255_227_48/0.28)]"
            : "border-transparent bg-[rgb(255_255_255/0.035)] hover:border-[rgb(255_255_255/0.1)] hover:bg-[rgb(255_255_255/0.05)]",
        )}
        key={group.id}
      >
        <button
          className="mac-focus grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-3 text-left active:scale-[0.99] lg:min-h-20 lg:px-4"
          onClick={() => {
            setGroupView("class");
            setSelectedGroupId(group.id);
          }}
          type="button"
        >
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{group.name}</h3>
            <div className="mt-1 text-sm text-[var(--color-text-muted)]">
              <span>{activeNow} active</span>
            </div>
          </div>
          {/* Unread chat count, centred left of the pin/members column. */}
          {groupUnreadCounts[group.id] ? (
            <span
              aria-label={`${groupUnreadCounts[group.id]} unread chat messages`}
              className="inline-flex shrink-0 items-center gap-1 text-[var(--color-text-muted)]"
            >
              <MessagesSquare aria-hidden size={15} />
              <UnreadBadge count={groupUnreadCounts[group.id]} />
            </span>
          ) : (
            <span />
          )}
        </button>
        {/* Pin top-right, member count bottom-right. */}
        <div className="flex flex-col items-end justify-between pb-3 pr-2 pt-1.5 lg:pb-3.5 lg:pr-3">
          <button
            aria-label={
              group.isPinned ? `Unpin ${group.name}` : `Pin ${group.name}`
            }
            aria-pressed={Boolean(group.isPinned)}
            className={cn(
              "mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md transition active:scale-95",
              group.isPinned
                ? "text-[var(--color-mac-yellow)] hover:bg-[rgb(255_227_48/0.1)]"
                : "text-[var(--color-text-muted)] hover:bg-[rgb(255_255_255/0.055)] hover:text-[var(--color-text)]",
            )}
            onClick={() => void toggleGroupPin(group)}
            title={group.isPinned ? "Unpin" : "Pin to top"}
            type="button"
          >
            <Pin
              aria-hidden
              className={group.isPinned ? "rotate-0" : "rotate-45"}
              fill={group.isPinned ? "currentColor" : "none"}
              size={20}
            />
          </button>
          <span className="pr-1 text-sm leading-5 tabular-nums text-[var(--color-text-muted)]">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
      </div>
    );
  }

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

  async function joinGroupFromLink({
    code,
    groupId,
  }: {
    code: string;
    groupId: string;
  }) {
    if (!remoteClient) {
      throw new Error("Group invite links require an online account.");
    }

    const joinedGroupId = await joinRemoteGroupByLink({
      code,
      groupId,
      supabase: remoteClient,
    });
    await refreshRemoteSocial(remoteClient);
    setActiveTab("groups");
    setGroupView("class");
    setSelectedGroupId(joinedGroupId);
    setPendingJoinLink(null);
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
    emitStudySessionChange(nextSession);

    if (remoteClient) {
      try {
        await startRemoteStudySession({
          groupId: selectedGroup.id,
          startedAt: nextSession.startedAt,
          subjectId,
          supabase: remoteClient,
        });
      } catch {
        setActiveStudySession((current) =>
          current?.startedAt === nextSession.startedAt ? null : current,
        );
        emitStudySessionChange(null);
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
    emitStudySessionChange(null);

    if (remoteClient) {
      try {
        await stopRemoteStudySession(remoteClient);
      } catch {
        setActiveStudySession((current) => current ?? stoppingSession);
        emitStudySessionChange({
          groupId: stoppingSession.groupId ?? null,
          startedAt: stoppingSession.startedAt,
          subjectId: stoppingSession.subjectId,
        });
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

  async function changeMascot(memberId: string, icon: MascotKey) {
    const previousIcon = friendsById.get(memberId)?.personIcon;
    const applyIcon = (nextIcon: SocialFriend["personIcon"]) =>
      setSocialState((current) => ({
        ...current,
        friends: current.friends.map((friend) =>
          friend.id === memberId ? { ...friend, personIcon: nextIcon } : friend,
        ),
      }));

    applyIcon(icon);

    if (!remoteClient || !currentUserId || !previousIcon) return;

    try {
      await updateRemoteStudyIcon({
        icon,
        supabase: remoteClient,
        userId: currentUserId,
      });
    } catch {
      applyIcon(previousIcon);
    }
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
    const pendingInviteFriendIds = new Set(
      outgoingGroupInvites
        .filter((invite) => invite.group.id === selectedGroup.id)
        .map((invite) => invite.user.id),
    );
    const selectedGroupUnreadCount = groupUnreadCounts[selectedGroup.id] ?? 0;

    if (groupView === "chat") {
      return (
        <GroupChat
          currentUserId={currentUserId}
          groupId={selectedGroup.id}
          groupName={selectedGroup.name}
          key={selectedGroup.id}
          members={members}
          onBack={() => setGroupView("class")}
          onRead={clearGroupUnreadCount}
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
              <button
                aria-label="Invite people"
                className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414] transition active:scale-[0.98]"
                onClick={() => setIsInvitingFriends(true)}
                title="Invite people"
                type="button"
              >
                <UserPlus aria-hidden size={18} />
              </button>
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

          <div className="flex items-center gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-3 rounded-xl bg-[rgb(255_255_255/0.04)] p-1 lg:max-w-lg">
              {[
                { id: "class", label: "Class view" },
                { id: "rankings", label: "Rankings" },
                { id: "chat", label: "Chat" },
              ].map((view) => (
                <button
                  className={cn(
                    "mac-focus h-11 min-w-0 whitespace-nowrap rounded-lg text-sm font-semibold transition",
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
                  <span className="inline-flex items-center justify-center gap-1.5">
                    {view.id === "chat" ? (
                      <MessagesSquare aria-hidden size={15} />
                    ) : null}
                    {view.label}
                    {view.id === "chat" && selectedGroupUnreadCount ? (
                      <UnreadBadge count={selectedGroupUnreadCount} />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>

            {groupView === "rankings" ? (
              <div
                aria-label="Ranking period"
                className="ml-auto hidden shrink-0 grid-cols-3 rounded-xl bg-[rgb(255_255_255/0.04)] p-1 lg:grid"
                role="group"
              >
                {rankingWindows.map((window) => (
                  <button
                    aria-pressed={rankingWindow === window.id}
                    className={cn(
                      "mac-focus h-11 rounded-lg px-4 text-sm font-semibold transition",
                      rankingWindow === window.id
                        ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
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
          </div>
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
                    "mac-focus group relative flex min-w-0 flex-col items-center rounded-xl border px-1.5 pb-2.5 pt-1.5 text-center transition active:scale-[0.98]",
                    member.studying
                      ? "border-[rgb(255_122_0/0.3)] bg-[radial-gradient(circle_at_50%_38%,rgb(255_122_0/0.14),transparent_62%),rgb(255_122_0/0.035)] hover:border-[rgb(255_122_0/0.45)]"
                      : "border-[rgb(255_255_255/0.05)] bg-[rgb(255_255_255/0.018)] hover:border-[rgb(255_255_255/0.1)] hover:bg-[rgb(255_255_255/0.035)]",
                  )}
                  key={member.id}
                  onClick={() => {
                    setSelectedMemberId(member.id);
                  }}
                  type="button"
                >
                  <MemberMascot
                    active={member.studying}
                    icon={member.personIcon}
                    memberId={member.id}
                  />
                  <p
                    className={cn(
                      "mt-1 w-full truncate px-1 text-sm font-semibold",
                      member.studying
                        ? "text-[var(--color-text)]"
                        : "text-[var(--color-text-muted)]",
                    )}
                    title={member.handle}
                  >
                    {member.handle}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 flex items-center justify-center gap-1.5 font-mono text-xs font-semibold tabular-nums",
                      member.studying
                        ? "text-[#ff9a3d]"
                        : "text-[rgb(169_169_159/0.7)]",
                    )}
                  >
                    {member.studying ? (
                      <>
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff7a00] motion-reduce:animate-none"
                        />
                        <span className="sr-only">Studying now, </span>
                      </>
                    ) : null}
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
            nudgeAtLimit={selectedMemberNudgeState?.atLimit ?? false}
            nudgeFeedback={selectedMemberNudgeState?.feedback ?? null}
            now={now}
            onClose={() => {
              setSelectedMemberId(null);
            }}
            onMascotChange={
              selectedMember.id === (currentUserId ?? "you")
                ? (icon) => void changeMascot(selectedMember.id, icon)
                : undefined
            }
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
          <section className="relative overflow-hidden rounded-[10px] border border-[rgb(255_255_255/0.08)] bg-[rgb(18_18_18/0.52)]">
            {/* Mobile keeps the view tabs full width, so the period lives in the card. */}
            <label className="absolute right-2 top-2 z-10 lg:hidden">
              <span className="sr-only">Ranking period</span>
              <select
                className="mac-focus h-8 appearance-none rounded-lg border border-[rgb(255_255_255/0.1)] bg-[rgb(23_23_23/0.92)] pl-2.5 pr-7 text-xs font-semibold text-[var(--color-text)]"
                onChange={(event) =>
                  setRankingWindow(event.target.value as RankingWindow)
                }
                value={rankingWindow}
              >
                {rankingWindows.map((window) => (
                  <option key={window.id} value={window.id}>
                    {window.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                size={14}
              />
            </label>
            {/* Visual order is 2nd, 1st, 3rd; empty slots keep 1st centred in small groups. */}
            <div className="grid grid-cols-3 items-end gap-2 border-b border-[rgb(255_255_255/0.08)] px-3 pt-6 sm:gap-4 sm:px-12 sm:pt-7">
              {([1, 0, 2] as const).map((index) => {
                const member = ranking[index];

                return member ? (
                  <PodiumSpot
                    isYou={member.id === (currentUserId ?? "you")}
                    key={member.id}
                    member={member}
                    onSelect={() => setSelectedMemberId(member.id)}
                    place={(index + 1) as 1 | 2 | 3}
                    seconds={getLiveRankingSeconds(member, rankingWindow, now)}
                  />
                ) : (
                  <div aria-hidden key={`empty-${index}`} />
                );
              })}
            </div>

            {ranking.length > 3 ? (
              <PaginatedList
                className="grid px-2 py-1.5 sm:px-3"
                items={ranking.slice(3)}
                pageSize={12}
                renderItem={(member, _index, absoluteIndex) => (
                  <button
                    className="mac-focus grid min-h-[60px] grid-cols-[2.5rem_44px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border-b border-[#34342f] px-1 py-1.5 text-left transition last:border-b-0 hover:bg-[rgb(255_255_255/0.03)] active:scale-[0.99]"
                    key={member.id}
                    onClick={() => setSelectedMemberId(member.id)}
                    type="button"
                  >
                    <span className="text-center font-mono text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
                      #{absoluteIndex + 4}
                    </span>
                    <MemberMascot
                      active={member.studying}
                      className="h-11 w-11"
                      icon={member.personIcon}
                      memberId={member.id}
                    />
                    <RankingIdentity
                      isYou={member.id === (currentUserId ?? "you")}
                      member={member}
                    />
                    <p className="font-mono text-sm font-semibold tabular-nums">
                      {formatDuration(
                        getLiveRankingSeconds(member, rankingWindow, now),
                      )}
                    </p>
                  </button>
                )}
                resetKey={`${selectedGroup.id}:${rankingWindow}`}
              />
            ) : null}
          </section>
        ) : null}

        {pendingJoinLink ? (
          <GroupJoinLinkDialog
            isReady={isLoaded && remoteClient !== null}
            onClose={() => setPendingJoinLink(null)}
            onJoin={() => joinGroupFromLink(pendingJoinLink)}
          />
        ) : null}

        <div className="fixed inset-x-4 bottom-[calc(var(--mobile-nav-height)+0.75rem)] z-20 mx-auto max-w-lg lg:static lg:inset-x-auto lg:max-w-none lg:pt-2">
          <button
            className={cn(
              "mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold shadow-[0_16px_34px_rgb(0_0_0/0.32)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55",
              activeStudySession
                ? "bg-[var(--color-danger)] text-white"
                : "bg-[var(--color-mac-yellow)] text-[#141414]",
            )}
            onClick={() =>
              void (activeStudySession
                ? stopGroupStudy()
                : setIsChoosingStudy(true))
            }
            type="button"
          >
            {activeStudySession ? (
              <Pause aria-hidden fill="currentColor" size={18} />
            ) : (
              <Play aria-hidden size={18} />
            )}
            {activeInSelectedGroup
              ? "Pause study"
              : isStudyingElsewhere
                ? "Stop current session"
                : "Start study"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <section className="hidden grid-cols-3 gap-4 lg:grid">
        <SummaryStat
          label="Groups"
          value={isLoaded ? `${socialState.groups.length}` : "–"}
        />
        <SummaryStat label="Active" value={isLoaded ? `${activeTotal}` : "–"} />
        <SummaryStat
          label="Members"
          value={isLoaded ? `${uniqueMemberCount}` : "–"}
        />
      </section>

      <div className="flex items-center justify-between gap-3">
        {activeTab === "requests" ? (
          <button
            className="mac-focus inline-flex h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--color-text-muted)] transition hover:text-[var(--color-text)]"
            onClick={() => setActiveTab("groups")}
            type="button"
          >
            <ArrowLeft aria-hidden size={16} />
            Groups
          </button>
        ) : (
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            {!isLoaded
              ? "Loading groups…"
              : socialState.groups.length
                ? `${socialState.groups.length} ${socialState.groups.length === 1 ? "group" : "groups"}`
                : "No groups yet"}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            aria-pressed={activeTab === "requests"}
            className={cn(
              "mac-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition hover:bg-[rgb(255_255_255/0.04)]",
              activeTab === "requests"
                ? "text-[var(--color-mac-yellow)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
            )}
            onClick={() => setActiveTab("requests")}
            type="button"
          >
            Requests
            {incomingGroupInvites.length ? (
              <UnreadBadge count={incomingGroupInvites.length} />
            ) : null}
          </button>
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
          {!isLoaded ? (
            <ListSkeleton count={3} label="Loading groups" />
          ) : groupSummaries.length ? (
            <div className="space-y-5">
              {pinnedGroupSummaries.length ? (
                <ListSection icon={Pin} title="Pinned">
                  <div className="grid gap-2 lg:grid-cols-2 lg:gap-3">
                    {pinnedGroupSummaries.map(renderGroupRow)}
                  </div>
                </ListSection>
              ) : null}
              {otherGroupSummaries.length ? (
                <ListSection
                  title={pinnedGroupSummaries.length ? "All groups" : null}
                >
                  <PaginatedList
                    className="grid gap-2 lg:grid-cols-2 lg:gap-3"
                    items={otherGroupSummaries}
                    pageSize={10}
                    renderItem={renderGroupRow}
                    resetKey="groups"
                  />
                </ListSection>
              ) : null}
            </div>
          ) : (
            <EmptyStateCta
              description="A group is a shared space for your study crew: see who's studying right now, race up the leaderboard, and chat."
              mascot="max-arms-up"
              points={[
                { icon: UsersRound, label: "Who's studying now" },
                { icon: Crown, label: "Leaderboard" },
                { icon: MessagesSquare, label: "Group chat" },
              ]}
              title="Study together in a group"
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
            />
          )}
        </section>
      ) : !isLoaded ? (
        <section role="tabpanel">
          <ListSkeleton
            className="grid gap-2"
            count={2}
            label="Loading invitations"
          />
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
            <div className="py-4 text-center">
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

      {pendingJoinLink ? (
        <GroupJoinLinkDialog
          isReady={isLoaded && remoteClient !== null}
          onClose={() => setPendingJoinLink(null)}
          onJoin={() => joinGroupFromLink(pendingJoinLink)}
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

const PODIUM_STYLES = {
  1: {
    mascot: "h-24 w-24 sm:h-[132px] sm:w-[132px]",
    plinth:
      "h-[100px] border-[rgb(255_227_48/0.42)] bg-[rgb(255_227_48/0.14)] sm:h-[132px]",
  },
  2: {
    mascot: "h-20 w-20 sm:h-[104px] sm:w-[104px]",
    plinth:
      "h-20 border-[rgb(255_227_48/0.24)] bg-[rgb(255_227_48/0.08)] sm:h-24",
  },
  3: {
    mascot: "h-[72px] w-[72px] sm:h-24 sm:w-24",
    plinth:
      "h-16 border-[rgb(255_227_48/0.24)] bg-[rgb(255_227_48/0.08)] sm:h-[72px]",
  },
} as const;

function PodiumSpot({
  isYou,
  member,
  onSelect,
  place,
  seconds,
}: {
  isYou: boolean;
  member: SocialFriend;
  onSelect: () => void;
  place: 1 | 2 | 3;
  seconds: number;
}) {
  const style = PODIUM_STYLES[place];

  return (
    <button
      className="mac-focus group flex min-w-0 flex-col items-center rounded-t-lg text-center"
      onClick={onSelect}
      type="button"
    >
      {isYou ? (
        <span className="mb-1 shrink-0 rounded bg-[var(--color-mac-yellow)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#141414]">
          You
        </span>
      ) : null}
      <MemberMascot
        active={member.studying}
        className={cn("relative -mb-1.5", style.mascot)}
        icon={member.personIcon}
        memberId={member.id}
      />
      <RankingIdentity centered isYou={false} member={member} />
      <div
        className={cn(
          "mt-3 flex w-full flex-col items-center gap-1.5 rounded-t-lg border border-b-0 pt-3 sm:gap-2 sm:pt-3.5",
          style.plinth,
        )}
      >
        <span className="flex items-center gap-1.5 font-mono text-base font-bold leading-none tabular-nums text-[var(--color-mac-yellow)] sm:text-xl">
          {place === 1 ? (
            <Crown
              aria-hidden
              className="h-4 w-4 sm:h-5 sm:w-5"
              fill="currentColor"
            />
          ) : null}
          #{place}
        </span>
        <span className="font-mono text-sm font-semibold leading-none tabular-nums sm:text-[15px]">
          {formatDuration(seconds)}
        </span>
      </div>
    </button>
  );
}

function RankingIdentity({
  centered = false,
  isYou,
  member,
}: {
  centered?: boolean;
  isYou: boolean;
  member: SocialFriend;
}) {
  return (
    <div className={cn("min-w-0", centered && "mt-2 w-full")}>
      <p
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-[15px] font-semibold",
          centered && "justify-center",
        )}
      >
        <span className="truncate">{member.name}</span>
        {isYou ? (
          <span className="shrink-0 rounded bg-[var(--color-mac-yellow)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#141414]">
            You
          </span>
        ) : null}
      </p>
      <p
        className={cn(
          "mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--color-text-muted)]",
          centered && "justify-center",
        )}
      >
        {member.studying ? (
          <>
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff7a00]"
            />
            <span className="text-[#ff9a3d]">Studying</span>
          </>
        ) : (
          <span className="truncate">{member.handle}</span>
        )}
      </p>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgb(255_255_255/0.055)] bg-[rgb(255_255_255/0.03)] px-3 py-3 text-center lg:px-4 lg:py-4">
      <p className="text-xl font-semibold tabular-nums lg:text-2xl">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold leading-none text-white">
      {count > 9 ? "9+" : count}
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
  const [linkCopied, setLinkCopied] = useState(false);
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

  async function copyInviteLink() {
    if (!group.inviteCode) return;

    const inviteUrl = `${window.location.origin}/join/group/${encodeURIComponent(
      group.id,
    )}/${encodeURIComponent(group.inviteCode)}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setLinkCopied(true);
      setFeedback(null);
    } catch {
      setFeedback("Could not copy the invite link.");
    }
  }

  return (
    <AppDialog
      bodyClassName="grid gap-3"
      closeLabel="Close group invitations"
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title="Invite people"
    >
      {group.inviteCode ? (
        <div className="mac-muted-panel flex min-w-0 items-center gap-3 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
            <Link2 aria-hidden size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Share join link</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Anyone with this link can join the group.
            </p>
          </div>
          <button
            className="mac-focus inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-xs font-semibold transition hover:bg-[rgb(255_255_255/0.045)]"
            onClick={() => void copyInviteLink()}
            type="button"
          >
            {linkCopied ? (
              <Check aria-hidden size={15} />
            ) : (
              <Copy aria-hidden size={15} />
            )}
            {linkCopied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}

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

function GroupJoinLinkDialog({
  isReady,
  onClose,
  onJoin,
}: {
  isReady: boolean;
  onClose: () => void;
  onJoin: () => void | Promise<void>;
}) {
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (!isReady || isJoining) return;

    setIsJoining(true);
    setError(null);
    try {
      await onJoin();
    } catch (joinError) {
      setError(getErrorMessage(joinError, "This group could not be joined."));
      setIsJoining(false);
    }
  }

  return (
    <AppDialog
      closeLabel="Close group invitation"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            className="mac-focus h-11 rounded-md border border-[var(--color-border)] px-4 text-sm font-semibold"
            disabled={isJoining}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] disabled:opacity-50"
            disabled={!isReady || isJoining}
            onClick={() => void join()}
            type="button"
          >
            {isJoining || !isReady ? (
              <LoaderCircle aria-hidden className="animate-spin" size={16} />
            ) : null}
            {isJoining ? "Joining…" : !isReady ? "Loading…" : "Join group"}
          </button>
        </div>
      }
      maxWidthClassName="max-w-sm"
      onClose={onClose}
      title="Join group"
      variant="confirmation"
    >
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">
        Join this MAC Study group using the shared invite link.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </AppDialog>
  );
}

function GroupMemberDialog({
  canNudge,
  group,
  member,
  nudgeAtLimit,
  now,
  nudgeFeedback,
  onClose,
  onMascotChange,
  onNudge,
  pendingNudges,
  remoteClient,
}: {
  canNudge: boolean;
  group: SocialGroup;
  member: SocialFriend;
  nudgeAtLimit: boolean;
  now: Date;
  nudgeFeedback: string | null;
  onClose: () => void;
  onMascotChange?: (icon: MascotKey) => void;
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
          disabled={!canNudge || member.studying || nudgeAtLimit}
          disabledLabel={
            member.studying
              ? "Studying now"
              : nudgeAtLimit
                ? (nudgeFeedback ?? "Ready soon")
                : undefined
          }
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

      {onMascotChange ? (
        <MascotPicker
          memberId={member.id}
          onChange={onMascotChange}
          value={member.personIcon}
        />
      ) : null}
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
  | { kind: "leave"; willDisband: boolean };

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
  const leaveAvailability = getGroupLeaveAvailability(
    currentRole,
    members.length,
  );
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
      succeeded = await runAction(
        "leave",
        onLeave,
        pendingAction.willDisband ? "Group disbanded." : "You left the group.",
      );
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
            {inviteableFriends.length ? (
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
          <button
            aria-describedby={
              isLeader ? "group-leave-availability-message" : undefined
            }
            className={cn(
              "mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition",
              leaveAvailability.canLeave
                ? "border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[rgb(255_107_107/0.07)] disabled:opacity-45"
                : "cursor-not-allowed border-[var(--color-border)] bg-[rgb(255_255_255/0.025)] text-[var(--color-text-muted)]",
            )}
            disabled={!leaveAvailability.canLeave || busyKey !== null}
            onClick={() =>
              setPendingAction({
                kind: "leave",
                willDisband: leaveAvailability.willDisband,
              })
            }
            type="button"
          >
            <LogOut aria-hidden size={16} /> Leave group
          </button>
          {leaveAvailability.requiresOwnershipTransfer ? (
            <p
              className="text-xs leading-5 text-[var(--color-text-muted)]"
              id="group-leave-availability-message"
            >
              Transfer ownership before leaving.
            </p>
          ) : leaveAvailability.willDisband ? (
            <p
              className="text-xs leading-5 text-[var(--color-text-muted)]"
              id="group-leave-availability-message"
            >
              Leaving will disband this group.
            </p>
          ) : null}
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
  const willDisband = action.kind === "leave" && action.willDisband;
  const title =
    action.kind === "role"
      ? action.nextRole === "admin"
        ? "Make moderator?"
        : "Make member?"
      : action.kind === "leadership"
        ? "Transfer leadership?"
        : action.kind === "remove"
          ? "Remove from group?"
          : willDisband
            ? "Disband group?"
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
          : willDisband
            ? "You are the last member. Leaving will permanently remove the group and its chat history."
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
          : willDisband
            ? "Leave and disband"
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
  const switchId = useId();

  return (
    <label
      className="flex min-h-12 w-full cursor-pointer items-center gap-3 border-b border-[var(--color-border)] px-3 last:border-b-0"
      htmlFor={switchId}
    >
      <span className="text-[var(--color-mac-yellow)]">{icon}</span>
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      <Switch
        checked={enabled}
        disabled={saving}
        id={switchId}
        onCheckedChange={onToggle}
      />
    </label>
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

function MemberMascot({
  active,
  className,
  icon,
  memberId,
}: {
  active: boolean;
  className?: string;
  icon: string;
  memberId: string;
}) {
  const src = getMascotSrc(resolveMascot(icon, memberId));

  return (
    <span
      aria-hidden
      className={cn(
        "mac-mascot relative mx-auto block transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none",
        className ?? "h-24 w-24 sm:h-28 sm:w-28 lg:h-32 lg:w-32",
      )}
      data-active={active}
    >
      <Image
        alt=""
        className="h-full w-full"
        height={128}
        src={src}
        width={128}
      />
    </span>
  );
}

function MascotPicker({
  memberId,
  onChange,
  value,
}: {
  memberId: string;
  onChange: (key: MascotKey) => void;
  value: string;
}) {
  const selected = resolveMascot(value, memberId);

  return (
    <fieldset className="mt-5">
      <legend className="text-sm font-semibold">Your mascot</legend>
      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
        Shown to everyone in your groups.
      </p>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {MASCOT_KEYS.map((key) => {
          const isSelected = key === selected;

          return (
            <button
              aria-label={key.replace(/-/g, " ")}
              aria-pressed={isSelected}
              className={cn(
                "mac-focus rounded-lg border p-1 transition active:scale-95",
                isSelected
                  ? "border-[var(--color-mac-yellow)] bg-[rgb(255_227_48/0.08)]"
                  : "border-[rgb(255_255_255/0.06)] hover:border-[rgb(255_255_255/0.16)] hover:bg-[rgb(255_255_255/0.035)]",
              )}
              key={key}
              onClick={() => onChange(key)}
              type="button"
            >
              <Image
                alt=""
                className="h-full w-full"
                height={56}
                src={getMascotSrc(key)}
                width={56}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function applySelfStudyOverride(
  friend: SocialFriend,
  override:
    | { studying: true; startedAt: string }
    | { studying: false; at: string }
    | null,
): SocialFriend {
  if (!override || friend.studying === override.studying) return friend;

  if (override.studying) {
    return {
      ...friend,
      activeStartedAt: override.startedAt,
      activeUpdatedAt: override.startedAt,
      studying: true,
    };
  }

  // Bake the live seconds in so the time doesn't drop until the server catches up.
  const stoppedAt = new Date(override.at);
  return {
    ...friend,
    daySeconds: getLiveRankingSeconds(friend, "day", stoppedAt),
    monthSeconds: getLiveRankingSeconds(friend, "month", stoppedAt),
    studying: false,
    weekSeconds: getLiveRankingSeconds(friend, "week", stoppedAt),
  };
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
