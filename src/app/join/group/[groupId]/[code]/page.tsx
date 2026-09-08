import { redirect } from "next/navigation";
import { getAppAuthState } from "@/lib/auth/app-auth";

type JoinGroupPageProps = {
  params: Promise<{
    code: string;
    groupId: string;
  }>;
};

export default async function JoinGroupPage({ params }: JoinGroupPageProps) {
  const { code, groupId } = await params;
  const normalizedCode = code.trim().toUpperCase();
  const normalizedGroupId = groupId.trim().toLowerCase();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalizedGroupId,
    ) ||
    !/^[a-z0-9_-]{6,128}$/i.test(normalizedCode)
  ) {
    redirect("/app/groups");
  }

  const nextPath = `/app/groups?joinGroup=${encodeURIComponent(
    normalizedGroupId,
  )}&joinCode=${encodeURIComponent(normalizedCode)}`;

  await getAppAuthState(nextPath);
  redirect(nextPath);
}
