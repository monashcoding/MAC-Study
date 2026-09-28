# Architecture hardening plan

This checklist is the review record for the architecture work. Work stops after each phase so the completed phase can be reviewed before the next phase begins.

## Phase checklist

- [x] **Phase 1 — CI quality gates**
  - Commit: `ci: enforce quality and dependency checks`
  - [x] Run on every push and pull request.
  - [x] Install from the lockfile with Node.js 22.
  - [x] Reject high or critical production dependency vulnerabilities.
  - [x] Run lint, typecheck, unit tests, and the production build.
  - [x] Cancel superseded runs on the same branch.
  - [x] Validate all workflow commands locally.
- [x] **Phase 2 — Repeatable local database**
  - Commit: `build: add repeatable Supabase migration checks`
  - [x] Add and document the local Supabase configuration.
  - [x] Prove all migrations apply to an empty database with `supabase db reset`.
  - [x] Add the migration reset check to CI.
  - [x] Resolve migration ordering, extension, seed, port, or environment assumptions found by the reset.
- [x] **Phase 3 — Generated database types**
  - Commit: `refactor: add generated Supabase database types`
  - [x] Generate TypeScript types from the reset schema.
  - [x] Parameterize every existing browser, server, and admin Supabase client (there is no Supabase middleware client).
  - [x] Replace handwritten database row types where generated types are authoritative.
  - [x] Add a repeatable type-generation command and a stale-types check.
- [x] **Phase 4 — Feature data modules**
  - Commit: `refactor: split app data by feature`
  - [x] Split `app-data.ts` into timer, units, groups, friends, chat, and notifications modules.
  - [x] Keep authorization and server-only boundaries explicit.
  - [x] Remove duplicated subject reads and preserve all 69 existing public exports during migration.
  - [x] Review extracted logic and access rules; no new behavior required additional focused tests.
- [x] **Phase 5 — Focused reads and cache correctness**
  - Commit: `perf: replace broad reads and harden cache invalidation`
  - [x] Inventory every consumer of the broad social snapshot.
  - [x] Replace it with focused RPCs, pagination, and aggregate queries.
  - [x] Add or verify supporting indexes with query evidence.
  - [x] Add freshness timestamps and mutation/realtime invalidation to client caches.
  - [x] Verify stale data is not retained after relevant writes.
- [ ] **Phase 6 — Critical browser coverage**
  - Planned commit: `test: add critical Playwright coverage`
  - [ ] Cover authentication routing.
  - [ ] Cover starting a timer.
  - [ ] Cover creating a group.
  - [ ] Cover an RLS-sensitive access denial.
  - [ ] Run the Playwright suite in CI and document required test data/environment.

## Current review gate

- [x] Review Phase 1 and approve starting Phase 2.
- [x] Review Phase 2 and approve starting Phase 3.
- [x] Review Phase 3 and approve starting Phase 4.
- [x] Review Phase 4 and approve starting Phase 5.
- [ ] Review Phase 5 and approve starting Phase 6.
