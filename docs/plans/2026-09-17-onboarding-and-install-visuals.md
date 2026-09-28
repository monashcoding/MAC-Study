# MAC Study onboarding and install visuals

Status: implemented 18 September 2026. The rollout migration still needs deployment and authenticated device QA.

## Direction

Lead with studying together and accountability; support it with personal progress and finding classmates. This is the recommended default pending the user's positioning preference.

The login page answers **why use MAC Study?** The first in-app welcome answers **what can I do here?** Optional setup then explains **why install or enable notifications?**

Keep the current dark surfaces, yellow actions, real MAC Study logo and restrained motion. Avoid a lengthy mandatory tour: a single welcome with three concise visual feature previews should be enough.

## Baseline before implementation

- `/` redirects to `/app`. `/auth/login` currently shows the logo, product name, and Google/Microsoft sign-in buttons.
- Login attempts to complete an existing shared MAC session. Existing sessions can bypass the visible login screen.
- New users may need `/auth/profile` (name and username), followed by `/auth/access` (invite code), before reaching the workspace.
- `AppShell` mounts `InstallOnboarding`, then enables `NotificationOnboarding` after the install guide reports completion. There is no product introduction before these prompts.
- The mobile install guide automatically opens unless running standalone or the per-user `mac-install-onboarding-v3` preference is `seen`. Closing it without selecting Don't show again does not persist dismissal.
- Notification onboarding automatically opens on eligible mobile viewports with default permission and no saved seen flag.
- Desktop has separate PC-install and phone-install launchers. The PC launcher currently still renders inside the standalone app, as visible in the supplied screenshot.
- Current install guides contain text/icon steps, without the supplied screenshots.

## Proposed experience

### 1. Login: make the value visible

Suggested copy:

> Study together. Make progress you can see.
>
> Track your study time, see who's studying, and keep each other going.

Three short benefits:

1. **Study with your people.** Friends, groups and a little friendly competition.
2. **Find your classmates.** Connect with people taking your units.
3. **See your progress.** Track sessions and build a picture of your study habits.

Use an illustrative preview assembled from actual app UI: a group studying view, a timer and a small activity chart. Any sample names/times must be clearly treated as a preview, not live community activity. Do not invent user counts, testimonials, academic outcomes or offline capabilities.

Desktop: two columns, product story/preview on one side and a compact sign-in panel on the other. Mobile: short headline and description, Google/Microsoft actions, then a compact preview and supporting benefits. Keep authentication easy to find on a small phone; allow scrolling instead of retaining the current fixed-height overflow-hidden wrapper.

Preserve provider flows, session restoration, error states, loading overlay, safe next-path handling and signed-out behavior. Returning authenticated users should still get straight into the app. New users who arrive through shared MAC sign-in must receive the in-app introduction even if they never see this page.

### 2. Required account setup: explain the purpose

Keep the required name/username and access checks. Improve profile copy to explain that the name and handle let friends recognise/find the user. Keep access eligibility explicit; do not imply successful sign-in guarantees access. Do not add course, units, friends or notification questions to the required profile form.

### 3. First workspace visit: one brief welcome

Show only after the account has passed required setup/access checks. Suggested heading: **Your study space, with your people.**

| Preview | Explanation | Destination |
| --- | --- | --- |
| Friends/group studying view | See who's studying, chat, compare study time and nudge each other. | Groups / Friends |
| Unit cohort card | Add your units and find people taking the same classes. | Units |
| Timer plus activity chart | Start a session and see your study time build up. | Home / Statistics |

Desktop: three compact previews in one dialog. Mobile: vertically stacked compact previews in one scrollable welcome surface. Keep the footer visible, use accessible focus management, and support reduced motion. Avoid auto-advancing slides or a mandatory tour of every navigation item.

Primary CTA: **Start your first session** (opens the existing study-choice dialog; does not silently start a timer). Secondary CTA: **Explore the app**. Both finish the introduction. A visible close/skip action dismisses it without immediately opening another modal.

Social value should lead the copy, but starting a session is a useful default action even when the user's network is empty. Context takes priority: someone following a group invitation should be returned to that invitation/group rather than redirected to Home. Preserve the original safe destination through all steps.

### 4. Optional setup after the welcome

Show a compact dismissible Getting started card in the workspace, not an automatic chain of dialogs. Suggested actions: start a session, find classmates, add the app to this device, enable relevant alerts. Mark progress from actual application state, not merely from clicking a link.

The install and notification prompts must explain benefits before requesting anything:

- **Keep MAC Study one tap away.** Add it to your Home Screen or open it in its own desktop window.
- **Keep each other going.** Get nudges, messages and friend-request alerts. Mention study reminders only where the configured reminder feature is available.

Notifications open from an explicit setup action or a relevant feature action, such as setting a study reminder. Use **Enable notifications** and **Not now**. The browser permission request must follow the user's direct click/tap; prepare required configuration before enabling the button.

On iPhone/iPad, explain installation first and ask for push permission only after opening the Home Screen web app. If the user declines installation, they can continue using the app without the permission step. Android/desktop use actual capability checks rather than assuming installation is always a prerequisite for push.

Existing users should receive a dismissible introduction entry point, not be forced through the new first-run welcome. Provide Replay introduction and install help in Profile.

## Installation visuals

### Mobile

The supplied Home Screen image is a strong outcome image: it shows MAC Study living alongside familiar apps. Apply grayscale to all other icons, including the dock, while preserving the exact yellow/black MAC Study icon and its label.

