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

The production app is deployed through Dokploy at
`https://study.monashcoding.com`. The PWA install flow needs HTTPS on a real
phone.

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

## Auth Setup

MAC Study uses the shared account system at `https://auth.monashcoding.com`.
MAC Auth handles Google/Microsoft sign-in and MAC Study exchanges its verified
token for a short-lived Supabase-compatible session. Supabase remains the data
store and enforces Row Level Security.

1. Create a Supabase project.
2. Run the SQL migrations in `supabase/migrations` in filename order.
3. Import an ES256 private signing key into Supabase JWT Signing Keys and keep
   the same private JWK only in the MAC Study server environment.
4. Add these environment variables locally and in Dokploy:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_PRIVATE_JWK=
NEXT_PUBLIC_SITE_URL=https://study.monashcoding.com
NEXT_PUBLIC_MAC_AUTH_URL=https://auth.monashcoding.com
```

The signing JWK is server-only. Never prefix it with `NEXT_PUBLIC_`, expose it
to browser code, or commit it to Git.

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
