# MAC Study - Product Summary and PRD

Last updated: 2026-06-04

## 1. Product Summary

MAC Study is a mobile-first progressive web app for Monash Association of Coding students to track study time, study with friends, and compete in lightweight group leaderboards.

For the MVP, MAC Study is scoped to the MAC community. The app can scale later to broader Monash or public study groups, but the first version should feel like a MAC-built space for MAC members.

The core experience is simple:

1. A user opens MAC Study.
2. They choose a subject, such as `FIT3159` or `FIT3077`.
3. If they want the session to count toward a group leaderboard, they start from a group or select a group context.
4. They tap Start Study.
5. The session keeps counting even if the app is closed, the phone is locked, or the browser is suspended.
6. When they return and tap Stop, the app logs the session under that subject and, if selected, that group.

The app should feel like a native mobile app when installed to the home screen, while staying web-first so it can be built from Windows and used by both iPhone and Android users.

The visual identity should be dark, sharp, and club-branded:

```css
:root {
  --color-background: #252525;
  --color-mac-yellow: #FFE330;
}
```

Recommended supporting colors:

```css
:root {
  --color-surface: #303030;
  --color-surface-raised: #3A3A3A;
  --color-border: #484848;
  --color-text: #F7F7F2;
  --color-text-muted: #B8B8B0;
  --color-success: #42D392;
  --color-danger: #FF6B6B;
  --color-info: #6CB6FF;
}
```

Use yellow as the main accent for primary actions, active timers, ranks, progress rings, and key highlights. Avoid making every element yellow; the app should read as black/charcoal with confident yellow accents.

## 2. Recommended Stack

### Recommended MVP Stack

- Framework: Next.js App Router
- Language: TypeScript
- UI: React
- Styling: Tailwind CSS
- Component base: shadcn/ui or Radix UI primitives with custom MAC styling
- Icons: lucide-react
- Database: Supabase Postgres
- Auth: Supabase Auth
- Realtime: Supabase Realtime
- Push notifications: Web Push with VAPID keys and a service worker
- Hosting: Vercel for the Next.js app
- Backend logic: Next.js Server Actions and/or Route Handlers
- Validation: Zod
- Dates: date-fns or Day.js
- Charts: Recharts or Tremor-style custom chart components
- Testing: Vitest for unit tests, Playwright for end-to-end PWA/user-flow tests

### Why Supabase Postgres

Supabase is the best fit for this app because MAC Study needs relational data, auth, permissions, group membership rules, realtime updates, and eventually chat. Supabase gives you a hosted Postgres database, Auth, Realtime database changes, and Row Level Security in one platform.

For the MVP, use Supabase generated TypeScript types and SQL migrations. You do not need Prisma at the start. Add Drizzle or Prisma later only if server-side query complexity grows.

### Why Web Push Instead of Firebase Initially

Use standard Web Push first. It works with service workers, VAPID keys, and browser push services. For this PWA, that is enough for nudges, reminders, and active-session check-ins.

Firebase Cloud Messaging can be considered later if the app expands into native Android or broader notification tooling, but it adds an extra platform dependency that is not necessary for the first version.

### Important PWA Notes

- The timer must not depend on JavaScript running continuously in the background.
- On Start Study, store `started_at` in the database.
- On Stop Study, store `ended_at`.
- Calculate elapsed time from timestamps.
- On iPhone, push notifications require the app to be added to the Home Screen and notification permission to be granted.
- Web Push notifications can appear on the lock screen and lead users back into the PWA.
- A live-updating lock-screen timer with a reliable Stop control is not available to a PWA on iOS. That belongs in a future native app using iOS Live Activities.
- A PWA cannot detect that the user opened Instagram, TikTok, Messages, or other native apps.

## 3. Target Users

Primary users:

- MAC Monash Association of Coding members
- MAC members studying Monash computing/software engineering subjects
- Study groups preparing for assignments, exams, and weekly labs

Secondary users:

- Future Monash students outside MAC
- Future friends outside Monash who want lightweight group study tracking

### MVP Access Decision

