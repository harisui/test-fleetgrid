# FleetGrid V1: Master Brief for Claude Code

> **Read this whole file before doing anything.** It is the single source of truth.
> We are starting **Milestone 1**. Do not build anything from Milestone 2 or 3 until told.
> After every completed task, update the **Progress Log** at the bottom.

---

## 0. How You Must Work

1. **Plan, then build.** For every task: write a short plan (files to create or change, tests to write), wait for approval, then implement.
2. **One task at a time.** Finish it, test it, commit it, log it. Then the next.
3. **Tests are mandatory.** No task is done without tests. Write tests alongside the code (test first where practical). Every task's "Done when" must be proven by passing tests.
4. **Definition of done for every task:**
   - `pnpm lint` passes
   - `pnpm typecheck` passes
   - `pnpm test` (unit) passes
   - `pnpm test:integration` passes (when the task touches the database)
   - `pnpm test:e2e` passes (when the task touches a user flow)
   - Coverage thresholds are met (section 9)
   - Progress Log updated
5. **Never weaken a test to make it pass.** If a test fails, fix the code. If the test itself is wrong, explain why before changing it.
6. **All database changes go through migrations** in `supabase/migrations/`. Never edit schema manually.
7. **Row Level Security on every table.** No table ships without policies and RLS tests.
8. **Server-only secrets stay server-only.** The service role key, Stripe secret and Twilio credentials are never imported into client components.
9. **Never commit secrets.** `.env.local` is gitignored. `.env.example` lists every variable with empty values.
10. **Ask before anything destructive:** dropping tables, deleting data, force pushing, editing applied migrations.
11. **If anything here is unclear or contradicts itself, stop and ask.** Do not guess.
12. **Commits:** small, conventional (`feat:`, `fix:`, `test:`, `chore:`, `refactor:`), one task per commit or less.

---

## 1. Product Summary

**FleetGrid** is a confidential B2B SaaS directory connecting **local freight carriers** with **certified transport operators** (CDL drivers, yard spotters, mechanics).

| Role | Summary |
| --- | --- |
| **Driver** | Signs up on mobile with an SMS code, fills a qualification card, uploads documents, consents to SMS. Receives shift offers by SMS and replies YES to claim. |
| **Carrier** | Signs up by SMS code, accepts Terms, pays $399/month (Stripe), searches drivers, posts shifts, clicks Broadcast, watches claims live. |
| **Admin** | Manages drivers, carriers, subscriptions, shifts. |

**Broadcast Shift (core feature):** carrier posts a shift, clicks Broadcast, matching drivers get an SMS with a 4-digit code, the **first** driver to reply `YES <code>` wins. Atomic, no double booking, ever.

### Out of scope (do not build)
- Payroll or any payment to drivers. Stripe is only the carrier subscription.
- Paid boilerplates or templates.
- Native mobile apps. Mobile-first responsive web only.
- A driver job board. Drivers do not browse or apply.
- Email sending beyond Stripe receipts. All auth is phone OTP.
- Public marketing website (minimal landing only).

---

## 2. Tech Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js latest stable, App Router, TypeScript `strict` |
| Package manager | pnpm |
| Styling | Tailwind CSS v4 + shadcn/ui, all colors via CSS variables (section 6) |
| Icons | lucide-react |
| Forms | react-hook-form + zod (shared schemas client and server) |
| Database | Supabase Postgres, migrations via Supabase CLI |
| Auth | Supabase Auth, phone OTP for all roles (Twilio as SMS provider) |
| Storage | Supabase Storage, private bucket |
| Realtime | Supabase Realtime (Milestone 3) |
| Supabase client | `@supabase/ssr` |
| Payments | Stripe (Milestone 2) |
| SMS | Twilio Messaging Service (Milestone 3) |
| Hosting | Vercel |
| Unit and integration tests | Vitest + @testing-library/react + jsdom |
| DB tests | pgTAP via `supabase test db` |
| E2E tests | Playwright |
| Image compression | browser-image-compression |
| Dates | date-fns + date-fns-tz |
| CI | GitHub Actions |

---

## 3. Exact Directory Structure

Create exactly this structure. Add files only inside these folders. If a new folder seems needed, ask first.

