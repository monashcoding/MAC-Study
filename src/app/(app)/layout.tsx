import { AppShell } from "@/components/app-shell";
import { getAppAuthState } from "@/lib/auth/app-auth";

export default async function MainAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authState = await getAppAuthState("/app");

  return <AppShell authState={authState}>{children}</AppShell>;
}
