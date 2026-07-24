# Shared layouts

## Root layout

Path: `src/app/layout.tsx`

```tsx
import type { Metadata, Viewport } from "next";
import { PwaLaunchScreen } from "@/components/pwa/pwa-launch-screen";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#171717",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaLaunchScreen />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
```

## Authenticated app layout

Path: `src/app/(app)/layout.tsx`

```tsx
import { AppShell } from "@/components/app-shell";
import { getAppAuthState } from "@/lib/auth/app-auth";

export default async function MainAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authState = await getAppAuthState("/app");
  return <AppShell authState={authState}>{children}</AppShell>;
}
```

## AppShell

Path: `src/components/app-shell.tsx`

The shared shell is a responsive PWA frame. Desktop uses a left navigation rail, fixed header, and scrollable content. Mobile uses a compact top header, a scrollable content region, and a six-item fixed bottom navigation. It controls account menus, navigation transitions, keyboard viewport sizing, chat/nav suppression, nudge notifications, and contextual header details.

Key shell dependencies:

- `src/components/app-workspace.tsx`
- `src/components/app-header-detail.tsx`
- `src/components/social/nudge-notifications.tsx`
- `src/lib/utils.ts`

The complete implementation remains in `src/components/app-shell.tsx` (523 lines) and should be passed in full to design commands because it is below the 900-line threshold.

## AppWorkspace

Path: `src/components/app-workspace.tsx`

The workspace keeps all six primary dashboards mounted and toggles them using `hidden`/`block`, allowing fast tab switching while preserving local UI state:

```tsx
const workspaceViews = [
  { href: "/app", id: "home" },
  { href: "/app/groups", id: "groups" },
  { href: "/app/friends", id: "friends" },
  { href: "/app/units", id: "units" },
  { href: "/app/statistics", id: "statistics" },
  { href: "/app/profile", id: "profile" },
] as const;
```

