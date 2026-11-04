# Conventions

Read this before changing code. It is short on purpose.

## Shape

- `src/db/schema.ts` — the whole data model. Change it only with a new migration (`npm run db:generate`).
- `src/server/*` — services. **Every** function takes `ctx: Ctx` first and filters by `ctx.workspaceId`.
  Writes that can race use the record `version` (`where version = ?`, then `+1`); a miss throws
  `conflict(currentRecord)` (HTTP 409 with `details.current`). Throw `AppError` for expected failures.
  Log useful changes with `logActivity` — small facts only, never tokens or full note text.
- `src/app/api/**/route.ts` — thin: `export const GET = route(async ({ ctx, req, params }) => …)`
  from `@/server/http`. `route()` authenticates and authorises (`route(fn, { role: "admin" })`).
  Validate input with zod (`body(req, schema)`, `uuidParam`). Return plain objects.
- `src/hooks/queries.ts` + `src/lib/query-keys.ts` — TanStack Query hooks and keys. Mutations are
  optimistic where the user expects instant feedback, roll back on error, and invalidate only the
  keys they affect (`qk.project(id)`, `qk.projects()`, `qk.counts()` …).
- `src/lib/api.ts` — `api(path, { method, json })` throws `ApiError` (`status 0` = offline, `409` = conflict).
- `src/i18n/en/<namespace>.ts` — every user-facing string. `t.ns.key`, `fmt(s, vars)`, `plural(n, forms)`.
  No literal UI text in components.

## Dates

Deadlines are `date` columns and travel as `"YYYY-MM-DD"` strings. Never pass them through `new Date()`
for display: use `formatDay`, `dueState`, `todayLocal` from `src/lib/dates.ts`. Instants (`createdAt`
…) are ISO timestamps shown with `formatInstant` / `formatRelative` in the viewer's timezone. Endpoints
that depend on "today" take `?today=YYYY-MM-DD` from the client.

## Design (Taste v2, app sheet "achromatic-ledger" — see `.taste-skill/direction.json`)

- Chrome is ink and grey. Colour only carries meaning: `text-hue`/`bg-hue` (progress, the main data
  element), `text-positive` (done), `text-warning` (waiting), `text-negative` (overdue), and the pill
  pairs `bg-pill-{positive,negative,warning,neutral,hue} text-pill-…-ink`. Never colour alone: pair it
  with a word or an icon.
- Semantic tokens only (`bg-card`, `bg-background`, `border`, `text-muted-foreground`, `bg-raised`). No raw hex.
- Type: Geist, 14px body, 12px meta, 16/500 card titles, 24/600 page `h1`. Tabular figures (`.num`) on numbers.
- Cards: white surface, 1px border, radius 8, no shadow at rest. Controls: 32–36px, radius 6.
  One near-black primary button per screen. Sentence case, no uppercase tracked labels, no emoji,
  no gradients, no glows, no icons in tinted circles, no decorative charts.
- Motion is feedback only: 100–200ms transitions on transform/opacity/colour. Reduced motion is
  handled globally in `globals.css`. Nothing animates continuously.
- Every interactive element is a real `button`/`a`/input with an accessible name and visible focus.
  Keyboard: Enter saves single-line edits, Escape cancels/closes, shortcuts never fire while typing
  (check `isTypingTarget` in `src/lib/keyboard.ts`).
- States: loading = final layout with flat grey bars (`Skeleton`), empty = frame + one sentence + the
  action, error = inside the block with Retry. Missing values print as a grey "—".
- Components: shadcn/ui in `src/components/ui` (Radix). React Bits (`@react-bits` registry in
  `components.json`): `Counter` (rolling digits, used for counts) and `Stepper` (import wizard). Use
  lucide icons only.

## Checks

- `npm run typecheck`, `npm test` (vitest; integration tests use `TEST_DATABASE_URL` and
  `test/factory.ts#makeCtx` for an isolated workspace).
- Local run: `AUTH_MODE=dev` + `STORAGE_DRIVER=local` (development stand-ins, refuse to run on Vercel),
  `npm run db:migrate && npm run db:seed && npm run dev`.
