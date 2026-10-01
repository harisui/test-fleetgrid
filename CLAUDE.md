@AGENTS.md

# FleetGrid

The single source of truth is [Artifacts/Requirements.md](Artifacts/Requirements.md). Read it before any task and update its Progress Log after every task.

## Non-negotiable rules

- One task at a time. Each task ends with lint, typecheck and tests green, a conventional commit, and a Progress Log entry.
- Never weaken a test to make it pass.
- Layers: UI, then server actions (thin, zod, return `Result`), then services (business logic, interfaces only), then repositories (the only place with Supabase queries) and providers.
- All schema changes go through `supabase/migrations/`. Every table has Row Level Security and tests.
- Service role key, Stripe secret and Twilio credentials are server only. Never commit secrets.
- No hardcoded colors in `src/components` or `src/app`. Colors live only in `src/styles/themes.css`.
- No `any`. Server Components by default.

## Decisions that differ from the brief

- Next.js 16 renamed `middleware.ts` to `proxy.ts`. The request guard lives in `src/proxy.ts`. The session helper stays at `src/lib/supabase/middleware.ts`.
- `src/instrumentation.ts` validates env at server start (fail fast).
- Server-side unit tests start with `// @vitest-environment node`. Component tests use the default jsdom environment.

## Commands

- `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`
- `pnpm test:db`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:all`
