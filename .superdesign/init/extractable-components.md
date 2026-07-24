# Extractable components

## AppShell

- Source: `src/components/app-shell.tsx`
- Category: layout
- Description: Responsive desktop/mobile application shell with header, rail, bottom navigation, account menu, and scroll viewport.
- Extractable props: `activeItem` (default `"home"`), `showAccountMenu` (default `false`), `headerDetail` (default `""`).
- Hardcoded: MAC logo, six navigation labels, icon set, dark/yellow styling.

## MobileBottomNav

- Source: `src/components/app-shell.tsx`
- Category: layout
- Description: Fixed six-item mobile navigation with active yellow tile.
- Extractable props: `activeItem` (default `"home"`).
- Hardcoded: Home, Group, Friends, Units, Stats, Profile labels and icons.

## StartStudyDialog

- Source: `src/components/study/start-study-dialog.tsx`
- Category: basic
- Description: Responsive centered dialog/mobile bottom sheet for choosing a study subject.
- Extractable props: `showDialog` (default `true`).
- Hardcoded: close/play/book icons, general-study row, layout and visual styling.

## NudgePill

- Source: `src/components/social/nudge-pill.tsx`
- Category: basic
- Description: Yellow accountability action with queued-count state.
- Extractable props: `pendingCount` (default `0`), `disabled` (default `false`).
- Hardcoded: Bell icon, label format, yellow styling.

## GroupTabs

- Source: `src/components/groups/groups-dashboard.tsx`
- Category: basic
- Description: Class view, Rankings, and Chat segmented navigation.
- Extractable props: `currentTab` (default `"class"`).
- Hardcoded: tab names and selected yellow treatment.

## PeriodTabs

- Sources: `src/components/groups/groups-dashboard.tsx`, `src/components/statistics/statistics-dashboard.tsx`
- Category: basic
- Description: Day/week/month segmented filter used in rankings and statistics.
- Extractable props: `currentTab` (default `"day"`).
- Hardcoded: period labels, dark surface, yellow selected state.