MAC Study should start as MAC-only. The implementation can still use standard Google sign-in or email magic links, but the product should include an access gate:

- allowlist approved emails, or
- require an invite code/link from an existing MAC group/admin, or
- require a Monash/MAC verification step later.

Decision: start with Google sign-in and email magic links, then enforce MAC-only access through invite links/admin approval. This keeps onboarding easy, covers users who do not want to use Google, and avoids password reset/support work during the MVP.

## 4. Product Goals

1. Make starting a study session feel frictionless.
2. Let users see subject-level study time per day.
3. Let groups compete through leaderboards and rankings.
4. Make the app social through group chat, active status, and nudges.
5. Keep the app web-first and installable on iPhone and Android.
6. Encourage healthy, honest study habits instead of unhealthy leaderboard grinding.

## 5. Non-Goals for MVP

- Detecting whether a user opened Instagram or another distracting native app.
- Reading phone-wide Screen Time or Digital Wellbeing data.
- Blocking apps.
- Native iOS or Android apps.
- Live-updating lock-screen timer UI or native lock-screen Stop controls.
- Complex AI productivity coaching.
- Full Monash timetable integration.
- Payment or subscriptions.

## 6. Core User Stories

### Timer

- As a user, I can start a study timer for a subject.
- As a user, I can optionally start a timer inside a group so the time counts toward that group's leaderboard.
- As a user, I can leave the app and return later without losing timer progress.
- As a user, I can stop the timer and have the time logged under the selected subject.
- As a user, I can see today's time per subject and total time across all subjects.
- As a user, I can edit or delete a mistaken session.
- As a user, I can see whether I currently have an active session.

Example:

- `FIT3159`: 00:30:00
- `FIT3077`: 00:50:00
- Total: 01:20:00

### Subjects

- As a user, I can create a subject with a code and optional name.
- As a user, I can choose a subject before starting a timer.
- As a user, I can view daily, weekly, and all-time totals per subject.
- As a user, I can archive old subjects from previous semesters.

### Groups

- As a user, I can create a custom group.
- As a user, I can invite friends via a join code or link.
- As a group member, I can see who is currently studying.
- As a group member, I can view a group leaderboard for sessions started inside that group.
- As a group admin, I can rename the group, remove members, and manage invite links.
- As a group admin, I can enable or disable nudges for the group.

### Leaderboards

- As a group member, I can see daily rankings by total study time.
- As a group member, I can see weekly rankings by total study time.
- As a group member, I can see subject-specific rankings.
- As a group member, I only see sessions that were started inside that group counted on that group's leaderboard.
- As a user, I can see my rank, total time, and change from yesterday/last week.

### Group Chat

- As a group member, I can send messages in a group chat.
- As a group member, I can see recent chat history.
- As a group member, I can receive chat updates in realtime while the app is open.
- As a group admin, I can delete inappropriate messages.

### Nudges

- As a group member, I can tap another member and press Nudge.
- The recipient receives a push notification like: `{Sender} woke you up`.
- Nudges should have cooldowns to prevent spam.
- Users should be able to mute nudges from a group or a specific person.

## 7. Feature Priority

### P0 - MVP

- Account creation and login
- MAC-first access gate using approved sign-in and/or invite flow
- Profile setup
- Subject creation
- Start/stop study timer by subject
- Start/stop study timer inside a selected group
- Active session persistence using timestamps
- Daily subject totals
- Daily total study time
- Custom groups
- Invite links / join codes
- Group daily leaderboard
- Basic active-now status
- PWA manifest and installable app shell
- Responsive mobile-first UI

### P1 - Social Layer

- Group chat
- Weekly leaderboard
- Subject-specific group leaderboard
- Web Push notification setup
- Nudge feature
- Nudge cooldowns and mute controls
- Session editing
- Streaks
- Daily/weekly goals

### P2 - Polish and Retention

- Pomodoro mode
- Study rooms / timed sprints
- Session notes
- Weekly recap
- Profile badges
- Exam countdowns
- Subject color customization
- Group roles and moderation tools
- Offline start/stop queue with later sync

