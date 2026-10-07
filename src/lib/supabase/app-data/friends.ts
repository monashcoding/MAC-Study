import type { AppSupabaseClient as SupabaseClient } from "../types";
import type { PersonIconKey } from "@/lib/social-state";
import { invalidateRemoteCachesForTable } from "@/lib/client-cache";
import { getRemoteUserId, getResponseError } from "./shared";

export async function updateRemoteStudyIcon({
  icon,
  supabase,
  userId,
}: {
  icon: PersonIconKey;
  supabase: SupabaseClient;
  userId: string;
}) {
  const currentUserId = await getRemoteUserId();

  if (!currentUserId || currentUserId !== userId) {
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ study_icon: icon })
    .eq("id", userId);

  if (error) {
    throw error;
  }

  invalidateRemoteCachesForTable("profiles");
}

export async function addRemoteFriend({
  friendId,
}: {
  friendId: string;
  supabase: SupabaseClient;
}) {
  return sendRemoteFriendRequest(friendId);
}

export async function sendRemoteFriendRequest(friendId: string) {
  const response = await fetch("/api/friends/requests", {
    body: JSON.stringify({ recipientId: friendId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }

  invalidateRemoteCachesForTable("friend_requests");
}

export async function updateRemoteFriendRequest({
  action,
  requestId,
}: {
  action: "accept" | "cancel" | "decline";
  requestId: string;
}) {
  const response = await fetch("/api/friends/requests", {
    body: JSON.stringify({ action, requestId }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }

  invalidateRemoteCachesForTable("friend_requests");
}

export async function removeRemoteFriend({
  friendId,
  supabase,
}: {
  friendId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("remove_friend", {
    target_user_id: friendId,
  });

  if (error) {
    throw error;
  }

  invalidateRemoteCachesForTable("friendships");
}

export async function fetchRemoteDirectMessageUnreadCount({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const { count, error } = await supabase
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) throw error;

  return count ?? 0;
}

export async function setRemoteFriendFavourite({
  favourite,
  friendId,
  supabase,
}: {
  favourite: boolean;
  friendId: string;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();
  if (!userId) return;

  const { error } = favourite
    ? await supabase
        .from("user_favourite_friends")
        .upsert(
          { friend_id: friendId, user_id: userId },
          { ignoreDuplicates: true, onConflict: "user_id,friend_id" },
        )
    : await supabase
        .from("user_favourite_friends")
        .delete()
        .eq("user_id", userId)
        .eq("friend_id", friendId);

  if (error) throw error;

  invalidateRemoteCachesForTable("user_favourite_friends");
}