```
fleetgrid/
├── CLAUDE.md
├── README.md
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml
├── components.json                     # shadcn config
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.ts                    # unit tests
├── vitest.integration.config.ts        # integration tests (real local Supabase)
├── public/
│   └── favicon.ico
├── supabase/
│   ├── config.toml
│   ├── seed.sql
│   ├── migrations/
│   │   ├── 0001_extensions_and_enums.sql
│   │   ├── 0002_core_tables.sql
│   │   ├── 0003_helper_functions.sql
│   │   ├── 0004_rls_policies.sql
│   │   ├── 0005_storage.sql
│   │   └── ...                         # later milestones append here
│   └── tests/                          # pgTAP
│       ├── 001_schema.test.sql
│       ├── 002_rls_profiles.test.sql
│       ├── 003_rls_drivers.test.sql
│       └── 004_storage.test.sql
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── not-found.tsx
│   │   ├── error.tsx
│   │   ├── (public)/
│   │   │   ├── page.tsx                # minimal landing
│   │   │   ├── terms/page.tsx
│   │   │   ├── privacy/page.tsx
│   │   │   └── sms-terms/page.tsx
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx          # enter phone
│   │   │   ├── verify/page.tsx         # enter code
│   │   │   └── choose-role/page.tsx
│   │   ├── driver/
│   │   │   ├── layout.tsx
│   │   │   ├── onboarding/page.tsx
│   │   │   ├── profile/page.tsx
│   │   │   └── documents/page.tsx
│   │   ├── carrier/                    # Milestone 2
│   │   ├── admin/                      # Milestone 3
│   │   └── api/
│   │       └── health/route.ts
│   ├── components/
│   │   ├── ui/                         # shadcn generated, do not hand-edit logic
│   │   ├── layout/                     # AppShell, Header, MobileNav, Footer
│   │   ├── auth/                       # PhoneForm, OtpForm, RoleChooser
│   │   ├── driver/                     # OnboardingStepper, step components, DocumentUploader
│   │   └── shared/                     # EmptyState, LoadingButton, FormField, StatusBadge
│   ├── server/
│   │   ├── container.ts                # builds services with their dependencies
│   │   ├── actions/                    # Next.js server actions, thin, call services
│   │   │   ├── auth.actions.ts
│   │   │   └── driver.actions.ts
│   │   ├── services/                   # business logic classes
│   │   │   ├── AuthService.ts
│   │   │   ├── ProfileService.ts
│   │   │   ├── DriverService.ts
│   │   │   └── DocumentService.ts
│   │   ├── repositories/               # data access classes, only place that queries Supabase
│   │   │   ├── BaseRepository.ts
│   │   │   ├── ProfileRepository.ts
│   │   │   ├── DriverRepository.ts
│   │   │   └── DocumentRepository.ts
│   │   ├── providers/                  # third-party wrappers behind interfaces
│   │   │   └── (Milestone 2 and 3: StripeProvider, TwilioSmsProvider)
│   │   └── errors/
│   │       └── AppError.ts
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts               # server component / action client
│   │   │   ├── browser.ts              # browser client
│   │   │   ├── admin.ts                # service role client, server only
│   │   │   └── middleware.ts           # session refresh helper
│   │   ├── auth/
│   │   │   └── guards.ts               # requireUser, requireRole
│   │   ├── validation/                 # zod schemas
│   │   │   ├── phone.schema.ts
│   │   │   ├── driver.schema.ts
│   │   │   └── document.schema.ts
│   │   ├── constants.ts
│   │   ├── phone.ts                    # E.164 normalize and format
│   │   ├── image.ts                    # compression helper
│   │   └── utils.ts                    # cn() and small helpers
│   ├── styles/
│   │   └── themes.css                  # theme variables (section 6)
│   ├── types/
│   │   ├── database.types.ts           # generated by Supabase CLI
│   │   └── domain.ts                   # app-level types
│   └── middleware.ts
└── tests/
    ├── setup/
    │   ├── unit.setup.ts
    │   ├── integration.setup.ts
    │   └── factories.ts                # test data builders
    ├── fakes/                          # in-memory fakes for repositories and providers
    │   ├── FakeProfileRepository.ts
    │   ├── FakeDriverRepository.ts
    │   └── FakeDocumentRepository.ts
    ├── unit/
    │   ├── lib/
    │   ├── services/
    │   └── components/
    ├── integration/
    │   ├── repositories/
    │   └── rls/
    └── e2e/
        ├── auth.spec.ts
        ├── driver-onboarding.spec.ts
        └── helpers.ts
```

---

## 4. Code Architecture and Class Rules

The codebase uses **thin routes, service classes, repository classes, provider classes**. Each layer has one job.

```
UI (pages, components)
   ↓ calls
Server Actions (src/server/actions)      validate input with zod, call one service method, return a Result
   ↓ calls
Services (src/server/services)           business rules, orchestration, no SQL, no HTTP
   ↓ calls
Repositories (src/server/repositories)   all Supabase queries, map rows to domain types
Providers (src/server/providers)         Stripe, Twilio, behind interfaces
```

### Rules

