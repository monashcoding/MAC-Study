# Route map

All pages use the root layout. `/app/**` pages additionally use `src/app/(app)/layout.tsx` and `AppShell`.

| URL | Entry | Primary UI |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | Redirects to `/app` |
| `/app` | `src/app/(app)/app/page.tsx` | `TimerDashboard` |
| `/app/groups` | `src/app/(app)/app/groups/page.tsx` | `GroupsDashboard`, `GroupChat` |
| `/app/friends` | `src/app/(app)/app/friends/page.tsx` | `FriendsDashboard` |
| `/app/units` | `src/app/(app)/app/units/page.tsx` | `UnitsDashboard` |
| `/app/statistics` | `src/app/(app)/app/statistics/page.tsx` | `StatisticsDashboard` |
| `/app/profile` | `src/app/(app)/app/profile/page.tsx` | `ProfileDashboard` |
| `/app/leaderboards` | `src/app/(app)/app/leaderboards/page.tsx` | Legacy standalone leaderboard |
| `/app/subjects` | `src/app/(app)/app/subjects/page.tsx` | Legacy standalone subject breakdown |
| `/app/friends/units` | `src/app/(app)/app/friends/units/page.tsx` | Redirects to `/app/units` |
| `/auth/login` | `src/app/(auth)/auth/login/page.tsx` | Login and SSO provider choice |
| `/auth/profile` | `src/app/(auth)/auth/profile/page.tsx` | Required name and username setup |
| `/auth/access` | `src/app/(auth)/auth/access/page.tsx` | Invite-code access gate |
| `/auth/logout` | `src/app/(auth)/auth/logout/page.tsx` | Sign-out progress |

Primary mobile navigation: Home, Group, Friends, Units, Stats, Profile.