- Show a crop focused on the app grid for a compact guide; optionally show the full image in a restrained phone frame on desktop.
- Use it beside **One tap from your Home Screen** and the platform's install steps.
- Keep the actual steps as readable HTML; the screenshot demonstrates the result, not the Share-menu action.
- Use the iPhone image for the iOS tab. Android should use a real Android capture when available, or text/icon guidance in the first version rather than presenting iOS as Android.
- Desktop phone guidance can place the image beside the steps and a QR code/link to the production site. On mobile, show a smaller preview above the steps so the action controls remain reachable.

A selective-colour planning preview was generated with the built-in image tool. Treat it as a concept: before production, verify logo/text fidelity against the original. For the final asset, preserve original screenshot pixels using mask-based desaturation rather than accepting regenerated UI details.

### Desktop

The supplied PC screenshot establishes that the app has its own window and taskbar identity, but the maximised layout, zero timer and large empty areas weaken the install pitch. It also includes the redundant Install on PC launcher inside the installed app.

Preferred replacement capture:

1. Restore the installed app to a medium-sized window, approximately 1100-1300 pixels wide.
2. Use a neutral desktop with a small visible margin around the window.
3. Keep the MAC Study title bar and Windows taskbar visible, with the MAC Study icon easy to identify.
4. Show a real study session or a populated sample workspace. Capture sample data separately from real user records and label it as a preview when needed.
5. Remove/hide the redundant current-device install launcher before the final capture.
6. Add at most two small callouts: **Your own app window** and **Open from your taskbar**.

An optional short clip of clicking the taskbar icon and opening the app would communicate the result well, but a clean still image is sufficient for version one.

Use a separate small Chrome screenshot to identify the address-bar install control or menu fallback. The finished-app screenshot cannot teach where to click in the browser. Preserve both the native install button when available and manual browser instructions when it is not.

## State and implementation plan

Keep product education account-scoped and device setup device-scoped:

- Add an owner-only onboarding record with version, completion/dismissal status and timestamps. Persist completion across desktop, mobile browser and installed app. Derive account identity from the server session; apply RLS/ownership checks.
- Existing accounts at rollout receive an optional introduction card. New accounts receive the welcome once. Record the rollout boundary explicitly rather than treating every missing row as a brand-new user.
- Keep install dismissal and notification readiness specific to the device/browser. Respect existing v3 and notification preferences; do not reset them just to introduce screenshots.
- One coordinator owns the active welcome/install/notification surface. Closing or skipping any optional step returns to the app, not immediately to the next modal.
- Keep `beforeinstallprompt` listeners mounted while product education is showing; only gate the install UI. Otherwise the browser event can be missed.
- Distinguish guide dismissal, accepted browser prompt and confirmed installation. Running in standalone mode is sufficient to suppress install advertising for that current app window; avoid claiming universal installed-app detection in ordinary browser tabs.
- Onboarding fetch/write failure must not block studying. Use a local fallback for the current browser and retry persistence. Deploy and verify the database migration before relying on the new state, with a narrow rollout fallback.

Primary existing files:

- `src/app/(auth)/auth/login/page.tsx`: responsive value-led login composition.
- `src/components/auth/login-form.tsx`: preserve auth behavior and visible loading/error states.
- `src/app/(auth)/auth/profile/page.tsx`: purposeful setup copy.
- `src/components/app-shell.tsx`: onboarding coordinator and modal gating.
- `src/components/pwa/install-onboarding.tsx`: screenshots, responsive layouts, retained install capabilities, standalone suppression.
- `src/components/pwa/notification-onboarding.tsx`: contextual invocation and permission outcomes.
- `src/components/profile/profile-dashboard.tsx`: replay and setup entry points.

New scoped work: welcome/quick-start components, an onboarding state helper and owner-scoped persistence, a migration, and optimised images under `public/images/onboarding/`. Keep the image treatment/layout work separate from changes to authentication logic.

Suggested implementation order: agree copy and flow; create desktop/mobile visual drafts; implement persistence and sequencing; update login/welcome; integrate screenshots/install help; verify on real devices.

## Acceptance and verification

- A first-time visitor understands the product before choosing a sign-in provider.
- Required profile/access flow and group invitation destinations survive authentication.
- Eligible new users see the product welcome before install/notification prompts, including users coming through an existing MAC session.
- Returning users and users who skipped the welcome are not repeatedly interrupted.
- At most one onboarding dialog is open. Closing it does not trigger another immediately.
- Studying remains available when every optional setup action is skipped or unavailable.
- Browser permission is requested only after a deliberate action; denied/unsupported/already-enabled states have appropriate UI.
- iPhone Safari and the installed iPhone app are tested separately, as are Android Chrome and desktop Chrome/Edge. No unauthenticated preview is reported as authenticated-flow verification.
- Welcome completion survives another device; install/permission state remains specific to each device.
- Mobile safe areas, small screens, keyboard navigation, focus return, reduced motion and image loading are checked. Screenshots cannot make instructions or controls overflow.
- Test the coordinator transitions, persistence/owner isolation and deep-link preservation. Run TypeScript, relevant lint/tests and production build after implementation. Use visual/device QA for image layout instead of tests that merely duplicate markup.
- If existing analytics infrastructure is available, compare login-to-first-session, welcome completion/skip, install interest and notification opt-in. Do not treat clicking Install or dismissing instructions as a successful installation.

## Reference constraints checked for this plan

- Apple/WebKit: Home Screen web apps can request push permission in response to direct user interaction: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Chrome install routes and fallback instructions: https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DDesktop&hl=en

The implementation was visually checked in an isolated local preview. A Superdesign project and brand asset were created, but the draft generation request was blocked because it would have uploaded private source files to an external design service.
