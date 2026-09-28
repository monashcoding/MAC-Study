import type { AppSupabaseClient as SupabaseClient } from "../types";
import type { GroupRole } from "@/lib/social-state";
import { invalidateRemoteCachesForTable } from "@/lib/client-cache";
import { getResponseError } from "./shared";

export async function createRemoteGroup({
  name,
  supabase,
}: {
  name: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("create_study_group", {
    group_icon: "users",
    group_name: name,
  });

  if (error) {
    throw error;
  }

  invalidateRemoteCachesForTable("groups");
  return data as string | null;
}

export async function updateRemoteGroupDetails({
  groupId,
  name,
  supabase,
}: {
  groupId: string;
  name: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("groups")
    .update({
      icon: "users",
      name,
      visibility: "invite_only",
    })
    .eq("id", groupId);

  if (error) {
    throw error;
  }

  invalidateRemoteCachesForTable("groups");
}

export async function setRemoteGroupMemberRole({
  groupId,
  role,
  supabase,
  userId,
}: {
  groupId: string;
  role: Exclude<GroupRole, "owner">;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { error } = await supabase.rpc("set_group_member_role", {
    target_group_id: groupId,
    target_user_id: userId,
    new_role: role,
  });

  if (error) throw error;
  invalidateRemoteCachesForTable("group_members");
}

export async function transferRemoteGroupLeadership({
  groupId,
  supabase,
  userId,
}: {
  groupId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { error } = await supabase.rpc("transfer_group_leadership", {
    target_group_id: groupId,
    target_user_id: userId,
  });

  if (error) throw error;
  invalidateRemoteCachesForTable("group_members");
}

export async function removeRemoteGroupMember({
  groupId,
  supabase,
  userId,
}: {
  groupId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { error } = await supabase.rpc("remove_group_member", {
    target_group_id: groupId,
    target_user_id: userId,
  });

  if (error) throw error;
  invalidateRemoteCachesForTable("group_members");
}

export async function leaveRemoteGroup({ groupId }: { groupId: string }) {
  const response = await fetch("/api/groups/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId }),
  });

  if (!response.ok) throw new Error(await getResponseError(response));

  const body = (await response.json()) as {
    outcome: "disbanded" | "left";
  };

  invalidateRemoteCachesForTable("group_members");
  return body.outcome;
}

export async function inviteRemoteFriendToGroup({
  friendId,
  groupId,
  supabase: _supabase,
}: {
  friendId: string;
  groupId: string;
  supabase: SupabaseClient;
}) {
  void _supabase;

  const response = await fetch("/api/groups/invites", {
    body: JSON.stringify({ friendId, groupId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.message ?? "Could not send that group invitation.");
  }

  invalidateRemoteCachesForTable("group_invites");
}

export async function joinRemoteGroupByLink({
  code,
  groupId,
  supabase,
}: {
  code: string;
  groupId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("join_group_by_link", {
    group_invite_code: code,
    target_group_id: groupId,
  });

  if (error) {
    if (error.message.includes("GROUP_JOIN_BLOCKED")) {
      throw new Error("You cannot rejoin this group.");
    }

    throw new Error("This invite link is invalid or has expired.");
  }

  if (typeof data !== "string") {
    throw new Error("This invite link is invalid or has expired.");
  }

  invalidateRemoteCachesForTable("group_members");
  return data;
}

export async function updateRemoteGroupInvite({
  action,
  requestId,
}: {
  action: "accept" | "cancel" | "decline";
  requestId: string;
}) {
  const response = await fetch("/api/groups/invites", {
    body: JSON.stringify({ action, requestId }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }

  invalidateRemoteCachesForTable("group_invites");
}
