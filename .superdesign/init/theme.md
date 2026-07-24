# Theme

## Compact token summary

- Product: mobile-first dark study PWA.
- Font: Inter, then system sans-serif.
- Background: `#171717`.
- Surface: `#1c1c1c`; raised surface: `#232323`.
- Border: `#34342f`.
- Primary text: `#f7f7f2`; muted text: `#a9a99f`.
- Brand/action yellow: `#ffe330` with dark foreground `#141414`.
- Success: `#42d392`; danger: `#ff6b6b`; info: `#6cb6ff`.
- Medium radius: `0.875rem`; large radius: `1.25rem`; dialogs use `1.5rem`.
- Soft shadow: `0 1px 0 rgb(255 255 255 / 0.04)`.
- Main responsive shell breakpoint: `64rem` / 1024px.
- Mobile navigation content height: `3.75rem` plus safe-area inset.
- Motion is restrained: 120–220ms fades/translations with reduced-motion fallbacks.
- Inputs use translucent dark fills, subtle inset highlights, and yellow focus glow.
- Dialogs become bottom sheets below 40rem.

## Raw source

Tailwind is loaded through `@import "tailwindcss";`; there is no separate Tailwind config file. The complete 387-line source is `src/app/globals.css` and should be passed in full to design commands because it is below the 900-line threshold.

Core variables:

```css
:root {
  --radius-md: 0.875rem;
  --radius-lg: 1.25rem;
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --app-viewport-height: 100vh;
  --color-background: #171717;
  --color-mac-yellow: #ffe330;
  --color-surface: #1c1c1c;
  --color-surface-raised: #232323;
  --color-border: #34342f;
  --color-text: #f7f7f2;
  --color-text-muted: #a9a99f;
  --color-success: #42d392;
  --color-danger: #ff6b6b;
  --color-info: #6cb6ff;
  --mobile-nav-content-height: 3.75rem;
  --shadow-soft: 0 1px 0 rgb(255 255 255 / 0.04);
}
```