### P3 - Native Extension Later

- Native iOS app with Screen Time APIs
- Native Android app with usage stats permission
- Native iOS Live Activity for a lock-screen/Dynamic Island study timer
- Optional distraction detection
- Optional app blocking/focus mode
- Home screen widgets

## 8. Timer System Design

### Key Principle

The app should not rely on a background timer. Instead, it should persist timestamps.

When a user starts studying:

```txt
session.status = active
session.started_at = now()
session.ended_at = null
```

When a user stops studying:

```txt
session.status = completed
session.ended_at = now()
duration_seconds = ended_at - started_at
```

When showing the active timer in the UI:

```txt
elapsed = current_time - started_at
```

This works even if:

- the app is minimized
- the browser tab is suspended
- the phone is locked
- the user closes the app
- the user opens the app from another device

### Group-Scoped Sessions

For the MVP, a group leaderboard only counts sessions explicitly started inside that group. A normal personal session should still count toward the user's personal totals, but it should not automatically count toward every group the user belongs to.

When a user starts a session from a group page:

```txt
session.group_id = selected_group_id
```

When a user starts a session from the general timer page without a group:

```txt
session.group_id = null
```

This avoids confusing cases where one study session appears on multiple group leaderboards at once.

### Lock-Screen Timer Experience

PWA MVP behavior:

- The app can send lock-screen push notifications, such as `Still studying FIT3159?`.
- Tapping the notification should open MAC Study directly to the active session.
- The app can show an in-app active timer after the user opens it again.

Not available in the PWA MVP:

- A continuously updating lock-screen timer.
- A reliable Stop Study button directly on the iOS lock screen.
- Dynamic Island timer UI.

Future native behavior:

- A native iOS app could use Live Activities to show the active study timer on the Lock Screen and Dynamic Island.
- A native Android app could offer a persistent/ongoing notification with richer timer controls.

### Forgotten Timer Protection

Problem: users may forget to stop a timer and accidentally log 12 hours.

Recommended lightweight rules:

- After 3 hours, optionally send a push notification: `Still studying FIT3159?`
- After 6 hours, mark the session as `needs_confirmation`.
- When the user returns, ask them to confirm or trim the session.
- Group leaderboards can visually flag unconfirmed sessions.

Do not silently delete long sessions. Let users correct them. Forgotten timers are not a major MVP blocker, but this protection prevents obviously broken leaderboard entries.

### One Active Session Rule

For MVP, each user should only have one active session at a time. If they start a new subject while another timer is active, ask whether to stop the current timer and start a new one.

Database-level protection:

```sql
create unique index one_active_session_per_user
on study_sessions (user_id)
where ended_at is null and deleted_at is null;
```

## 9. Data Model

### profiles

Stores user-facing profile data.

```txt
id uuid primary key references auth.users(id)
display_name text
username text unique
avatar_url text
course text
access_status text -- pending, active, blocked
access_granted_at timestamptz null
access_granted_by uuid references profiles(id) null
access_granted_source text null
created_at timestamptz
updated_at timestamptz
```

### access_invites

Invite codes for MAC-only access.

```txt
id uuid primary key
code text unique
note text
created_by uuid references profiles(id) null
max_uses integer null
uses_count integer default 0
expires_at timestamptz null
revoked_at timestamptz null
created_at timestamptz
```

### access_invite_redemptions

Tracks which user redeemed which invite.

```txt
invite_id uuid references access_invites(id)
user_id uuid references profiles(id)
redeemed_at timestamptz
primary key (invite_id, user_id)
```

### subjects

User-created subjects.

```txt
id uuid primary key
user_id uuid references profiles(id)
code text
name text
color text
archived_at timestamptz null
created_at timestamptz
```

Suggested rule: `code` is required, `name` is optional.

### groups

Custom study groups.

```txt
id uuid primary key
name text
description text
owner_id uuid references profiles(id)
invite_code text unique
visibility text -- invite_only, public
nudges_enabled boolean default true
nudge_cooldown_seconds integer default 600
created_at timestamptz
updated_at timestamptz
```

### group_members

