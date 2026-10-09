import type {
  AppSupabaseClient as SupabaseClient,
  Database,
  Tables,
} from "../types";
import {
  type SpecialUnit,
  type TeachingPeriod,
  type UnitCohortMember,
  type UnitEnrollment,
  uniqueUnitSuggestions,
  type UnitLeaderboardEntry,
} from "@/lib/units";
import { invalidateRemoteCachesForTable } from "@/lib/client-cache";
import { getRemoteUserId } from "./shared";
import type { RemoteSubject, RemoteUnitState } from "./types";

type SubjectRow = Pick<
  Tables<"subjects">,
  "code" | "color" | "id" | "name" | "unit_offering_id"
>;

export type UnitEnrollmentRow = {
  joined_at: string;
  nickname: string | null;
  offering_id: string;
  unit_offerings:
    | {
        id: string;
        study_year: number;
        teaching_period: TeachingPeriod;
        unit_id: string;
        units: { code: string; id: string } | { code: string; id: string }[];
      }
    | {
        id: string;
        study_year: number;
        teaching_period: TeachingPeriod;
        unit_id: string;
        units: { code: string; id: string } | { code: string; id: string }[];
      }[];
};

type UnitCohortResult =
  Database["public"]["Functions"]["get_unit_cohort_page"]["Returns"][number];

type UnitCohortRow = Omit<
  UnitCohortResult,
  | "display_name"
  | "friend_request_direction"
  | "friend_request_id"
  | "profile_color"
  | "shared_group_ids"
  | "study_icon"
  | "username"
> & {
  display_name: string | null;
  friend_request_direction: string | null;
  friend_request_id: string | null;
  profile_color: string | null;
  shared_group_ids: string[] | null;
  study_icon: string | null;
  username: string | null;
};

type UnitCohortCountRow =
  Database["public"]["Functions"]["get_my_unit_cohort_counts"]["Returns"][number];

