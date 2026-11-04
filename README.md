# Candid

An internal project tracker for a small team: projects with checklists, notes, deadlines and a shared
document shelf. The daily loop is **create a project → see the next task → update progress → add a
note → open a document**.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui (Radix) · TanStack Query ·
Drizzle ORM · Neon PostgreSQL · Clerk (managed auth) · S3-compatible private storage · Google Sheets API.

Code conventions (services, routes, strings, dates, design rules): [`CONVENTIONS.md`](CONVENTIONS.md).

## Local setup

Needs Node 22+ and a Postgres 16+ (a local one, or a Neon branch).

```bash
npm install
cp .env.example .env.local          # the app reads .env.local
cp .env.example .env                # scripts and tests read .env
```

For a fully local run without external accounts, set in both files:

```
DATABASE_URL=postgres://…/candid          # local Postgres
TEST_DATABASE_URL=postgres://…/candid_test # a second, disposable database
AUTH_MODE=dev                              # seeded-user picker instead of Clerk
STORAGE_DRIVER=local                       # files under ./.storage, signed expiring links
TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>
APP_URL=http://localhost:3000
```

```bash
npm run db:migrate      # apply migrations
npm run db:seed         # DEVELOPMENT demo data (Czech names, the example project, a 2nd workspace)
npm run dev             # http://localhost:3000 → pick a person on the sign-in page
```

`AUTH_MODE=dev` and `STORAGE_DRIVER=local` are development stand-ins. Both refuse to start when
`VERCEL_ENV` is set, so they can never serve a deployment.

Demo data is kept apart from the app: `scripts/seed.ts` (demo workspace) and `scripts/seed-large.ts`
(`npm run db:seed:large`, 100 projects × 20 tasks for performance checks; `-- --remove` deletes them).
Both refuse to run with `NODE_ENV=production`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | route types + `tsc --noEmit` |
| `npm test` | vitest: unit + integration tests (integration tests use `TEST_DATABASE_URL`) |
| `npm run db:generate` | new migration from `src/db/schema.ts` changes (commit the generated SQL) |
| `npm run db:migrate` | apply migrations over Postgres (uses `DATABASE_URL_UNPOOLED`) |
| `npm run db:migrate:http` | apply migrations to Neon over HTTPS, for networks that block port 5432 |
| `npm run db:seed`, `db:seed:large` | development data only |

## Deployment (Vercel + Neon)

1. **Neon**: create a project in the region closest to your users (the current project is in
   `aws-eu-central-1`, Frankfurt). Copy the *pooled* connection string to `DATABASE_URL` and the
   direct one to `DATABASE_URL_UNPOOLED`. Run `npm run db:migrate` (or `db:migrate:http`) once, then on
   every deploy that adds a migration.
2. **Vercel**: import the repository. Set the function region next to the database
   (Project → Settings → Functions → Region: `fra1` for Frankfurt). Add the environment variables from
   `.env.example` (leave `AUTH_MODE` and `LOCAL_STORAGE_DIR` unset; `STORAGE_DRIVER=s3`).
   `vercel.json` schedules the daily document purge; set `CRON_SECRET`.
3. **Clerk**: create an application, enable the sign-in methods you want (email works for any address; add Microsoft or another provider if you like),
   and copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Turn off public sign-ups if
   you want invite-only (accounts without an invite see "not a member" anyway). Set
   `BOOTSTRAP_ADMIN_EMAILS` to the first admin's email; they become admin on first sign-in with that
   verified address and invite everyone else from **Settings → Members**.
4. **Storage** (Cloudflare R2 example): create a private bucket; create an API token limited to that
   bucket with object read/write; set `S3_BUCKET`, `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`,
   `S3_REGION=auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Add a CORS rule allowing `POST`
   from your app origin (browsers upload directly with a presigned POST):

   ```json
   [{ "AllowedOrigins": ["https://your-app.example"], "AllowedMethods": ["POST"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```

   AWS S3 works the same way: leave `S3_ENDPOINT` empty and set the bucket's region; keep
   "Block all public access" on.
5. **Google Sheets** (optional): follow [`docs/google-oauth.md`](docs/google-oauth.md).
6. `TOKEN_ENCRYPTION_KEY`: 32 random bytes, base64. Rotating it disconnects connected Google accounts.

## How it is put together

- `src/db/schema.ts`: the data model. Every table carries `workspace_id`. Records that can be edited
  at the same time have a `version`; notes have their own `notes_version`.
- `src/server/*`: services. Each takes the caller's context (`requireCtx()`: authenticated and an
  active member of the workspace, optionally admin) and filters every query by workspace.
- `src/app/api/**`: thin route handlers via `route()` (auth, role, zod validation, error mapping).
- `src/components/*`: UI by feature; `src/components/ui` is shadcn/ui. React Bits (`@react-bits`
  registry in `components.json`) provides the rolling `Counter` used for the dashboard counts.
- `src/i18n/en/*`: every interface string, for a future Czech locale.
- Design: Taste v2 app workflow, style "achromatic-ledger" (`.taste-skill/direction.json`). Colour is
  reserved for status, priority and overdue work.

## Known limits of this version

- No offline editing: when the browser is offline the app says so and keeps unsaved text in the page.
- Google Sheets is user-triggered import/export only (no sync). The user pastes a spreadsheet URL
  (the app requests only the `spreadsheets` scope, no Drive access).
- Search is a plain `ILIKE` scan (fine for thousands of rows; add a `pg_trgm` index beyond that).