Membership and roles.

```txt
group_id uuid references groups(id)
user_id uuid references profiles(id)
role text -- owner, admin, member
status text -- active, removed, banned
joined_at timestamptz
last_seen_at timestamptz
primary key (group_id, user_id)
```

### study_sessions

Study session records.

```txt
id uuid primary key
user_id uuid references profiles(id)
subject_id uuid references subjects(id)
group_id uuid references groups(id) null
started_at timestamptz
ended_at timestamptz null
status text -- active, completed, needs_confirmation, voided
source text -- timer, manual_adjustment
note text null
deleted_at timestamptz null
created_at timestamptz
updated_at timestamptz
```

Duration should usually be computed from `started_at` and `ended_at`, not trusted from the client.

### group_chat_messages

```txt
id uuid primary key
group_id uuid references groups(id)
user_id uuid references profiles(id)
body text
deleted_at timestamptz null
created_at timestamptz
```

### nudges

```txt
id uuid primary key
group_id uuid references groups(id)
sender_id uuid references profiles(id)
recipient_id uuid references profiles(id)
message text
created_at timestamptz
delivered_at timestamptz null
read_at timestamptz null
```

### user_group_notification_settings

Per-user notification and nudge settings for a group.

```txt
user_id uuid references profiles(id)
group_id uuid references groups(id)
nudges_muted boolean default false
chat_muted boolean default false
created_at timestamptz
updated_at timestamptz
primary key (user_id, group_id)
```

### user_nudge_mutes

Lets a user mute nudges from a specific person.

```txt
user_id uuid references profiles(id)
muted_user_id uuid references profiles(id)
group_id uuid references groups(id) null
created_at timestamptz
primary key (user_id, muted_user_id, group_id)
```

### push_subscriptions

```txt
id uuid primary key
user_id uuid references profiles(id)
endpoint text unique
p256dh text
auth text
user_agent text
created_at timestamptz
last_seen_at timestamptz
revoked_at timestamptz null
```

### user_goals

```txt
id uuid primary key
user_id uuid references profiles(id)
subject_id uuid references subjects(id) null
period text -- daily, weekly
target_seconds integer
created_at timestamptz
updated_at timestamptz
```

## 10. Key Views / Aggregations

### Daily Subject Totals

For each user, group completed sessions by local date and subject:

```txt
user_id
local_date
subject_id
total_seconds
```

### Daily User Totals

```txt
user_id
local_date
total_seconds
```

### Group Daily Leaderboard

```txt
group_id
local_date
user_id
display_name
total_seconds
rank
```

Important decision: group leaderboards only count sessions explicitly started "inside" that group. This requires `study_sessions.group_id` to match the leaderboard group.

## 11. Main Screens

### Home / Timer

Purpose: start studying fast.

Content:

- Active timer card
- Subject selector
- Optional group selector or visible current group context
- Start/Stop button
- Today's subject totals
- Today's total
- Current streak or goal progress

Primary action:

- Start Study / Stop Study

### Subjects

Purpose: manage and inspect subject-level time.

Content:

- Subject list
- Today, week, and all-time totals
- Subject detail page
- Session history for subject

### Groups

Purpose: social competition and accountability.

Content:

- Group list
- Create group
- Join group by code
- Active members
- Group leaderboard
- Group chat
- Member profile sheet with Nudge button
- Group setting to enable/disable nudges

### Leaderboards

Purpose: ranking and motivation.

Filters:

- Group
- Daily / weekly / all-time
- All subjects / specific subject

### Profile

Purpose: identity and settings.

Content:

- Display name
- Username
- Avatar
- Total study time
- Subjects
- Notification settings
- Nudge mute settings
- Privacy settings

## 12. Nudge Feature Specification

### User Flow

1. User opens a group.
2. User taps a member.
3. Member sheet opens.
4. User taps Nudge.
5. System creates a `nudges` record.
6. Server sends Web Push notification to recipient.
7. Recipient sees: `{Sender} woke you up`.

### Rules

