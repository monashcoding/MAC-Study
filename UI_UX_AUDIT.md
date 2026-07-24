# MAC Study UI/UX audit

Date: 23 July 2026

Scope: all defined routes, primary dashboards, dialogs, menus, notifications, loading/empty/error states, group chat, and mobile shell behavior. The login screen was visually inspected live. Authenticated surfaces were reviewed from their rendered JSX, responsive classes, interaction logic, and supplied screenshots because the audit browser was not signed into the private app.

No product UI was changed.

## Highest-priority changes

1. Standardise every modal and bottom sheet.
   - Close with X, Escape, and backdrop click.
   - Trap focus, autofocus the first useful control, and restore focus on close.
   - Keep a consistent sticky header/footer and 44px minimum actions.
   - Warn only when closing a dirty form.

2. Remove avoidable vertical weight.
   - Drop the three summary tiles from Groups and Friends on mobile.
   - Reduce nested cards, borders, gradients, and repeated explanatory copy.
   - Put the primary list or task closer to the header.

3. Replace remaining native dropdowns.
   - Unit cohort “Add to group”.
   - Add-unit Year and Teaching period.
   - Preserve native accessibility with a keyboard-complete custom listbox.

4. Make destructive actions safe.
   - Confirm or provide undo for remove friend, remove member, leave group, leave unit, and delete subject.
   - State the object/person being affected.
   - Do not rely on red styling alone.

5. Fix accessibility gaps.
   - Re-enable browser zoom by removing `userScalable: false` and `maximumScale: 1`.
   - Increase 28–40px interactive controls to reliable touch targets.
   - Add keyboard operation to custom listboxes.
   - Use human colour names instead of hex values in accessible labels.

6. Use one feedback system.
   - Success: short toast or compact inline confirmation.
   - Validation: beside the affected control.
   - Network failure: persistent inline error with Retry where useful.
   - Loading controls should change label and show a spinner, not only become disabled.

## App shell and navigation

- Rename the list destination from “Group” to “Groups”; keep the selected group name centred in the detail header.
- The six-item mobile navigation is cramped at `0.64rem`. Slightly enlarge labels or simplify the selected treatment.
- Use the cog consistently for settings. This is mostly correct now.
- Keep page subtitles on desktop only when they add real context; several merely restate the page title.
- The active yellow navigation tile is visually heavy beside yellow page CTAs. A smaller yellow icon tile or indicator would improve hierarchy.
- Legacy `/app/leaderboards` and `/app/subjects` duplicate newer surfaces. Redirect or remove them so an old link cannot expose an inconsistent UI.
- The fixed mobile shell and chat-specific nav hiding are directionally correct.

## Home / timer

What works:

- Strong timer hierarchy and clear primary session action.
- Subject rows are compact and scannable.
- Direct per-subject play controls reduce friction.

Improve:

- Simplify the subject colour picker to one clean selected ring plus checkmark. The current white border, white ring, offset, and container border stack looks busy.
- Disable “Save changes” until something changes and show a saving state.
- Confirm or undo subject deletion. Explain why the final subject cannot be deleted instead of silently disabling the action.
- The subject editor uses two modes—list and detail—but detail has no route back to the list. Add a compact breadcrumb/back affordance inside the modal, or open single-subject edits directly and reserve “Edit subjects” for management.
- The start-study dialog should support backdrop click and Escape like the subject editor.
- Avoid two visually equal edit entry points on each row and in the section header; make the row pencil quieter.

## Groups list

- Remove the decorative group icon from group cards and public-group cards. It consumes width and does not communicate unique information.
- Remove the three summary tiles on mobile. “Groups / Active / Members” delays the actual group list and repeats information available in cards.
- Keep the Create action near the list heading, but use the same button shape as equivalent Add actions elsewhere.
- Public groups should show the leader or a short identity cue before a one-tap Join.
- Add a compact empty state with one clear Create action instead of keeping empty summary tiles.

## Group detail / class view

What works:

- Group name is supplied to the centred app header.
- Class metadata and the settings cog share one compact row.
- Three members per row is appropriate for mobile.
- Username-only class cards match the discovery context.

Improve:

- Make active status clearer with a small status dot/badge. Orange text and borders currently compete with the yellow brand system.
- Reduce card border/radius noise; the person illustration, username, and time should lead.
- Avoid truncating usernames without a recovery path. A long press/title does not help most touch users; allow a second line or slightly smaller responsive type.
- Keep the Start study CTA above the bottom navigation, but reduce its shadow and make disabled “studying elsewhere” state explain where the active session is.

## Group rankings

- The two stacked segmented controls—view and period—create a control-heavy top area. Make period selection a slimmer sub-navigation.
- Ranking rows are full buttons but lack an obvious detail cue. Add a subtle chevron or pressed treatment.
- Highlight the current user with “You” and a quiet background, not another large yellow surface.
- Show ties consistently if equal study time is possible.

## Group chat

What works:

- Realtime subscription plus five-second polling fallback provides live updates.
- The mobile chat owns a fixed-height internal scroll area.
- Bottom navigation hides while composing.
- Messages display sender name with a smaller muted username.

Improve:

- Do not force-scroll to the bottom whenever any message arrives. Auto-scroll only when the user is already near the bottom or sends a message; otherwise show a “New messages” pill.
- Replace the one-line input with an auto-growing textarea. A 2,000-character limit does not fit a single-line composer.
- Group consecutive messages from the same sender to reduce repeated name/username/time chrome.
- Add date separators and a compact sending/retry state for failed messages.
- Keep the composer above the keyboard with safe-area padding; avoid recalculating the full chat height on every visual viewport scroll when only the keyboard offset changed.
- The empty-state explanation can be shortened to “No messages yet”.

