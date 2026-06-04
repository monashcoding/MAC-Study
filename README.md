# MAC Study

MAC Study is a mobile-first PWA for Monash Association of Coding students to
track study time, study with friends, and compete in lightweight group
leaderboards.

## Current Build

- Next.js App Router with TypeScript
- Tailwind CSS with MAC dark/yellow theme tokens
- Local timestamp-based study timer prototype
- PWA manifest and starter service worker
- Install-ready PNG/SVG icons for iPhone and Android
- Supabase-ready schema migration scaffold

## Getting Started

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example` before wiring Supabase auth or database
features.

## Deploy And Test On Phone

The PWA install flow needs HTTPS on a real phone. The quickest path is Vercel:

```bash
npm run build
npx vercel
```

After Vercel gives you an HTTPS URL, open `/app` on your phone.

iPhone:

- Open the URL in Safari.
- Tap Share.
- Tap Add to Home Screen.
- Open MAC Study from the new home-screen icon.

Android:

- Open the URL in Chrome.
- Tap the three-dot menu.
- Tap Add to Home screen or Install app.
- Open MAC Study from the new app icon.

The MVP PWA can feel app-like with a home-screen icon, standalone window, app
shell caching, and future push notifications. Native iOS/Android widgets,
Dynamic Island, and Live Activities are not available to a web-only PWA and
belong in the later native extension.

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm run test
npm run lint
```

## License

MAC Study is proprietary software. All rights reserved.
No part of this codebase may be copied, modified, distributed, or used without
permission.