- Group admins can enable or disable nudges in group settings.
- If nudges are disabled for the group, no member can send a nudge in that group.
- Group admins can configure a simple cooldown, defaulting to 10 minutes per sender-recipient pair.
- A user can mute nudges from a group.
- A user can mute nudges from an individual person.
- A user cannot nudge themselves.
- Nudges should be logged so abuse can be reviewed by group admins.

### Notification Copy

Default:

```txt
{Sender} woke you up
```

Alternatives:

```txt
{Sender} says get back to it
{Sender} nudged you to study
{Sender} is calling you back to MAC Study
```

Recommendation: keep the default as `{Sender} woke you up` because it has personality and matches your original idea.

## 13. Group Chat Specification

### MVP Chat Scope

- Text-only messages
- Realtime updates
- Message timestamps
- Delete own message
- Admin delete any message
- No attachments in MVP

### Risks

Group chat increases moderation requirements. For a student club app, this is still manageable, but you should include:

- report message
- admin deletion
- member removal
- basic profanity/spam protection later

If implementation time is tight, ship group leaderboards first and add chat in P1.

## 14. Privacy and Safety

### User Controls

- User can choose display name and avatar.
- User can leave a group.
- User can mute nudges.
- User can disable push notifications.
- User can edit/delete mistaken sessions.

### Data Visibility

Recommended defaults:

- Group members can see each other's total study time and active studying status.
- Group members do not need to see detailed session notes unless the user opts in.
- Subject-level leaderboard visibility should be configurable by group.

### Healthy Competition

Potential problem: leaderboards can encourage unhealthy studying or fake sessions.

Mitigations:

- Add daily goals, not just rankings.
- Flag unusually long unconfirmed sessions.
- Celebrate consistency, not only total hours.
- Consider "focus streak" badges and "goal met" states instead of only top-rank status.

## 15. Future Extension: Stop Timer if Instagram Opens

This is not feasible in a PWA because the browser cannot know what native app the user opened.

Future native path:

- iOS: use Screen Time APIs such as Family Controls and Device Activity, with Apple entitlements.
- Android: use UsageStatsManager with user-granted usage access permission.

Recommended product framing:

- MVP: honor-system study timer with long-session confirmation.
- Later native extension: optional distraction detection/focus enforcement.

## 16. Success Metrics

### Activation

- Percentage of users who start their first session within 2 minutes of signup.
- Percentage of users who create or join a group.

### Engagement

- Daily active users.
- Study sessions per user per week.
- Average number of active group members per day.
- Nudge sends and nudge opens.

### Retention

- Day 1, Day 7, and Day 30 retention.
- Weekly active groups.
- Users who log study time at least 3 days per week.

### Product Health

- Percentage of sessions marked `needs_confirmation`.
- Number of edited/deleted sessions.
- Nudge mute rate.
- Chat report rate.

## 17. MVP Implementation Plan

### Milestone 1 - App Foundation

- Create Next.js app with TypeScript and Tailwind.
- Add MAC Study theme tokens.
- Set up Supabase project.
- Add Supabase Auth.
- Create profiles table.
- Add MAC-only invite/admin access gate.
- Add PWA manifest.

### Milestone 2 - Timer and Subjects

- Create subjects table.
- Create study_sessions table.
- Build Start/Stop timer flow.
- Support optional `group_id` on timer sessions.
- Enforce one active session per user.
- Build today's subject totals.
- Build session history.

### Milestone 3 - Groups and Leaderboards

- Create groups and group_members tables.
- Build create/join group flow.
- Build group dashboard.
- Build daily group leaderboard from sessions where `study_sessions.group_id = group.id`.
- Add active-now status.

### Milestone 4 - PWA and Notifications

- Add service worker.
- Add push subscription flow.
- Store push subscriptions.
- Send test notification.
- Add nudge records.
- Send nudge notifications.

### Milestone 5 - Social Polish

- Add group chat.
- Add weekly leaderboard.
- Add session edit/delete.
- Add nudge cooldowns/muting.
- Add profile and notification settings.

## 18. Suggested Routes

