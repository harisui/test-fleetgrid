# FleetGrid

A confidential B2B directory that connects local freight carriers with certified transport operators. At launch every driver is a CDL driver (client decision of 2026-10-09); yard spotters and mechanics come later.

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
| `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `BUSINESS_ADDRESS` | Milestone 1 | optional overrides of the client's contact details in `src/lib/support.ts` (footer, Contact, Help, SMS Terms); address lines separated by ` \| ` |
| `NEXT_PUBLIC_SITE_URL`                           | Website     | optional. The canonical host for page metadata, the sitemap and robots; `https://fleetgridus.com` by default, `http://localhost:3000` locally. |
| `IP_HASH_SALT`                                   | Milestone 3 | optional. A long random string that salts the one-way hash of a visitor's address when a flyer's QR short link (`/q/<slug>`) is scanned; the address itself is never stored. Unset, a fixed salt is used, which is fine locally. Set it in production. Server only. |
| `NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL`, `NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL` | Website | optional. The Google Ads tag `AW-18533050920` loads on the production deployment only (`VERCEL_ENV=production`), never locally, in CI or on previews; an id here loads that tag anywhere, `off` loads nothing. The labels are the conversion actions' labels from Google Ads (the part after the slash): with them set, a finished driver sign-up and a confirmed carrier payment are each counted once per browser. See `src/lib/analytics.ts`. |
| `NEXT_PUBLIC_SHOW_PHONE`, `NEXT_PUBLIC_SHOW_SMS_NUMBER` | Website | optional. `true` shows the toll-free number for calls (footer, Contact page) or as the shift-text sender in the footer. Both off unless set to exactly `true`; keep them off until the client confirms calls are answered and Twilio has approved the number. |
| `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM`, `CONTACT_FORM_SECRET` | Website | the contact form. The key from the client's Resend account (domain verified there); `CONTACT_TO` defaults to the support address and `CONTACT_FROM` to `FleetGrid <noreply@fleetgridus.com>`; the secret is any long random string and signs the form's timestamp. Empty locally: the message is logged, not sent. In production a missing key or secret shows the form's error state, never a fake success. Rate limit: 5 per address per hour and 20 a day, counted per server instance. Server only. |
| `CARRIER_DISABLED`                               | Milestone 2 | optional. `true` hides the carrier side: the landing page button, `/login?role=carrier`, the role picker and every `/carrier` page lead to a "Carriers: coming soon" page at `/carriers`, and no carrier profile can be created. Off unless set to exactly `true`. |
| `TWILIO_*`                                       | Milestone 3 | not needed yet. Login codes are sent and checked by Supabase Auth, whose SMS provider (Twilio Verify or a Twilio Messaging Service) is chosen in the Supabase dashboard, not here; see "Login codes" under Deploying. |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_WEBHOOK_SECRET` | Milestone 2 | the Stripe dashboard (test mode locally). With all three set, checkout and the webhook use Stripe. Leave them empty locally: with `ENABLE_TEST_LOGIN=true` an in-memory provider stands in and checkout goes to a page inside the app. Server only. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`             | Milestone 2 | not used yet (Checkout is hosted by Stripe)            |

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

`ENABLE_TEST_LOGIN=true` in `.env.local` starts the login and code forms filled with `TEST_PHONE_DRIVER` and `TEST_OTP`. The flag is read in one place (`src/lib/env.ts`), is off unless set to exactly `true`, and a production build refuses to start with it on unless `NEXT_PUBLIC_SUPABASE_URL` is the local stack. Never set it on a hosted deployment.

The test numbers themselves exist only in `supabase/config.toml`, which configures the local stack. The hosted Supabase project must not have test OTP numbers configured (Authentication → Providers → Phone → Test OTPs must stay empty), so no number can sign in without a real text in production.

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

`pnpm design-review` writes `design-review/index.html` (ignored by git): each of the six
sign-up pages (one per mile, the same on every device) and the done screen of the running app
beside the approved prototype frame in `tests/design-review/workshop-prototype.html` where one
exists, at 390 wide in light and dark and at 1280 wide. Pages the prototype predates are marked
so. Open the file in a browser to compare.

