# FleetGrid

A confidential B2B directory that connects local freight carriers with certified transport operators (CDL drivers, yard spotters, mechanics).

**Status:** Milestone 1 (foundation and driver side).

## Prerequisites

| Tool           | Version         | Notes                                                           |
| -------------- | --------------- | --------------------------------------------------------------- |
| Node.js        | 22 LTS or newer |                                                                 |
| pnpm           | 10 or newer     | `npm install -g pnpm`                                           |
| Docker Desktop | running         | needed by the local Supabase stack                              |
| Supabase CLI   | bundled         | installed as a dev dependency, run it with `pnpm exec supabase` |

## Local setup

```bash
pnpm install
pnpm exec playwright install chromium   # browsers for e2e tests

pnpm exec supabase start                # starts Postgres, Auth, Storage (first run downloads images)
cp .env.example .env.local              # then fill in the keys, see below
pnpm dev                                # http://localhost:3000
```

`supabase start` applies every migration in `supabase/migrations/` and loads `supabase/seed.sql`.

Local services:

| Service                       | URL                                                       |
| ----------------------------- | --------------------------------------------------------- |
| App                           | http://localhost:3000                                     |
| Supabase API                  | http://127.0.0.1:54321                                    |
| Supabase Studio (database UI) | http://127.0.0.1:54333                                    |
| Postgres                      | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Local development always uses the local Supabase stack, never the hosted project.

## Environment variables

Copy `.env.example` to `.env.local`. The app validates these at startup (`src/lib/env.ts`) and refuses to start with a clear message if a required one is missing.

| Variable                                         | Needed in   | Where to get it locally                                |
| ------------------------------------------------ | ----------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`                            | Milestone 1 | `http://localhost:3000`                                |
| `NEXT_PUBLIC_SUPABASE_URL`                       | Milestone 1 | `http://127.0.0.1:54321`                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                  | Milestone 1 | `ANON_KEY` from `pnpm exec supabase status -o env`     |
| `SUPABASE_SERVICE_ROLE_KEY`                      | Milestone 1 | `SERVICE_ROLE_KEY` from the same command. Server only. |
| `TWILIO_*`                                       | Milestone 3 | not needed yet                                         |
| `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Milestone 2 | not needed yet                                         |

Never commit `.env.local`. The service role key, Stripe secret and Twilio credentials must never be imported into client components.

## Logging in locally (test codes)

Real SMS is never sent locally or in tests. These numbers always accept the code **123456**:

| Number                 | Use                          |
| ---------------------- | ---------------------------- |
| (555) 555-0100         | test driver (sign up fresh)  |
| (555) 555-0101         | test carrier (sign up fresh) |
| (555) 555-0102         | seeded **admin**             |
| (555) 555-0103 to 0109 | reserved for automated tests |

The e2e suite deletes and recreates 0100, 0101, 0102 and 0108 before each test, so a browser session on one of them breaks while `pnpm test:e2e` runs ("An unexpected response was received from the server" after an action). To click around while tests run, sign in with 0104 to 0107 instead.

`PREFILL_TEST_LOGIN=true` in `.env.local` starts the login and code forms filled with `TEST_PHONE_DRIVER` and `TEST_OTP`. It is ignored in production builds.

To start over with a number, use "Delete my account" at the bottom of the driver profile or the carrier page. It removes the person's files, documents, card, profile and sign-in (a compliance requirement, available to everyone), so the same number can sign up again.

Any other number fails instead of sending a message. The seed also creates 25 sample drivers (`+15555551001` to `+15555551025`) for search and admin screens. They cannot log in.

The table lives in `supabase/config.toml` under `[auth.sms.test_otp]`. `.env.local` carries the same values as `TEST_PHONE_DRIVER`, `TEST_PHONE_CARRIER`, `TEST_PHONE_ADMIN` and `TEST_OTP` for the e2e tests and for reference; change them only together with that table.

## Scripts

| Command                             | What it does                                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                          | start the app in development                                   |
| `pnpm build` / `pnpm start`         | production build and server                                    |
| `pnpm lint`                         | ESLint                                                         |
| `pnpm typecheck`                    | generate route types and run TypeScript                        |
| `pnpm format` / `pnpm format:check` | Prettier                                                       |
| `pnpm db:reset`                     | rebuild the local database from migrations and seed            |
| `pnpm db:types`                     | regenerate `src/types/database.types.ts` after a schema change |

### Tests

| Command                 | Layer                                                          | Needs                           |
| ----------------------- | -------------------------------------------------------------- | ------------------------------- |
| `pnpm test`             | unit tests (services with fakes, schemas, helpers, components) | nothing                         |
| `pnpm test:watch`       | unit tests in watch mode                                       | nothing                         |
| `pnpm test:coverage`    | unit tests with coverage thresholds                            | nothing                         |
| `pnpm test:db`          | pgTAP: schema, constraints, triggers, RLS policies             | Supabase running                |
| `pnpm test:integration` | repositories, RLS and storage through real clients             | Supabase running, `.env.local`  |
| `pnpm test:e2e`         | Playwright on desktop Chrome, iPhone 13 and Pixel 7 viewports  | Supabase running, `.env.local`  |
| `pnpm test:all`         | everything above plus lint and typecheck                       | Supabase running, `.env.local`  |
| `pnpm design-review`    | screenshots of every onboarding screen next to the prototype   | dev server and Supabase running |

Extra e2e options:

```bash
pnpm exec playwright test --project=mobile-iphone-13     # one device
pnpm exec playwright test tests/e2e/auth.spec.ts          # one file
pnpm exec playwright install webkit                       # once
E2E_WEBKIT=1 pnpm exec playwright test --project=mobile-safari-webkit   # real Safari engine
```

Coverage thresholds (enforced in `vitest.config.ts`): services 95% lines and 90% branches, `src/lib` 95% lines, overall 85% lines. A task is done only when `pnpm test:all` is green.

`pnpm design-review` writes `design-review/index.html` (ignored by git): each of the thirteen
onboarding screens of the running app beside the approved prototype frame in
`tests/design-review/workshop-prototype.html`, at 390×844 in light and dark, plus the grouped
desktop pages. Open the file in a browser to compare.

## Architecture

```
UI (pages, components)
   calls
