# Key page dependency trees

## `/app` — study timer

- `src/app/(app)/app/page.tsx`
  - `src/components/timer/timer-dashboard.tsx`
    - `src/components/study/start-study-dialog.tsx`
    - `src/lib/demo-data.ts`
    - `src/lib/supabase/app-data.ts`
    - `src/lib/supabase/browser.ts`
    - `src/lib/timer.ts`
    - `src/lib/utils.ts`
  - `src/components/app-shell.tsx`
    - `src/components/app-workspace.tsx`
    - `src/components/app-header-detail.tsx`
    - `src/components/social/nudge-notifications.tsx`

## `/app/groups` — groups, rankings, chat, settings

- `src/app/(app)/app/groups/page.tsx`
  - `src/components/groups/groups-dashboard.tsx` (1797 lines; pass only the active render ranges)
    - `src/components/groups/group-chat.tsx`
    - `src/components/social/nudge-pill.tsx`
    - `src/components/social/use-nudge-queue.ts`
    - `src/components/study/start-study-dialog.tsx`
    - `src/components/app-header-detail.tsx`
    - `src/lib/social-state.ts`
    - `src/lib/supabase/app-data.ts`
    - `src/lib/supabase/browser.ts`
    - `src/lib/timer.ts`
    - `src/lib/utils.ts`
  - shared `AppShell` tree

## `/app/friends`

- `src/app/(app)/app/friends/page.tsx`
  - `src/components/friends/friends-dashboard.tsx`
    - `src/components/social/nudge-pill.tsx`
    - `src/components/social/use-nudge-queue.ts`
    - `src/lib/social-state.ts`
    - `src/lib/supabase/app-data.ts`
    - `src/lib/supabase/browser.ts`
    - `src/lib/timer.ts`
    - `src/lib/utils.ts`
  - shared `AppShell` tree

## `/app/units`

- `src/app/(app)/app/units/page.tsx`
  - `src/components/units/units-dashboard.tsx` (940 lines; pass relevant render ranges)
    - `src/components/app-header-detail.tsx`
    - `src/lib/supabase/app-data.ts`
    - `src/lib/supabase/browser.ts`
    - `src/lib/units.ts`
    - `src/lib/utils.ts`
  - shared `AppShell` tree

## `/app/statistics`

- `src/app/(app)/app/statistics/page.tsx`
  - `src/components/statistics/statistics-dashboard.tsx`
    - `src/lib/demo-data.ts`
    - `src/lib/supabase/app-data.ts`
    - `src/lib/supabase/browser.ts`
    - `src/lib/timer.ts`
  - shared `AppShell` tree

## `/app/profile`

- `src/app/(app)/app/profile/page.tsx`
  - `src/components/profile/profile-dashboard.tsx`
    - `src/components/pwa/push-notification-settings.tsx`
  - shared `AppShell` tree

## `/auth/login`

- `src/app/(auth)/auth/login/page.tsx`
  - `src/components/auth/login-form.tsx`
  - `src/lib/auth/safe-next-path.ts`
  - `src/lib/auth/server-session.ts`

## `/auth/profile`

- `src/app/(auth)/auth/profile/page.tsx`
  - `src/app/(auth)/auth/profile/actions.ts`
  - `src/lib/auth/safe-next-path.ts`
  - `src/lib/auth/server-session.ts`
  - `src/lib/supabase/profile.ts`
  - `src/lib/supabase/server.ts`

## `/auth/access`

- `src/app/(auth)/auth/access/page.tsx`
  - `src/app/(auth)/auth/access/actions.ts`
  - `src/lib/auth/app-auth.ts`
  - `src/lib/auth/safe-next-path.ts`