export async function saveRemoteSubjects({
  subjects,
  supabase,
}: {
  subjects: RemoteSubject[];
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();

  if (!userId) {
    return subjects;
  }

  const savedSubjects: RemoteSubject[] = [];
  const linkChanges: {
    offeringId: string | null;
    subjectId: string;
  }[] = [];

  for (const subject of subjects) {
    if (isUuid(subject.id)) {
      const { data, error } = await supabase
        .from("subjects")
        .update({
          code: subject.unitOfferingId
            ? (subject.canonicalCode ?? subject.name)
            : subject.name,
          name: subject.name,
          color: subject.color,
          archived_at: null,
        })
        .eq("id", subject.id)
        .eq("user_id", userId)
        .select("id, code, name, color, unit_offering_id")
        .single<SubjectRow>();

      if (error) {
        throw error;
      }

      savedSubjects.push(subjectFromRow(data));
      if (subject.unitOfferingId !== undefined) {
        linkChanges.push({
          offeringId: subject.unitOfferingId,
          subjectId: data.id,
        });
      }
    } else {
      const { data, error } = await supabase
        .from("subjects")
        .insert({
          user_id: userId,
          code: subject.name,
          name: subject.name,
          color: subject.color,
        })
        .select("id, code, name, color, unit_offering_id")
        .single<SubjectRow>();

      if (error) {
        throw error;
      }

      savedSubjects.push(subjectFromRow(data));
      if (subject.unitOfferingId !== undefined) {
        linkChanges.push({
          offeringId: subject.unitOfferingId,
          subjectId: data.id,
        });
      }
    }
  }

  const keptIds = savedSubjects.map((subject) => subject.id);

  if (keptIds.length) {
    const { error } = await supabase
      .from("subjects")
      .update({
        archived_at: new Date().toISOString(),
        unit_offering_id: null,
      })
      .eq("user_id", userId)
      .not("id", "in", `(${keptIds.join(",")})`);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await supabase
      .from("subjects")
      .update({
        archived_at: new Date().toISOString(),
        unit_offering_id: null,
      })
      .eq("user_id", userId)
      .is("archived_at", null);

    if (error) {
      throw error;
    }
  }

  for (const change of linkChanges) {
    await setRemoteSubjectUnitOffering({
      offeringId: change.offeringId,
      subjectId: change.subjectId,
      supabase,
    });
  }

  invalidateRemoteCachesForTable("subjects");
  return fetchRemoteSubjects(supabase, userId);
}

export async function fetchRemoteUnitState(
  supabase: SupabaseClient,
): Promise<RemoteUnitState | null> {
  const userId = await getRemoteUserId();

  if (!userId) {
    return null;
  }

  const [
    enrolmentsResult,
    unitsResult,
    subjectRows,
    specialUnitsResult,
    specialUnitAliasesResult,
    cohortCountsResult,
  ] = await Promise.all([
    supabase
      .from("unit_enrolments")
      .select(
        "offering_id, nickname, joined_at, unit_offerings!inner(id, unit_id, study_year, teaching_period, units!inner(id, code))",
      )
      .eq("user_id", userId)
      .is("left_at", null)
      .order("joined_at", { ascending: false }),
    supabase.from("units").select("id, code").order("code").limit(500),
    fetchRemoteSubjectRows(supabase, userId),
    supabase
      .from("special_units")
      .select("code, name, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("special_unit_aliases")
      .select("alias_code, special_unit_code")
      .order("alias_code", { ascending: true }),
    supabase.rpc("get_my_unit_cohort_counts"),
  ]);

  if (enrolmentsResult.error) throw enrolmentsResult.error;
  if (unitsResult.error) throw unitsResult.error;

  const cohortCounts = new Map(
    ((cohortCountsResult.data ?? []) as UnitCohortCountRow[]).map((row) => [
      row.offering_id,
      Math.max(1, Number(row.member_count) || 1),
    ]),
  );
  const enrollments = ((enrolmentsResult.data ?? []) as UnitEnrollmentRow[])
    .map(unitEnrollmentFromRow)
    .filter((value): value is UnitEnrollment => Boolean(value))
    .map((enrollment) => ({
      ...enrollment,
      memberCount: cohortCounts.get(enrollment.offeringId) ?? 1,
    }));
  const subjectSuggestions = subjectRows.map((subject) => ({
    code: subject.code,
    nickname:
      subject.name && subject.name.toUpperCase() !== subject.code.toUpperCase()
        ? subject.name
        : null,
  }));
  const catalogueSuggestions = (
    (unitsResult.data ?? []) as { code: string }[]
  ).map((unit) => ({ code: unit.code, nickname: null }));
  const specialUnitAliases = specialUnitAliasesResult.error
    ? []
    : ((specialUnitAliasesResult.data ?? []) as {
        alias_code: string;
        special_unit_code: string;
      }[]);
  const specialUnits = specialUnitsResult.error
    ? []
    : (
        (specialUnitsResult.data ?? []) as Omit<SpecialUnit, "aliasCodes">[]
      ).map((unit) => ({
        ...unit,
        aliasCodes: specialUnitAliases
          .filter((alias) => alias.special_unit_code === unit.code)
          .map((alias) => alias.alias_code),
      }));

  return {
    enrollments,
    specialUnits,
    subjects: subjectRows.map(subjectFromRow),
    suggestions: uniqueUnitSuggestions([
      ...subjectSuggestions,
      ...catalogueSuggestions,
    ]),
  };
}

export async function setRemoteSubjectUnitOffering({
  offeringId,
  subjectId,
  supabase,
}: {
  offeringId: string | null;
  subjectId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("set_subject_unit_offering", {
    ...(offeringId ? { input_offering_id: offeringId } : {}),
    input_subject_id: subjectId,
  });

  if (error) {
    throw error;
  }

  invalidateRemoteCachesForTable("subjects");
  return Boolean(data);
}

// Create a single subject and link it to a unit offering, for "Create a
// subject for me" when linking a unit to the timer.
export async function createRemoteSubjectForUnit({
  color,
  name,
  offeringId,
  supabase,
}: {
  color: string;
  name: string;
  offeringId: string;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();
  if (!userId) throw new Error("Sign in to create a subject.");

  const { data, error } = await supabase
    .from("subjects")
    .insert({ code: name, color, name, user_id: userId })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;

  await setRemoteSubjectUnitOffering({
    offeringId,
    subjectId: data.id,
    supabase,
  });
  return data.id;
}

export async function upsertRemoteUnitEnrollment({
  code,
  nickname,
  period,
  supabase,
  year,
}: {
  code: string;
  nickname: string | null;
  period: TeachingPeriod;
  supabase: SupabaseClient;
  year: number;
}) {
  const { data, error } = await supabase.rpc("upsert_unit_enrolment", {
    ...(nickname ? { input_nickname: nickname } : {}),
    input_study_year: year,
    input_teaching_period: period,
    input_unit_code: code,
  });

  if (error) {
    throw error;
  }

  invalidateRemoteCachesForTable("unit_enrolments");
  return data as string;
}

export async function requestRemoteSpecialUnit({
  code,
  comment,
  name,
  supabase,
}: {
  code: string | null;
  comment: string | null;
  name: string;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();

  if (!userId) {
    throw new Error("Sign in to request a unit.");
  }

  const { error } = await supabase.from("special_unit_requests").insert({
    requester_id: userId,
    unit_code: code,
    unit_name: name,
    comment,
  });

  if (error) {
    throw error;
  }
}

export async function leaveRemoteUnitEnrollment({
  offeringId,
  supabase,
}: {
  offeringId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("leave_unit_enrolment", {
    input_offering_id: offeringId,
  });

  if (error) {
    throw error;
  }

  invalidateRemoteCachesForTable("unit_enrolments");
  return Boolean(data);
}

export const UNIT_COHORT_PAGE_SIZE = 30;

export async function fetchRemoteUnitCohortPage({
  friendsOnly,
  offeringId,
  offset,
  query,
  supabase,
}: {
  friendsOnly: boolean;
  offeringId: string;
  offset: number;
  query: string;
  supabase: SupabaseClient;
}): Promise<{ hasMore: boolean; members: UnitCohortMember[] }> {
  const trimmedQuery = query.trim();
  // Ask for one extra row to know whether another page exists.
  const { data, error } = await supabase.rpc("get_unit_cohort_page", {
    friends_only: friendsOnly,
    input_offering_id: offeringId,
    result_limit: UNIT_COHORT_PAGE_SIZE + 1,
    result_offset: offset,
    ...(trimmedQuery ? { search_query: trimmedQuery } : {}),
  });

  if (error) throw error;

  const rows = (data ?? []) as UnitCohortRow[];

  return {
    hasMore: rows.length > UNIT_COHORT_PAGE_SIZE,
    members: rows.slice(0, UNIT_COHORT_PAGE_SIZE).map((member) => ({
      color: member.profile_color || "#FFE330",
      displayName: member.display_name || member.username || "Student",
      friendRequest:
        member.friend_request_direction === "incoming" ||
        member.friend_request_direction === "outgoing"
          ? member.friend_request_direction
          : null,
      friendRequestId: member.friend_request_id,
      handle: member.username ? `@${member.username}` : "@student",
      id: member.user_id,
      isFriend: member.is_friend,
      mutualFriendCount: Number(member.mutual_friend_count) || 0,
      sharedGroupIds: member.shared_group_ids ?? [],
      studyIcon: member.study_icon || "flame-desk",
    })),
  };
}

export async function fetchRemoteSubjects(
  supabase: SupabaseClient,
  userId: string,
) {
  return (await fetchRemoteSubjectRows(supabase, userId)).map(subjectFromRow);
}

async function fetchRemoteSubjectRows(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data: existing, error: fetchError } = await supabase
    .from("subjects")
    .select("id, code, name, color, unit_offering_id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (fetchError) {
    throw fetchError;
  }

  return (existing ?? []) as SubjectRow[];
}

function subjectFromRow(row: SubjectRow): RemoteSubject {
  return {
    id: row.id,
    name: row.name || row.code,
    color: row.color || "#FFE330",
    canonicalCode: row.unit_offering_id ? row.code : undefined,
    unitOfferingId: row.unit_offering_id ?? null,
  };
}

export function unitEnrollmentFromRow(row: UnitEnrollmentRow) {
  const offering = firstRelation(row.unit_offerings);
  const unit = offering ? firstRelation(offering.units) : null;

  if (!offering || !unit) {
    return null;
  }

  return {
    code: unit.code,
    joinedAt: row.joined_at,
    memberCount: 1,
    nickname: row.nickname,
    offeringId: offering.id,
    period: offering.teaching_period,
    unitId: offering.unit_id,
    year: offering.study_year,
  } satisfies UnitEnrollment;
}

function firstRelation<T>(value: T | T[]) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function fetchRemoteUnitWeeklyLeaderboard({
  offeringId,
  supabase,
}: {
  offeringId: string;
  supabase: SupabaseClient;
}): Promise<UnitLeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_unit_weekly_leaderboard", {
    input_offering_id: offeringId,
  });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.user_id,
    name: row.display_name || row.username || "Student",
    studyIcon: row.study_icon,
    weekSeconds: Number(row.week_seconds) || 0,
  }));
}