```txt
/                         landing or redirect
/app                      main timer dashboard
/app/subjects             subjects list
/app/subjects/[subjectId] subject detail
/app/groups               groups list
/app/groups/[groupId]     group dashboard
/app/groups/[groupId]/chat group chat
/app/leaderboards         leaderboard explorer
/app/profile              profile/settings
/auth/login               login
/auth/callback            Supabase auth callback
```

## 19. Suggested Folder Structure

```txt
app/
  (auth)/
  (app)/
  api/
  manifest.ts
components/
  timer/
  groups/
  leaderboard/
  chat/
  nudges/
  ui/
lib/
  supabase/
  auth/
  timer/
  notifications/
  validation/
db/
  migrations/
  types.ts
public/
  sw.js
  icons/
```

## 20. Decisions and Open Questions

### Confirmed Decisions

1. MAC Study is MAC-only for the MVP.
2. Login should support Google sign-in and email magic links.
3. Access is still controlled through invite/admin flow rather than open public signup.
4. Group leaderboards count only sessions explicitly started inside that group.
5. Nudges can be controlled through group settings.
6. Users can mute nudges for a group or mute nudges from specific people.
7. Forgotten timers are a minor concern, handled with lightweight confirmation rather than heavy anti-cheat.

### Open Questions

These decisions still shape the MVP:

1. Should subjects be user-created only, or should there be a shared Monash subject catalogue?
2. Should chat be part of MVP, or should the first release focus on timer + groups + leaderboards + nudges?
3. Should nudges only be sent to inactive users, or can you nudge anyone in a group?
4. Should the tone be playful and club-like, or more serious and productivity-focused?
5. Should weekly leaderboards reset Monday morning in Australia/Sydney time?
6. Should users be able to make their study totals private in some groups?

## 21. Repository License and IP

Recommended setup:

- Keep the GitHub repository private while building MAC Study.
- Do not choose MIT, Apache-2.0, GPL, AGPL, BSD, ISC, or any other open-source license if you do not want others copying or reusing the product.
- Use no open-source license, or add a custom proprietary `LICENSE.md` that says all rights are reserved.
- Add a short notice to `README.md` making the intent obvious.

Recommended `LICENSE.md` text:

```txt
Copyright (c) 2026 MAC Study contributors.

All rights reserved.

This source code and associated materials are proprietary and confidential.
No permission is granted to copy, modify, distribute, sublicense, publish,
deploy, or use this software or any substantial portion of it without prior
written permission from the copyright holder.
```

Recommended `README.md` notice:

```txt
## License

MAC Study is proprietary software. All rights reserved.
No part of this codebase may be copied, modified, distributed, or used without permission.
```

Important notes:

- If a public GitHub repository has no license, default copyright law applies, so others do not receive permission to reproduce, distribute, or create derivative works. However, GitHub's terms allow other GitHub users to view and fork public repositories on GitHub.
- If multiple friends contribute code, decide early who owns the IP. Otherwise, each contributor may own copyright in their own contributions unless there is a written agreement.
- Third-party dependencies still have their own licenses. The app can be proprietary while using open-source packages, but dependency license obligations still need to be respected.

## 22. Source Notes

- Next.js official PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps
- Next.js manifest docs: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
- Supabase docs: https://supabase.com/docs/
- Supabase Realtime docs: https://supabase.com/docs/guides/realtime
- Supabase Auth SSR docs: https://supabase.com/docs/guides/auth/server-side
- Supabase Row Level Security docs: https://supabase.com/docs/guides/database/postgres/row-level-security
- Firebase Cloud Messaging web docs, for optional future comparison: https://firebase.google.com/docs/cloud-messaging/web/get-started
- WebKit Web Push for iOS/iPadOS Home Screen web apps: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- MDN Notification actions docs: https://developer.mozilla.org/en-US/docs/Web/API/Notification/actions
- Apple Human Interface Guidelines for Live Activities: https://developer.apple.com/design/human-interface-guidelines/live-activities
- Apple ActivityKit Live Activities overview: https://developer.apple.com/documentation/ActivityKit/displaying-live-data-with-live-activities
- GitHub repository licensing docs: https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
