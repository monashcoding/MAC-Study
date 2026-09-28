import type { SocialFriend, SocialState } from "@/lib/social-state";
import type {
  SpecialUnit,
  UnitEnrollment,
  UnitSuggestion,
} from "@/lib/units";

export type RemoteSubject = {
  id: string;
  name: string;
  color: string;
  canonicalCode?: string;
  unitOfferingId?: string | null;
};

export type RemoteUnitState = {
  enrollments: UnitEnrollment[];
  specialUnits: SpecialUnit[];
  subjects: RemoteSubject[];
  suggestions: UnitSuggestion[];
};

export type RemoteActiveSession = {
  subjectId: string | null;
  groupId?: string | null;
  reminderIntervalMinutes?: number | null;
  startedAt: string;
};

export type RemoteStoredSession = {
  id: string;
  subjectId: string | null;
  groupId?: string | null;
  startedAt: string;
  endedAt: string;
  status: "completed" | "needs_confirmation";
  source: "manual_adjustment" | "timer";
};

export type RemoteTimerState = {
  subjects: RemoteSubject[];
  unitEnrollments: UnitEnrollment[];
  activeSession: RemoteActiveSession | null;
  sessions: RemoteStoredSession[];
};

export type RemoteSocialSnapshot = {
  socialState: SocialState;
  availableFriends: RemoteFriendCandidate[];
  friendRequests: RemoteFriendRequest[];
  groupInvites: RemoteGroupInvite[];
  superNudges: RemoteSuperNudge[];
  currentUserId: string;
};

export type RemoteFriendCandidate = SocialFriend & {
  mutualFriendCount: number;
  requestDirection: "incoming" | "outgoing" | null;
};

export type RemoteFriendRequest = {
  createdAt: string;
  direction: "incoming" | "outgoing";
  id: string;
  user: SocialFriend;
};

export type RemoteGroupInvite = {
  createdAt: string;
  direction: "incoming" | "outgoing";
  group: {
    id: string;
    name: string;
  };
  id: string;
  user: SocialFriend;
};

export type RemoteSuperNudge = {
  createdAt: string;
  direction: "incoming" | "outgoing";
  friendId: string;
  id: string;
  status: "active" | "pending";
};

export type RemoteNotificationPreferences = {
  friendNotifications: boolean;
  nudgeNotifications: boolean;
  otherNotifications: boolean;
};

export type RemoteGroupNotificationSettings = {
  chatMuted: boolean;
  nudgesMuted: boolean;
};

export type RemoteAppNotification = {
  body: string;
  createdAt: string;
  entityId: string | null;
  id: string;
  title: string;
  type: "friend_accepted" | "friend_request" | "other";
};

export type RemoteGroupChatMessage = {
  id: string;
  groupId: string;
  userId: string;
  body: string;
  createdAt: string;
  imagePath?: string | null;
  imageUrl?: string | null;
  replyToId?: string | null;
};

export type RemoteGroupChatPage = {
  hasMore: boolean;
  messages: RemoteGroupChatMessage[];
};

export type RemoteNudgeNotification = {
  id: string;
  groupId: string | null;
  message: string;
  senderId: string;
  createdAt: string;
};

export type RemoteNudgeDelivery = {
  sent: number;
  skipped?:
    | "disabled"
    | "no_subscriptions"
    | "push_not_configured"
    | "subscriptions_unavailable";
};
