# MAC Study design system

MAC Study is a mobile-first accountability and study-tracking PWA for a private student community. Its primary jobs are starting a timed session quickly, seeing friends or group members studying, comparing study time, managing units, and chatting in groups.

## Visual identity

- Dark, focused, compact, and friendly.
- Use Inter/system sans throughout.
- Background `#171717`; surfaces `#1c1c1c` and `#232323`.
- Brand yellow `#ffe330` is reserved for active navigation, primary actions, selected states, progress, and small highlights.
- Primary text `#f7f7f2`; muted text `#a9a99f`; borders `#34342f`.
- Status colors: success `#42d392`, danger `#ff6b6b`, info `#6cb6ff`.
- Prefer restrained solid surfaces over decorative gradients. The desktop background may use extremely subtle yellow/blue radial ambience.
- Medium radius `14px`; large panels `20px`; dialogs `24px`.
- Use thin borders, low-contrast inset highlights, and subtle shadows. Avoid heavy card nesting.

## Typography

- Page title: 24–30px, semibold.
- Section title: 18–20px, semibold.
- Body: 14–16px.
- Metadata: 12–14px, muted.
- Timer values: large tabular numerals with strong hierarchy.
- User identity: username is primary where discovery is the purpose; otherwise display name is primary with `@username` smaller and muted.

## Layout

- Mobile is the primary viewport.
- Fixed compact header and six-item bottom navigation.
- Main content scrolls inside the application shell; chat owns its own locked viewport.
- Desktop uses a left rail, fixed header, and centered content area.
- Use 16px outer mobile gutters and consistent 12–16px vertical rhythm.
- Prefer one clear surface per section. Reduce nested cards, repeated explanatory copy, and large empty top regions.

## Components and behavior

- Primary buttons: yellow fill, dark text, 44–52px height.
- Secondary buttons: dark/translucent surface with border.
- Destructive buttons: transparent/dark with red border and text.
- Icon-only controls: at least 40×40px, clear accessible names.
- Selected tabs use yellow fill or a minimal yellow indicator; never use double outlines.
- Inputs use translucent fills, subtle border, yellow focus ring.
- Dialogs are centered on larger screens and bottom sheets on phones; close with X or backdrop where safe.
- Settings must rely on clear labels and hierarchy rather than explanatory paragraphs for self-evident controls.
- Motion: 120–220ms, small fade/translate/scale only, with reduced-motion support.
- Keep mobile keyboard transitions stable: hide the bottom navigation in chat composer state and prevent document-level overscroll.

## Accessibility

- Maintain WCAG AA contrast.
- Never communicate selection by color alone.
- Preserve visible keyboard focus.
- Touch targets are at least 44px where practical.
- Respect safe-area insets and reduced motion.
- Use semantic headings, labelled controls, and useful empty/loading/error states.