### The sign-up

Eleven screens in six miles, a mile per page (`src/lib/onboarding/steps.ts`). The first mile is
one screen, the lead: name, ZIP (city and state filled in from the dataset, the out-of-area note
when it applies), CDL class, and the optional, unchecked shift-text box; "Save and continue"
creates the card at once, unfinished, so the sign-up is captured even if the driver stops there.
Then Driving (distance, years, MVR level), Cards (TWIC, DOT medical card), Letters (endorsements,
transmission), Equipment, Finish (the optional "How did you hear about FleetGrid?", the consent
box again only for drivers who left it empty on the lead, then "Find local shifts"). Every page is
saved on Next, so a driver can leave and resume on the next unanswered page. The card is complete,
and can be approved or found by carriers, once every required answer is there. The answers
sign-up no longer asks (W-2 or 1099, driving style, the Clearinghouse, availability,
certifications, papers, about you) are optional on the profile page, and the CDL photos are asked
for when a shift comes up (Milestone 3).

### Where a sign-up came from

The first public page a visitor opens sets the cookie `fg_src` (30 days, first party, httpOnly)
with the UTM tags on the address, the referrer when it is another site, and the landing path. A
later tagged link never overwrites it. When the visitor creates a profile the values move to the
`signup_*` columns on `profiles`, `utm_content` is matched to a QR code's slug (`qr_link_id`),
and the cookie is deleted. The admin's Drivers page shows the source per driver, filters by it,
and narrows to one code from the Analytics page; a driver's own answer to the sign-up question
is kept beside it. The Privacy Policy describes all of this (section 1).

### The carrier side (Milestone 2)

A carrier signs in with the same text code, then: `/carrier/onboarding` (company, contact,
billing email, optional USDOT and MC, the yard ZIP), `/carrier/terms` (the Terms of Service,
logged with the IP and browser), `/carrier/billing` (Stripe Checkout for the $399 a month
plan; the Customer Portal for card changes and cancellation), `/carrier/search` (listed
drivers by distance from the yard, filters in the URL), `/carrier/drivers/[id]` (one driver's
card and papers), `/carrier/account`. A yard outside every active service area lands on
`/carrier/waitlist` instead of checkout. Every carrier page sends the carrier to the page for
the stage they are at (`requireCarrierStage` in `src/lib/auth/guards.ts`), so the search is
never reachable without an active subscription; the database says the same through RLS.

Stripe keeps the `subscriptions` table current through `POST /api/stripe/webhook`
(signature checked, each event id handled once). Register that URL in the Stripe dashboard
with the events `checkout.session.completed`, `customer.subscription.*`, `invoice.paid` and
`invoice.payment_failed`. Locally, without Stripe keys, `/carrier/billing/test-checkout` stands
in for Checkout: "Pay" writes an active subscription the way a webhook would.

A listed driver is one who is approved, has a complete card and has not
opted out, with a ZIP inside an active service area. Carriers never see a driver's phone number.

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

To make an existing account the admin (local or production), the person first logs in once at `/login` with their own phone and picks a role (the role picker is a formality; the SQL below overrides it). Then run this SQL as the database owner, in Supabase Studio's SQL editor on the hosted project:

```sql
update public.profiles
   set role = 'admin', status = 'approved'
 where phone = '+15555550100';   -- the person's phone in E.164
```

From their next page load they land in the admin at `/admin/drivers`. Every `/admin` route is guarded twice: the server guard (`requireAdmin` in `src/lib/auth/guards.ts`) answers 403 to a signed-in driver or carrier and sends signed-out visitors to `/login`, and Row Level Security lets only admins read and write the admin tables. A profile with `role = 'driver'` keeps its driver card; switching a real driver to admin is not reversible from the app, so use a separate number for the admin.

The user must have logged in once and chosen a role first, so that a profile row exists. Users cannot change their own role or status: a database trigger blocks it.

## Deploying to Vercel