Server Actions (src/server/actions)      validate with zod, call one service method, return a Result
   calls
Services (src/server/services)           business rules, no SQL, no HTTP
   calls
Repositories (src/server/repositories)   the only place with Supabase queries
Providers (src/server/providers)         Stripe and Twilio behind interfaces (Milestones 2 and 3)
```

- Services depend on repository interfaces. `src/server/container.ts` wires them per request.
- Services throw `AppError` with a typed code. Actions turn that into a `Result`, so raw database errors never reach the UI.
- Every table has Row Level Security. Page access is checked in `src/proxy.ts` (route rules in `src/lib/auth/routes.ts`) and again in server code (`src/lib/auth/guards.ts`).
- Document uploads go from the browser straight to private storage with a one-time token. The server validates before issuing the token and again against the stored file.

Next.js 16 renamed `middleware.ts` to `proxy.ts`. The route guard is `src/proxy.ts`.

## Database changes

All schema changes go through migrations. Never edit the schema by hand.

```bash
# 1. add supabase/migrations/NNNN_description.sql
pnpm db:reset        # apply from scratch
pnpm db:types        # regenerate TypeScript types
pnpm test:db         # add pgTAP tests for the change, including RLS
```

Never edit a migration that has already been applied to a shared environment. Add a new one.

## Switching themes

All colors live in `src/styles/themes.css`. Components use only Tailwind classes that map to those variables (`bg-primary`, `text-muted-foreground`, and so on). A test fails if a hex color, `rgb(` or a Tailwind palette class such as `bg-blue-500` appears in `src/components` or `src/app`.

Three themes are defined and exactly one is active:

1. **Midnight Freight** (active)
2. Steel Signal
3. Route Teal

To switch: in `src/styles/themes.css`, wrap the active `:root { ... }` and `.dark { ... }` blocks in a comment, and remove the comment markers around the theme you want. `pnpm test` checks that every theme defines the same variables, so switching cannot break the UI.

Dark mode is separate from the theme: the toggle in the header saves the choice in the `fleetgrid-theme` cookie and defaults to the system setting.

## Creating an admin user

Nobody can sign up as admin. Locally, the seed creates one: log in with (555) 555-0102 and code 123456.

To make an existing user an admin (local or production), run this SQL as the database owner, for example in Supabase Studio's SQL editor:

```sql
update public.profiles
   set role = 'admin', status = 'approved'
 where phone = '+15555550100';   -- the user's phone in E.164
```

The user must have logged in once and chosen a role first, so that a profile row exists. Users cannot change their own role or status: a database trigger blocks it.

## Deploying to Vercel

1. Create a hosted Supabase project.
2. In Supabase: enable phone sign-in and configure Twilio as the SMS provider (Authentication, Providers, Phone).
3. Apply the migrations to the hosted database:
   ```bash
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push
   ```
   Do not run the seed against production. It contains fake data only.
4. Import the repository in Vercel (framework preset: Next.js, package manager: pnpm).
5. Set the environment variables in Vercel for Production and Preview: `NEXT_PUBLIC_APP_URL` (the deployed URL), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
6. In Supabase, set the Site URL to the deployed URL (Authentication, URL Configuration).
7. Deploy, then check `https://<your-domain>/api/health` returns `{"ok":true}`.

## Data

- `src/data/us-zips.tsv`: US ZIP codes with their city and state, used to fill in the location
  during driver onboarding. Built from the [GeoNames](https://www.geonames.org/) postal code
  export (`US.zip`), licensed under
  [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
  One row per ZIP (the first place GeoNames lists), only the 50 states and DC, tab separated,
  sorted. The lookup runs on the server only. The data goes stale slowly, so the driver can
  always edit the city and state it suggests.

## Project layout

```
supabase/migrations   SQL migrations (schema, helpers, RLS, storage)
supabase/tests        pgTAP database tests
src/app               pages, layouts and route handlers
src/components        ui (shadcn), layout, auth, driver, shared
src/server            actions, services, repositories, errors, container
src/lib               env, constants, phone, image, validation, auth, supabase clients
src/styles/themes.css the only place colors are defined
tests                 unit, integration, e2e, fakes, setup
```