## Group creation

- Keep public/private descriptions, but compress each option into a label plus one short line.
- Add search when the friend list can exceed roughly eight people.
- Show the selected-member count in the section label.
- Use a check control with a visible selected row state, not only a small trailing circle.
- Close through X, backdrop, and Escape.
- Preserve entered values if creation fails.

## Group settings

- Remove the Class icon / Member icons section completely and keep one consistent class-view icon.
- Break the long settings sheet into three compact groups:
  - Details: name and privacy.
  - Members: member list with role and overflow actions.
  - Your membership: leave group.
- Put Invite members behind one focused picker instead of rendering another full member list below the first.
- Use an overflow menu per manageable member for Promote, Demote, and Remove. This removes button clutter from every row.
- Confirm role changes and removals, or offer Undo.
- Preserve “(You)” after the current user’s name.
- Keep the leader-only name/privacy controls disabled or hidden for members, but add a concise read-only value rather than presenting disabled form controls.
- Define the leadership edge case: an owner currently cannot leave and there is no transfer-leadership action. Add Transfer leadership before allowing an owner to leave.
- Keep group deletion out until the product policy is final.

## Friends list and profile

- Remove the three summary tiles on mobile; lead with the friend list.
- The friend card identity pattern—name, smaller username, study time—is correct.
- Add search/sort once the list becomes longer.
- Friend detail should use the selected username or name as the contextual mobile header rather than leaving “Friends”.
- The custom group picker looks much better than a native select, but it needs Arrow Up/Down, Enter, Home/End, and focus management.
- Confirm or undo Remove friend.
- The Add friend remote picker needs search and a clear “already friends” state for large communities.
- Keep demo-only colour controls out of the real account flow.

## Units list

- Unit cards repeat teaching period in the subtitle and right column. Keep code and nickname on the left; use one semester/year badge on the right.
- Reduce the oversized empty vertical gap created by a right-aligned Add unit row with no section title.
- Add a unit count only if it helps scanning; do not add another summary-card row.
- Keep Current and upcoming / Past units as plain sections.

## Unit detail and cohort

- Use the unit code as the centred header and place nickname, year, and period in one compact metadata row.
- Move Leave into an overflow/settings action and confirm it.
- Search and All MAC/Friends filters are good, but the filter buttons are too small for comfortable touch.
- The cohort identity pattern is correct: display name, smaller username, shared-group context.
- Replace the native “Add to group…” select with the same custom group picker pattern.
- Make feedback specific to the affected person and group.

## Add unit

- Remove “Choose the class you’re taking”; the title and fields already explain the task.
- Replace native Year and Teaching period dropdowns with the app’s custom select.
- Consider one combined “Teaching period” picker such as “Semester 1 · 2027” to reduce fields.
- A custom unit autocomplete will look and behave more consistently than the browser datalist.
- Keep inline unit-code validation and cohort preview.

## Statistics

What works:

- Clear period switching and strong total-time hierarchy.
- Column/subject views provide useful complementary views.

Improve:

- Increase the Column/Subjects chart toggle hit areas; 28px is too small.
- Add comparison context such as “+18% from last week” beneath the total.
- Bars need a touch interaction or visible selected value; browser `title` text is not a mobile tooltip.
- Increase 10px axis labels and reduce the number of ticks if necessary.
- Show a designed empty state when every bucket is zero instead of an empty chart frame.
- Simplify gradients and shadows in both chart surfaces so the data colours remain dominant.

## Profile and notification settings

- Add an Edit profile entry for display name and username.
- “MAC access / Invite only” looks interactive because the row has hover styling. Remove hover or open a real access-details view.
- Do not truncate important notification permission errors.
- If notifications are blocked or unsupported, show a concise remediation action instead of a permanently disabled button.
- The profile identity card is attractive but takes substantial mobile height; tighten its top/bottom spacing.
- Sign out placement is clear.

## Authentication and onboarding

Login:

- The live screen is clean and balanced.
- Shorten the central-account paragraph and remove the green information box; both explain the same concept.
- Use Google and Microsoft brand marks rather than identical generic login icons.
- Show “Connecting…” plus a spinner on the selected provider button.

Profile setup:

- Check username availability before final submission and show inline status.
- Keep name as primary and username as the smaller unique identifier.
- Explain allowed username characters beside the field before an error occurs.

Invite access:

- Keep the single-task layout.
- Show code validation beside the input.
- Preserve the entered code after a failed attempt.

Logout:

- The minimal progress state is appropriate.

## PWA launch and notifications

- The launch screen currently stays for a fixed minimum period. Dismiss it when the app is ready, with a maximum timeout, so fast launches do not feel artificially delayed.
- Nudge toasts are compact and readable.
- Let a nudge toast open the sender or relevant group when tapped.
- Pause auto-dismiss while the toast has keyboard focus or pointer hover.

## Recommended implementation order

1. Modal/accessibility foundation and browser zoom.
2. Remove group icon selector and decorative group icons.
3. Group settings information architecture.
4. Native dropdown replacement.
5. Chat auto-scroll/composer improvements.
6. Remove mobile summary-card rows and tighten page spacing.
7. Destructive-action confirmation/undo.
8. Statistics touch/readability improvements.
9. Authentication and profile polish.