1. Create a hosted Supabase project.
2. In Supabase: enable phone sign-in and pick the SMS provider (Authentication, Sign In / Providers, Phone). See "Login codes" below.
3. Apply the migrations to the hosted database:
   ```bash
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push
   ```
   Do not run the seed against production. It contains fake data only.
4. Import the repository in Vercel (framework preset: Next.js, package manager: pnpm).
5. Set the environment variables in Vercel for Production and Preview: `NEXT_PUBLIC_APP_URL` (the deployed URL), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and for the carrier side `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_MONTHLY` (a recurring monthly price of $399) and `STRIPE_WEBHOOK_SECRET`.
6. In Supabase, set the Site URL to the deployed URL (Authentication, URL Configuration).
7. In Stripe, add a webhook endpoint at `https://<your-domain>/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid` and `invoice.payment_failed`, and turn on the Customer Portal (Settings, Billing) with cancellation allowed.
8. Deploy, then check `https://<your-domain>/api/health` returns `{"ok":true}`.

### Login codes (Twilio Verify now, the toll-free number later)

The app never sends the login SMS itself: `signInWithOtp` asks Supabase Auth to send the code
and `verifyOtp` asks it to check the code, through whichever SMS provider the Supabase
dashboard names (Authentication, Sign In / Providers, Phone, "SMS provider"). Switching
providers is that one setting; no deploy, no environment variable, no code change, and
signed-in users stay signed in.

- **Until the toll-free number is approved (client decision, 2026-10-23):** provider
  **Twilio Verify**, with the Twilio Account SID, the Auth Token and the Verify Service SID
  (`VA...`, Twilio console, Verify, Services). Verify sends from Twilio's own numbers, so it
  works before any number of ours is approved. The text reads "Your FleetGrid verification
  code is: 123456", so the Verify Service's friendly name must be `FleetGrid` and its code
  length 6 (the defaults). The Supabase SMS template is not used on this path. About $0.05 a
  successful check plus the SMS.
- **Once Twilio approves the toll-free number:** provider **Twilio**, with the same Account
  SID and Auth Token and the Messaging Service SID (`MG...`) that holds the number. Codes then
  come from (888) 869-2040 with the Supabase template "Your FleetGrid code is {{ .Code }}".

The test numbers in `supabase/config.toml` never reach either provider; locally the provider
block there is a dummy. The `TWILIO_*` variables in `.env.example` are for the app's own
texts in Milestone 3 (shift offers), not for login codes.

## Data

- `src/data/us-zips.tsv`: US ZIP codes with their city and state, used to fill in the location
  during driver onboarding. Built from the [GeoNames](https://www.geonames.org/) postal code
  export (`US.zip`), licensed under
  [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
  One row per ZIP (the first place GeoNames lists), only the 50 states and DC, tab separated,
  sorted: `zip`, `city`, `state`, `lat`, `lng` (decimal degrees, four places). The lookup runs
  on the server only. The driver types the ZIP alone; city, state and coordinates are taken
  from this file when the ZIP is saved, and a ZIP it does not know is rejected (client decision
  of 2026-10-09). Checked 2026-10-09 against the GeoNames export of 2026-10-08 (identical:
  40,977 ZIPs, no additions, removals or moves) and the Census Bureau's 2024 ZCTA gazetteer
  (every ZCTA in the 50 states and DC is in the file; the 149 it lacks are Puerto Rico and
  the territories, which are out of scope). One check remains for launch: the HUD USPS ZIP
  crosswalk (huduser.gov, USPS data, quarterly), which needs a free account token.
- `service_areas` (migration 0010): where FleetGrid is live. Each row is a centre ZIP with its
  coordinates and a radius in miles (5 to 250). The launch areas are Houston, TX (77002) and
  Pasadena, TX (77506), 50 miles each. Whether a driver is inside one is computed live by the
  Postgres function `is_in_service_area(lat, lng)` (haversine through `miles_between`), never
  stored, so editing an area takes effect at once. No signed-in user can read or write the
  table; the app only calls the function. Drivers outside every area can still sign up: they
  see an info note on the ZIP screen, a "You're on the list" done screen and an "Outside
  launch area" badge on the profile. Admin management of areas comes in Milestone 3.

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