1. **Pages and components never query Supabase directly**, except the browser client for auth session and Realtime subscriptions.
2. **Server actions are thin.** Validate with zod, get the service from the container, call it, return a `Result`.
3. **Services contain all business logic.** They depend on repository and provider **interfaces**, never concrete classes.
4. **Repositories are the only place with Supabase queries.** One repository per aggregate (profiles, drivers, documents, and later carriers, subscriptions, shifts).
5. **Providers wrap third parties** (Stripe, Twilio) behind interfaces like `SmsProvider` and `PaymentProvider`, so tests use fakes.
6. **Dependency injection by constructor.** `src/server/container.ts` builds services per request with the right Supabase client.
7. **Errors:** services throw `AppError` with a typed `code` (`NOT_FOUND`, `FORBIDDEN`, `VALIDATION`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`). Actions convert them to a `Result`. Never leak raw database errors to the UI.
8. **Result type for actions:**
   ```ts
   export type Result<T> =
     | { ok: true; data: T }
     | { ok: false; error: { code: AppErrorCode; message: string; fieldErrors?: Record<string, string> } };
   ```
9. **Naming:** classes `PascalCase`, files match class names, interfaces prefixed with `I` only when there's a concrete class of the same name (`IDriverRepository` / `DriverRepository`). zod schemas end in `Schema`. Server action files end in `.actions.ts`.
10. **No `any`.** Use generated `database.types.ts` for row types.
11. **Server Components by default.** `"use client"` only for interactivity.

### Example shape (follow this pattern)

```ts
// src/server/repositories/DriverRepository.ts
export interface IDriverRepository {
  findByProfileId(profileId: string): Promise<Driver | null>;
  upsertCard(profileId: string, input: DriverCardInput): Promise<Driver>;
}

export class DriverRepository extends BaseRepository implements IDriverRepository {
  async findByProfileId(profileId: string) { /* supabase query, map row */ }
  async upsertCard(profileId: string, input: DriverCardInput) { /* ... */ }
}

// src/server/services/DriverService.ts
export class DriverService {
  constructor(
    private readonly drivers: IDriverRepository,
    private readonly profiles: IProfileRepository,
  ) {}

  async saveStep(userId: string, step: OnboardingStep, input: unknown): Promise<Driver> {
    // validate, enforce rules, call repositories
  }
}

// src/server/container.ts
export async function getContainer() {
  const supabase = await createServerClient();
  const profiles = new ProfileRepository(supabase);
  const drivers = new DriverRepository(supabase);
  return {
    driverService: new DriverService(drivers, profiles),
    // ...
  };
}
```

Unit tests construct services with fakes from `tests/fakes/`. Integration tests construct real repositories against local Supabase.

---

## 5. Environment Variables

`.env.example`:

```
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Twilio (used by Supabase Auth via dashboard config; app use starts Milestone 3)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=

# Stripe (Milestone 2)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_MONTHLY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

Validate env at startup with a zod schema in `src/lib/env.ts`. Fail fast with a clear message if anything required for the current milestone is missing.

**Local development uses the local Supabase stack** (`supabase start`), not the hosted project. Real SMS is never sent in tests or local dev. Use Supabase test OTP numbers (section 9.4).

---

## 6. Theme System

All colors live in CSS variables in `src/styles/themes.css`, imported by `src/app/globals.css`. **No hardcoded colors anywhere in components.** Only Tailwind classes that map to these variables (`bg-primary`, `text-muted-foreground`, `border-border`, etc.).

Three themes are defined. **Theme 1 is active.** Themes 2 and 3 are commented out. To switch, comment the active block and uncomment another. Each theme has light and dark values.

### `src/styles/themes.css`

```css
/* =========================================================
   FLEETGRID THEMES
   Only ONE theme block should be active at a time.
   To switch: comment out the active block, uncomment another.
   Components must only use these variables, never raw colors.
   ========================================================= */

/* ---------------------------------------------------------
   THEME 1: MIDNIGHT FREIGHT (ACTIVE)
   Deep navy with highway amber. Trustworthy, logistics-grade.
   --------------------------------------------------------- */
:root {
  --radius: 0.625rem;

  --background: #ffffff;
  --foreground: #0b1726;

  --card: #ffffff;
  --card-foreground: #0b1726;
  --popover: #ffffff;
  --popover-foreground: #0b1726;

  --primary: #0f2a4a;
  --primary-foreground: #ffffff;

  --secondary: #eef2f7;
  --secondary-foreground: #0f2a4a;

  --muted: #f4f6f9;
  --muted-foreground: #5b6b80;

  --accent: #f59e0b;
  --accent-foreground: #1a1204;

  --destructive: #dc2626;
  --destructive-foreground: #ffffff;

  --success: #16a34a;
  --success-foreground: #ffffff;
  --warning: #d97706;
  --warning-foreground: #ffffff;

  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #f59e0b;

  --sidebar: #0f2a4a;
  --sidebar-foreground: #e6edf5;
}

.dark {
  --background: #08121f;
  --foreground: #e6edf5;

  --card: #0d1b2d;
  --card-foreground: #e6edf5;
  --popover: #0d1b2d;
  --popover-foreground: #e6edf5;

  --primary: #f59e0b;
  --primary-foreground: #1a1204;

  --secondary: #16283f;
  --secondary-foreground: #e6edf5;

  --muted: #13243a;
  --muted-foreground: #94a3b8;

  --accent: #fbbf24;
  --accent-foreground: #1a1204;

  --destructive: #ef4444;
  --destructive-foreground: #ffffff;

  --success: #22c55e;
  --success-foreground: #04120a;
  --warning: #f59e0b;
  --warning-foreground: #1a1204;

  --border: #1f3350;
  --input: #1f3350;
  --ring: #fbbf24;

  --sidebar: #050d17;
  --sidebar-foreground: #e6edf5;
}

/* ---------------------------------------------------------
   THEME 2: STEEL SIGNAL
   Graphite steel with signal orange. Industrial, high contrast.
   ---------------------------------------------------------
:root {
  --radius: 0.5rem;

  --background: #ffffff;
  --foreground: #111827;

  --card: #ffffff;
  --card-foreground: #111827;
  --popover: #ffffff;
  --popover-foreground: #111827;

  --primary: #1f2937;
  --primary-foreground: #ffffff;

  --secondary: #f3f4f6;
  --secondary-foreground: #1f2937;

  --muted: #f5f5f4;
  --muted-foreground: #6b7280;

  --accent: #ea580c;
  --accent-foreground: #ffffff;

  --destructive: #dc2626;
  --destructive-foreground: #ffffff;

  --success: #16a34a;
  --success-foreground: #ffffff;
  --warning: #ca8a04;
  --warning-foreground: #ffffff;

  --border: #e5e7eb;
  --input: #e5e7eb;
  --ring: #ea580c;

  --sidebar: #1f2937;
  --sidebar-foreground: #f3f4f6;
}

.dark {
  --background: #0c0f14;
  --foreground: #f3f4f6;

  --card: #151a21;
  --card-foreground: #f3f4f6;
  --popover: #151a21;
  --popover-foreground: #f3f4f6;

  --primary: #f97316;
  --primary-foreground: #1a0a02;

  --secondary: #1f2630;
  --secondary-foreground: #f3f4f6;

  --muted: #1a2029;
  --muted-foreground: #9ca3af;

  --accent: #fb923c;
  --accent-foreground: #1a0a02;

  --destructive: #ef4444;
  --destructive-foreground: #ffffff;

  --success: #22c55e;
  --success-foreground: #04120a;
  --warning: #eab308;
  --warning-foreground: #1a1402;

  --border: #2a313c;
  --input: #2a313c;
  --ring: #fb923c;

  --sidebar: #090c10;
  --sidebar-foreground: #f3f4f6;
}
--------------------------------------------------------- */

/* ---------------------------------------------------------
   THEME 3: ROUTE TEAL
   Deep teal with lime go-signal. Modern, calm, fresh.
   ---------------------------------------------------------
:root {
  --radius: 0.75rem;

  --background: #ffffff;
  --foreground: #0a1f1d;

  --card: #ffffff;
  --card-foreground: #0a1f1d;
  --popover: #ffffff;
  --popover-foreground: #0a1f1d;

  --primary: #0f766e;
  --primary-foreground: #ffffff;

  --secondary: #ecf7f5;
  --secondary-foreground: #0f4f4a;

  --muted: #f3f8f7;
  --muted-foreground: #5a706d;

  --accent: #84cc16;
  --accent-foreground: #142002;

  --destructive: #dc2626;
  --destructive-foreground: #ffffff;

  --success: #16a34a;
  --success-foreground: #ffffff;
  --warning: #d97706;
  --warning-foreground: #ffffff;

  --border: #dbe7e5;
  --input: #dbe7e5;
  --ring: #0f766e;

  --sidebar: #0f4f4a;
  --sidebar-foreground: #e8f5f3;
}

.dark {
  --background: #061413;
  --foreground: #e3f2f0;

  --card: #0b1f1d;
  --card-foreground: #e3f2f0;
  --popover: #0b1f1d;
  --popover-foreground: #e3f2f0;

  --primary: #2dd4bf;
  --primary-foreground: #042420;

  --secondary: #12302d;
  --secondary-foreground: #e3f2f0;

  --muted: #102926;
  --muted-foreground: #8fb3ae;

  --accent: #a3e635;
  --accent-foreground: #142002;

  --destructive: #ef4444;
  --destructive-foreground: #ffffff;

  --success: #22c55e;
  --success-foreground: #04120a;
  --warning: #f59e0b;
  --warning-foreground: #1a1204;

  --border: #1d3d39;
  --input: #1d3d39;
  --ring: #2dd4bf;

  --sidebar: #031110;
  --sidebar-foreground: #e3f2f0;
}
--------------------------------------------------------- */
```

### `src/app/globals.css` maps variables to Tailwind

```css
@import "tailwindcss";
@import "../styles/themes.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground antialiased; }
}
```

If the installed shadcn/ui version generates its own token block, merge it so **themes.css stays the only place colors are defined**.

### Theme tests
- A unit test parses `themes.css` and asserts the active block defines every required variable for both `:root` and `.dark`.
- A unit test asserts the two commented themes define the same variable set (parse comment blocks), so uncommenting never breaks the UI.
- An ESLint or grep-based test fails if any file in `src/components` or `src/app` contains a hex color, `rgb(`, or Tailwind palette classes like `bg-blue-500`.

### Design guidelines
- Logistics software, not a consumer app. Clean, dense where useful, very readable.
- Driver screens: large tap targets (min 44px), one question per screen where possible, perfect at 375px width.
- Every async action has loading, success and error states. Toasts for feedback.
- Accessible: labels on every input, visible focus rings, keyboard navigation, contrast AA minimum.
- Dark mode toggle in the header, persisted in a cookie, defaults to system.

---

## 7. Database Schema

All tables: `id uuid primary key default gen_random_uuid()` unless stated, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` maintained by a shared trigger.

### Enums (0001)
```
user_role:           driver | carrier | admin
account_status:      pending | approved | blocked
operator_type:       cdl_driver | yard_spotter | mechanic
cdl_class:           A | B | C | none
endorsement:         H | N | P | S | T | X
availability_type:   full_time | part_time | on_call | weekends
document_type:       cdl_front | cdl_back | medical_card | certification | other
```
Later milestones add: `subscription_status`, `shift_status`, `recipient_status`, `sms_direction`.

### Milestone 1 tables (0002)

**profiles**
- `id uuid pk` references `auth.users(id)` on delete cascade
- `role user_role not null`
- `phone text unique not null` (E.164)
- `status account_status not null default 'pending'`

**drivers**
- `profile_id uuid unique not null` references profiles on delete cascade
- `full_name text not null`
- `operator_types operator_type[] not null check (cardinality(operator_types) > 0)`
- `cdl_class cdl_class not null default 'none'`
- `endorsements endorsement[] not null default '{}'`
- `years_experience int not null check (years_experience between 0 and 60)`
- `city text`, `state char(2) not null`, `zip text not null check (zip ~ '^\d{5}$')`
- `service_radius_miles int not null default 50 check (service_radius_miles between 5 and 500)`
- `availability availability_type[] not null check (cardinality(availability) > 0)`
- `certifications text[] not null default '{}'`
- `bio text check (char_length(bio) <= 500)`
- `sms_opt_in boolean not null default false`
- `sms_opt_in_at timestamptz`
- `sms_opt_in_text text`
- `sms_opted_out boolean not null default false`
- `sms_opted_out_at timestamptz`
- `onboarding_step int not null default 1`
- `card_completed boolean not null default false`
- Constraint: if `sms_opt_in` is true then `sms_opt_in_at` and `sms_opt_in_text` are not null.

Note: during onboarding, a partial row is created at step 1. Use nullable columns or step-based validation so partial saves work, but `card_completed = true` requires all required fields. Enforce with a check constraint or trigger and test it.

**driver_documents**
- `driver_id uuid not null` references drivers on delete cascade
- `type document_type not null`
- `storage_path text not null unique`
- `file_name text not null`, `mime_type text not null`, `size_bytes int not null check (size_bytes <= 10485760)`

**tos_acceptances** (created now, used in Milestone 2)
- `profile_id uuid not null` references profiles on delete cascade
- `version text not null`
- `accepted_at timestamptz not null default now()`
- `ip text`, `user_agent text`

### Helper functions (0003), `security definer`, `stable`, `set search_path = public`
- `auth_role() returns user_role`
- `is_admin() returns boolean`
- `current_driver_id() returns uuid`
- Trigger: prevent users from changing their own `role` or `status` (only admin or service role can).

### Indexes
- drivers: `state`, `zip`, GIN on `operator_types`, `endorsements`, `availability`

---

## 8. Row Level Security (0004) and Storage (0005)

| Table | Driver | Carrier | Admin |
| --- | --- | --- | --- |
| profiles | select/update own (not role, not status) | select/update own | all |
| drivers | select/insert/update own | Milestone 2 (subscription-gated) | all |
| driver_documents | select/insert/delete own | none (signed URL route in M2) | all |
| tos_acceptances | insert/select own | insert/select own | select all |

Profiles insert: a user may insert only their own profile row (`id = auth.uid()`), only once, with role `driver` or `carrier` (never `admin`).

### Storage
- Bucket `driver-documents`, **private**.
- Object path: `{driver_id}/{uuid}.{ext}`.
- Drivers can upload, read and delete only inside their own `{driver_id}/` folder.
- Allowed: jpg, jpeg, png, webp, pdf. Max 10 MB. Images compressed client-side to under 1 MB and max 2000px before upload.

---

## 9. Testing Strategy (mandatory)

Goal: **every feature proven by automated tests.** Tests reduce risk; they do not replace real-device QA, which is also required at each milestone end.

### 9.1 Layers

| Layer | Tool | What it covers | Command |
| --- | --- | --- | --- |
| Unit | Vitest | services (with fakes), zod schemas, lib helpers, components | `pnpm test` |
| Integration | Vitest + local Supabase | repositories, RLS behavior through real clients, storage policies | `pnpm test:integration` |
| Database | pgTAP | schema, constraints, triggers, RLS policies at SQL level | `pnpm test:db` |
| E2E | Playwright | full user flows in a browser, mobile viewport included | `pnpm test:e2e` |

`package.json` scripts:
```
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:integration": "vitest run -c vitest.integration.config.ts",
"test:db": "supabase test db",
"test:e2e": "playwright test",
"test:all": "pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm test:db && pnpm test:integration && pnpm test:e2e"
```

### 9.2 Coverage thresholds (enforced in vitest.config.ts)
- `src/server/services/**`: 95% lines, 90% branches
- `src/lib/**`: 95% lines
- `src/server/repositories/**`: covered by integration tests, every public method has at least one test
- Overall: 85% lines minimum

### 9.3 What every task must test
- **Happy path** and **every validation failure** for each schema and service method.
- **Authorization:** the wrong role, or another user, is rejected.
- **RLS:** for each table, prove a user cannot read or write another user's rows, and anon cannot read anything.
- **Edge cases:** empty inputs, max lengths, duplicate submissions, partial saves, refresh mid-flow.

### 9.4 SMS in tests
Real SMS is **never** sent in tests or local dev. In `supabase/config.toml` configure test OTPs:
```toml
[auth.sms]
enable_signup = true
enable_confirmations = true

[auth.sms.test_otp]
15555550100 = "123456"   # test driver
15555550101 = "123456"   # test carrier
15555550102 = "123456"   # test admin
```
E2E and integration tests use these numbers only.

### 9.5 Test data
- `tests/setup/factories.ts` builds valid domain objects with overrides.
- Integration tests create users via the admin API and clean up after each test file.
- Tests are independent and can run in any order.

### 9.6 CI (`.github/workflows/ci.yml`)
On every push and PR: install pnpm, install deps, start Supabase locally (`supabase start`), run migrations, then `pnpm test:all`. Install Playwright browsers. Fail the build on any failure.

---

## 10. Milestone 1: Foundation and Driver Side

**Due:** October 9, 2026. Tasks in order. Do not skip ahead.

### T1.1 Project scaffold
- Next.js (latest stable) with TypeScript strict, App Router, `src/` dir, pnpm.
- ESLint, Prettier, path alias `@/*`.
- Create the full directory structure from section 3 (empty files where noted).
- `src/lib/env.ts` with zod env validation.
- `/api/health` returns `{ ok: true }`.
- **Tests:** env validation unit tests (valid, missing, malformed); health route test.
- **Done when:** `pnpm dev` runs, lint and typecheck pass, tests pass.

### T1.2 Testing infrastructure
- Vitest (unit and integration configs), Testing Library, jsdom, coverage with thresholds.
- Playwright with projects for desktop Chrome and mobile (iPhone 13 and Pixel 7 viewports).
- `tests/setup`, `tests/fakes`, `tests/setup/factories.ts`.
- GitHub Actions CI.
- **Tests:** a smoke unit test, a smoke e2e test loading `/`.
- **Done when:** `pnpm test:all` runs green locally and in CI.

### T1.3 Theme and UI foundation
- Tailwind v4, shadcn/ui init, `themes.css` exactly as section 6, `globals.css` mapping.
- Base shadcn components: button, input, label, form, select, checkbox, card, badge, progress, dialog, toast (sonner), skeleton.
- Layout components: AppShell, Header (with dark mode toggle), MobileNav, Footer.
- Shared components: LoadingButton, FormField, EmptyState, StatusBadge.
- **Tests:** theme variable tests (section 6), no-hardcoded-colors test, component tests for each shared component, dark mode toggle persists.
- **Done when:** switching themes by commenting and uncommenting works with no visual breakage, all tests pass.

### T1.4 Supabase local setup and schema
- `supabase init`, `config.toml` with test OTPs (section 9.4), phone auth enabled.
- Migrations 0001 to 0003 (enums, tables, helpers, triggers, indexes).
- Generate `database.types.ts` (`pnpm db:types` script).
- `seed.sql` with fake data (section 15).
- **Tests (pgTAP):** every table, column, type, constraint and trigger exists and behaves (check constraints reject bad data, role/status change blocked for non-admins, updated_at trigger works).
- **Done when:** `supabase db reset` runs clean, `pnpm test:db` passes.

### T1.5 RLS and storage
- Migrations 0004 (policies) and 0005 (bucket and storage policies).
- **Tests:** pgTAP policy tests, plus integration tests using real authenticated clients for two different drivers and anon: each can only access their own rows and files. Admin can access all.
- **Done when:** every row in the RLS table (section 8) is proven by a test.

### T1.6 Core classes
- `AppError`, `Result` helpers, `BaseRepository`.
- `ProfileRepository`, `DriverRepository`, `DocumentRepository` with interfaces.
- `ProfileService`, `DriverService`, `DocumentService`, `AuthService`.
- `container.ts`.
- Fakes for every repository in `tests/fakes/`.
- **Tests:** unit tests for every service method using fakes; integration tests for every repository method against local Supabase.
- **Done when:** coverage thresholds met.

### T1.7 Phone OTP authentication
- `/login`: US phone input, formats as typed, normalizes to E.164 (`src/lib/phone.ts`). 60-second resend cooldown.
- `/verify`: 6-digit code input with autofill support (`autocomplete="one-time-code"`), paste support, error states, resend.
- After verify: if no profile, go to `/choose-role`. If profile exists, route by role.
- `/choose-role`: Driver or Carrier. Creates profile via `ProfileService`. Carrier lands on a placeholder "Carrier setup coming soon" page in Milestone 1.
- `middleware.ts`: refresh session, protect `/driver/*`, `/carrier/*`, `/admin/*` by role, redirect logged-out users to `/login`.
- `src/lib/auth/guards.ts`: `requireUser()`, `requireRole(role)` for server code.
- Logout.
- **Tests:** phone normalization unit tests (valid, invalid, international rejected), schema tests, service tests, middleware tests for every route and role combination, e2e: full login with test OTP on mobile and desktop, wrong code, expired session redirect, role routing.
- **Done when:** a test driver can log in, choose role, and is routed correctly. Wrong roles are blocked everywhere.

### T1.8 Driver onboarding (qualification card)
Multi-step, mobile-first, progress bar, each step saved on Next, resumable after refresh or logout (uses `onboarding_step`).

1. **Basics:** full name, city, state (US states select), ZIP, service radius.
2. **Role and licenses:** operator types (multi), CDL class, endorsements (shown when CDL class is not none), years of experience, certifications (tag input).
3. **Availability:** availability types (multi), bio (500 max with counter).
4. **Documents:** see T1.9 (optional, can skip).
5. **SMS consent (required):** unchecked checkbox with this exact text, stored verbatim with timestamp:
   > I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.
6. **Done screen:** "Your profile is under review. You'll get texts when matching shifts open."

- Store the consent text as a constant in `src/lib/constants.ts` (`SMS_CONSENT_TEXT`, `SMS_CONSENT_VERSION`).
- `card_completed` set only when all required steps are valid.
- **Tests:** zod schema tests for every step (every field valid and invalid), service tests (partial save, resume, completion rules, consent required, consent text stored exactly), component tests for each step, e2e: complete onboarding on mobile viewport, refresh mid-flow resumes at the right step, cannot finish without consent, back navigation keeps data.
- **Done when:** a driver can complete the card on a phone-sized screen and every field is correct in the database.

### T1.9 Document uploads
- Upload CDL front, CDL back, medical card, certifications, other.
- Client-side image compression (`src/lib/image.ts`), PDFs uploaded as is.
- Type and size validation on client and server.
- List, preview (signed URL for own documents only, 60 seconds), delete.
- **Tests:** validation unit tests, compression helper tests, service tests, storage integration tests (own folder only, other driver denied, anon denied, size and type limits), e2e: upload image, upload PDF, reject oversize, reject wrong type, delete.
- **Done when:** uploads work on mobile and are inaccessible to anyone else.

### T1.10 Driver profile
- `/driver/profile`: view and edit all card fields after onboarding.
- `/driver/documents`: manage documents.
- Show account status (pending, approved, blocked) and SMS status. If opted out, explain how to re-subscribe (text START).
- **Tests:** service and component tests, e2e edit and save.

### T1.11 Public pages
- `/`: minimal landing. Headline, one sentence for carriers, one for drivers, buttons "I'm a Driver" and "I'm a Carrier" (both go to `/login`, role preselected via query param).
- `/terms`, `/privacy`: placeholder pages with a clear banner: "Legal text to be provided by FleetGrid."
- `/sms-terms`: SMS program details for Twilio A2P 10DLC: program name, what messages are sent, frequency, "Msg & data rates may apply", STOP and HELP instructions, support contact placeholder, link to privacy policy.
- **Tests:** component tests, e2e pages render and links work, accessibility check with `@axe-core/playwright` on every public page.

### T1.12 Milestone 1 QA and handoff
- Run `pnpm test:all` green.
- Real-device check on iOS Safari and Android Chrome (document results in the log).
- README updated: setup, scripts, testing, Supabase local, theme switching.
- Deploy preview to Vercel.
- **Done when:** every Milestone 1 acceptance criterion below is met.

### Milestone 1 acceptance criteria
- [ ] A driver signs up by SMS code on a phone, completes the qualification card, uploads documents and consents to SMS.
- [ ] Data is correct in the database and protected by RLS (proven by tests).
- [ ] No user can access another user's data or files (proven by tests).
- [ ] Three themes switch cleanly by commenting and uncommenting.
- [ ] All tests pass, coverage thresholds met, CI green.

---

## 11. Milestone 2: Carrier Side and Paywall (do not start yet)

**Due:** October 23, 2026.

- **T2.1 Schema:** `carriers`, `subscriptions`, `webhook_events` tables, `subscription_status` enum, helpers `current_carrier_id()`, `carrier_has_active_subscription()`, RLS update so carriers can read approved, opted-in drivers only with an active subscription. pgTAP and integration tests.
- **T2.2 Classes:** `CarrierRepository`, `SubscriptionRepository`, `CarrierService`, `SubscriptionService`, `PaymentProvider` interface + `StripeProvider` + `FakePaymentProvider`.
- **T2.3 Carrier onboarding:** company name, contact name, billing email, USDOT (optional), MC (optional), city, state, ZIP.
- **T2.4 Terms acceptance:** required checkbox, logs `TOS_VERSION`, IP, user agent. Re-accept when version changes.
- **T2.5 Stripe:** Checkout (subscription, $399/month), Customer Portal, webhook (`/api/stripe/webhook`) with signature verification, idempotency via `webhook_events`, events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`. Tests generate signed payloads with `stripe.webhooks.generateTestHeaderString`.
- **T2.6 Paywall:** `requireActiveSubscription()` guard, `ALLOWED_SUB_STATUSES = ['active','trialing']`, billing screen for any other status.
- **T2.7 Driver search:** filters (operator type, CDL class, endorsements all-required, state, ZIP, min experience, availability), server-side, paginated (20), cards on mobile and table on desktop.
- **T2.8 Driver profile view:** card details and documents via `/api/documents/[id]/url` (subscription check, 60-second signed URL). Driver phone number never shown.
- **T2.9 Billing page:** plan, status, next billing date, Manage billing button.
- **T2.10 QA:** full e2e: signup, ToS, Stripe test checkout, search, view, cancellation blocks access, failed payment blocks access, webhook replay does not duplicate.

---

## 12. Milestone 3: Broadcast Shift and Admin (do not start yet)

**Due:** November 6, 2026 (may move to November 13).

- **T3.1 Schema:** `shifts`, `broadcast_recipients`, `sms_messages`, enums `shift_status`, `recipient_status`, `sms_direction`. Unique 4-digit `short_code` among open shifts. RLS and tests.
- **T3.2 Classes:** `ShiftRepository`, `BroadcastRepository`, `SmsLogRepository`, `ShiftService`, `BroadcastService`, `MatchingService`, `SmsProvider` interface + `TwilioSmsProvider` + `FakeSmsProvider`.
- **T3.3 Shift posting:** create, edit, cancel, history, matching driver count preview.
- **T3.4 Matching:** approved, opted in, not opted out, operator type match, CDL class meets or exceeds (A > B > C > none), all endorsements, min experience, same state. Max 200 recipients (most experienced first). Exhaustive unit tests.
- **T3.5 Broadcast send:** via Twilio Messaging Service SID, concurrency limit 10, `Promise.allSettled`, status callback. Message under 160 chars where possible.
- **T3.6 Inbound webhook** `/api/twilio/inbound`: validate `X-Twilio-Signature`, idempotency by `MessageSid`, log every message, parse `YES 1234` or `YES` (if exactly one open offer), help reply otherwise, sync STOP/START via `OptOutType`.
- **T3.7 Atomic claim:** Postgres function `claim_shift(p_short_code, p_driver_id)` using a single conditional `update ... where status = 'open' ... returning id`. Returns `won`, `filled`, `not_eligible`, `not_found`. **Concurrency test:** fire 20 parallel claims, exactly one wins.
- **T3.8 Replies:** winner confirmation, late reply "filled", cancelled shift reply. No mass "filled" blast.
- **T3.9 Live view:** Supabase Realtime on shift and recipients. Shows sent, delivered, claimed by whom.
- **T3.10 Expiry:** open shifts past `starts_at` become `expired`.
- **T3.11 Admin panel:** drivers (approve, block, remove), carriers (approve, block, remove), subscriptions with active count and MRR, shifts with recipients and SMS log.
- **T3.12 Final QA:** full e2e of the broadcast loop with `FakeSmsProvider`, real-device test with real Twilio numbers, production deploy, README handover.

---

## 13. Constants (`src/lib/constants.ts`)

```ts
export const SMS_CONSENT_VERSION = '2026-10-v1';
export const SMS_CONSENT_TEXT =
  'I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.';
export const TOS_VERSION = '2026-10-v1';                 // used in M2
export const ALLOWED_SUB_STATUSES = ['active', 'trialing'] as const; // used in M2
export const BROADCAST_MAX_RECIPIENTS = 200;             // used in M3
export const BROADCAST_SEND_CONCURRENCY = 10;            // used in M3
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const IMAGE_MAX_DIMENSION = 2000;
export const IMAGE_TARGET_MAX_MB = 1;
export const DEFAULT_TIMEZONE = 'America/Chicago';
```

---

## 14. Security Checklist (verify at each milestone end)

- [ ] No secrets in the repo or client bundles (check build output)
- [ ] Service role client used only in server code
- [ ] RLS enabled on every table, proven by tests
- [ ] Storage bucket private, proven by tests
- [ ] All inputs validated server-side with zod
- [ ] Users cannot change their own role or status
- [ ] Webhooks verify signatures (M2, M3)
- [ ] Error messages never leak internals

---

## 15. Seed Data (local only)

`supabase/seed.sql`: 1 admin, 25 drivers across several states, operator types, CDL classes, endorsements and statuses (pending, approved, blocked, one opted out). Milestone 2 adds 2 carriers. Fake phone numbers only, in the `+1555555xxxx` range. Never real data.

---

## 16. README Must Cover

- Prerequisites (Node LTS, pnpm, Docker, Supabase CLI)
- Local setup and `supabase start`
- Env vars
- All scripts, especially every test command
- Test OTP numbers for logging in locally
- How to switch themes
- How to create an admin user
- Deploying to Vercel

---

## 17. Progress Log

Update after every task. Format: `YYYY-MM-DD | Task | What was done | Tests added`.

**Current milestone:** 1
**Current task:** T1.10

| Date | Task | Summary | Tests |
| --- | --- | --- | --- |
| 2026-10-01 | T1.1 | Next.js 16.3 scaffold (App Router, TS strict, pnpm, `@/*` alias), ESLint + Prettier, section 3 folder structure, `src/lib/env.ts` zod validation run at server start via `src/instrumentation.ts`, `/api/health`, `.env.example`. | `tests/unit/lib/env.test.ts` (20: valid, missing, empty, malformed, caching, browser guard), `tests/unit/lib/health.route.test.ts` (1) |
| 2026-10-02 | T1.2 | Vitest unit config with coverage thresholds (section 9.2), integration config against local Supabase, Playwright with desktop Chrome, iPhone 13 and Pixel 7 projects, test factories, GitHub Actions CI. `supabase init` and `config.toml` (phone auth, test OTP numbers) moved here from T1.4 so `pnpm test:all` can run. `pnpm test:all` is green locally. CI is written but has not run yet because the repo has no GitHub remote. | `tests/unit/lib/smoke.test.ts` (2), `tests/unit/lib/factories.test.ts` (4), `tests/integration/smoke.test.ts` (3), `supabase/tests/000_smoke.test.sql` (1), `tests/e2e/smoke.spec.ts` (2 x 3 devices) |
| 2026-10-02 | T1.3 | Tailwind v4 + shadcn/ui (Radix base). `themes.css` copied verbatim from section 6, `globals.css` maps the variables and defines no colors. Base components: button, input, label, form, select, checkbox, card, badge, progress, dialog, sonner, skeleton. Layout: AppShell, Header, ThemeToggle, MobileNav, Footer. Shared: LoadingButton, FormField, EmptyState, StatusBadge. Dark mode saved in the `fleetgrid-theme` cookie, defaults to system, applied by an inline script before first paint. | `themes.css.test.ts` (active theme variables, commented themes parity, globals mapping), `no-hardcoded-colors.test.ts` (every file in `src/components` and `src/app`), `theme.test.ts`, `components/shared.test.tsx`, `components/layout.test.tsx`, `e2e/theme.spec.ts` (system default, toggle persists across reload). 177 unit tests, 100% line coverage. |
| 2026-10-02 | T1.4 | Migrations 0001 (enums), 0002 (profiles, drivers, driver_documents, tos_acceptances, shared `updated_at` trigger, indexes), 0003 (`auth_role`, `is_admin`, `current_driver_id`, triggers that block users from changing their own role, status, phone, card owner or SMS opt-out state). `pnpm db:types` generates `database.types.ts`. Seed: 1 admin and 25 drivers across 8 states. `supabase db reset` runs clean. | `supabase/tests/001_schema.test.sql` (211 pgTAP assertions: enums, every column and type, indexes, triggers, every check constraint, partial save, completion rules, role and status protection, cascades) |
| 2026-10-02 | T1.5 | Migration 0004: RLS on all four tables, policies for every cell of the section 8 table, anon has no table privileges, terms acceptances are append-only. Migration 0005: private `driver-documents` bucket (10 MB, jpg/png/webp/pdf) with own-folder policies for upload, read and delete, admin read and delete. | pgTAP `002_rls_profiles` (45), `003_rls_drivers` (34), `004_storage` (23); integration with real signed-in clients for two drivers, carrier, admin and anon: `rls/profiles.test.ts`, `rls/drivers.test.ts`, `rls/storage.test.ts` (40 tests through PostgREST and the Storage API) |
| 2026-10-02 | T1.6 | `AppError` with typed codes, `Result` helpers (`ok`, `fail`, `toResult`, `runAction`, `parseInput`). `BaseRepository` maps database errors to `AppError` so raw messages never leave the data layer. Repositories with interfaces: Profile, Driver, Document (rows and storage), Auth. Services: `AuthService`, `ProfileService`, `DriverService` (step saving, resume, completion rules, consent), `DocumentService` (two-step token upload, preview, delete). `container.ts`, server Supabase client, `constants.ts`, `phone.ts`, zod schemas for phone, driver steps and documents. Fakes for all four repositories and domain factories. | Unit: `AuthService` (27), `ProfileService` (20), `DriverService` (61), `DocumentService` (39), `schemas.test.ts` (every field valid and invalid), `phone.test.ts`, `app-error.test.ts`. 499 unit tests, 100% line coverage. Integration against local Supabase for every repository method: `ProfileRepository`, `DriverRepository`, `DocumentRepository`, `AuthRepository` (39 tests) |
| 2026-10-02 | T1.7 | `/login` (US phone input that formats as typed, E.164 normalization), `/verify` (6-digit input with `autocomplete="one-time-code"`, paste support, auto-submit, error states, 60 second resend cooldown), `/choose-role` (Driver or Carrier, preselected from the link), carrier and admin placeholder pages, logout. `src/proxy.ts` refreshes the session and enforces the route rules in `src/lib/auth/routes.ts`; `guards.ts` (`requireUser`, `requireSession`, `requireRole`) repeats the check in server code. Blocked users are signed out. `not-found.tsx` and `error.tsx`. | Unit: `routes.test.ts` (every route and role combination, 120+ cases), `guards.test.ts`, `components/auth.test.tsx` (PhoneForm, OtpForm, RoleChooser, LogoutButton). 708 unit tests. E2E `auth.spec.ts` on desktop, iPhone 13 and Pixel 7 (16 tests x 3): sign-up with test OTP, wrong code, pasted code, role preselect, role routing for driver, carrier and admin, wrong roles blocked, no-profile hold, blocked user, logout, expired session, reload |
| 2026-10-02 | T1.8 | `/driver/onboarding`: five saved steps plus a done screen, progress bar, Back keeps saved data, resume after refresh or logout from `onboarding_step`. Steps: basics (US state select, ZIP, radius), role and licenses (endorsements only with a CDL, certifications tag input), availability (bio counter, 500 max), documents (optional, uploader arrives in T1.9), SMS consent (unchecked checkbox with the exact text, stored with timestamp). `/driver/profile` redirects to onboarding until the card is complete. Shared `ChoiceGroup` and `TagInput`. Server actions `saveOnboardingStepAction`, `updateCardAction`. | Unit: `components/onboarding.test.tsx` (each step, stepper, resume, back, consent rules), `components/inputs.test.tsx`; schema and service tests from T1.6 cover every field and the completion rules. 779 unit tests. E2E `driver-onboarding.spec.ts` (7 tests x 3 devices): full completion with every database field checked, refresh and re-login resume, back navigation keeps data, per-field validation, endorsements toggle, bio limit, cannot finish without consent |
| 2026-10-02 | T1.9 | `DocumentUploader` on `/driver/documents` and in onboarding step 4: pick a type (CDL front, CDL back, medical card, certification, other), upload a photo or PDF, list, preview through a 60 second signed URL, delete with confirmation. `src/lib/image.ts` compresses images in the browser to under 1 MB and 2000px (PDFs go as they are). Type and size are checked in the browser, by the server before issuing the upload token, by the storage bucket, and again by the server against the stored file. | Unit: `image.test.ts` (15), `components/documents.test.tsx` (24), plus the T1.6 schema and service tests. 829 unit tests. Storage integration tests from T1.5 and T1.6 (own folder only, other driver denied, anon denied, size and type limits). E2E `driver-documents.spec.ts` (7 tests x 3 devices): upload image, upload PDF, reject oversize, reject wrong type, delete, reload and onboarding step 4, second driver and anonymous cannot see the file |

**Decisions made while building (flag if you disagree):**
- App lives at the workspace root (`FleatGrid/`), not in a nested `fleetgrid/` folder.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`; the route guard will be `src/proxy.ts`.
- Added files outside the section 3 list: `src/lib/env.ts` (required by section 5), `src/instrumentation.ts` (fail-fast env check), `.prettierrc.json`, `.prettierignore`, `pnpm-workspace.yaml`, `AGENTS.md` (generated by Next.js).
- Folders are created with `.gitkeep` placeholders instead of empty source files, because empty `page.tsx` files break the build. Real files arrive with their task.

**Open questions for the client:**
- Final Terms of Service and Privacy Policy text
- Support email and phone for HELP replies and `/sms-terms`
- Logo
- Production domain: fleetgridus.com (pending purchase)
- T1.2 and T1.4 overlap: `supabase init` and `config.toml` were done in T1.2, because `pnpm test:all` needs the database test runner.
- shadcn/ui: dropped its generated color tokens so `themes.css` stays the only color source. Removed `next-themes` (it stores the choice in localStorage; the brief requires a cookie). Added `touch` and `icon-touch` button sizes (44px) for driver screens. The current shadcn registry no longer ships `form`, so `src/components/ui/form.tsx` is the classic react-hook-form version added by hand.
- Playwright's iPhone 13 project uses the iPhone viewport and user agent on Chromium. Real iOS Safari is covered by the T1.12 device check.
- Extra test OTP numbers `15555550103` to `15555550109` were added for automated tests that need several users.
- Partial onboarding saves: `operator_types` and `availability` default to empty arrays and `years_experience` is nullable. The `drivers_card_complete` check only lets `card_completed` be true when all three are filled and SMS consent is recorded.
- Extra database rules beyond the brief: phone must be E.164, state must be two capital letters, endorsements require a CDL class, documents must use an allowed mime type, a terms version can be accepted once per profile, and drivers cannot undo their own SMS opt-out (that state comes from STOP and START texts).
- Profile creation is stricter than the brief: the profile phone must equal the phone verified in the session, and new profiles must be `pending`.
- Integration tests create users through the admin API with a password, so they do not consume SMS rate limits. The real OTP flow is covered by e2e tests.
- Supabase blocks direct SQL deletes on `storage.objects`, so storage delete rules are proven through the Storage API in integration tests instead of pgTAP.
- Document uploads use a one-time upload token: the server validates and reserves the path, the browser sends the file straight to private storage, then the server checks the stored file's real size and type before recording it. Files never pass through the app server, which matters because Vercel caps request bodies at about 4.5 MB and documents can be 10 MB.
- Added `AuthRepository` (wraps Supabase phone OTP) so `AuthService` depends on an interface and has a fake.
- The phone, driver and document zod schemas and `phone.ts` were built in T1.6 because the services need them. T1.7 to T1.9 add the screens on top.
- Local auth rate limits are raised in `config.toml` and the resend interval is 1 second locally. Supabase Studio runs on port 54333 because 54323 could not be bound on this machine.
- A user picks Driver or Carrier once. Changing role later needs an admin, so the role screen says so.
- Signed-in users who open `/login` or `/verify` are sent to their own area.
- `/admin` has a placeholder page in Milestone 1 so the seeded admin has somewhere to land.
- Onboarding keeps the current step in the page (no step in the URL). A refresh always resumes at the first unfinished step.
- Blank number fields count as missing. A blank years-of-experience is an error, never zero.
