# MMAnomaly UFC Fantasy

Invite-only UFC season fantasy for private leagues. Snake draft, 13-slot rosters, scoring based on DraftKings Classic MMA.

MMAnomaly is **not** affiliated with, endorsed by, or sponsored by UFC or DraftKings.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Prisma + **PostgreSQL** (local Docker Compose; Vercel Postgres or Neon in production)
- Email + password sessions (httpOnly JWT cookie)
- Polling draft room (~2s)
- UFC Stats ingest scaffold + Sunday scoring job (3:00 PM PT / 22:00 UTC default)

SQLite is **not** used. A file database cannot run on Vercel serverless; local and production share the same Postgres schema.

## Quick start (local)

Requires Docker for Postgres.

```bash
cp .env.example .env
# set AUTH_SECRET and CRON_SECRET (openssl rand -base64 32)
# DATABASE_URL and DIRECT_URL already match docker-compose.yml

docker compose up -d
npm install
npm run setup      # prisma generate + migrate deploy + seed 640 fighters
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run setup` expects Postgres to be reachable at `DATABASE_URL`. If migrate has not been applied yet, that command creates tables and seeds fighters.

First-time alternative (no migration history): `npx prisma db push && npm run db:seed`.

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled or direct Postgres URL (`postgresql://…` or `postgres://…`) |
| `DIRECT_URL` | Unpooled URL for `prisma migrate deploy`. Local Docker: same as `DATABASE_URL` |
| `AUTH_SECRET` | JWT signing key (required, ≥16 chars). Generate: `openssl rand -base64 32` |
| `APP_URL` | Public origin (invite/script URLs). Local: `http://localhost:3000` |
| `CRON_SECRET` | Bearer token for `/api/jobs/sunday-score` and `/api/jobs/draft-tick`. Generate: `openssl rand -base64 32` |
| `BLOB_READ_WRITE_TOKEN` | Optional. Stores uploaded team pictures in Vercel Blob. Without it, local dev writes `public/uploads/avatars` (gitignored). On Vercel without it, members paste a public image URL |
| `SEED_DEMO` | If `true`, seed also creates demo users/league |

Do not commit real secrets. Copy `.env.example` and generate values locally / in the Vercel dashboard.

## Deploy on Vercel

1. **Provision Postgres** — [Vercel Postgres](https://vercel.com/storage/postgres) or [Neon](https://neon.tech) (or another hosted Postgres). Copy the connection strings; do not invent them.
2. **Import the GitHub repo** at [vercel.com/new](https://vercel.com/new). Framework preset: Next.js. Build command: `npm run build` (runs `prisma generate && next build`). Install runs `postinstall` → `prisma generate`.
3. **Set environment variables** (Production; Preview if you use a separate database):

   | Name | Value |
   | --- | --- |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `CRON_SECRET` | `openssl rand -base64 32` (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when this is set) |
   | `DATABASE_URL` | Pooled URL. Vercel Postgres: `POSTGRES_PRISMA_URL` or `POSTGRES_URL`. Neon: the pooled (`-pooler`) URL |
   | `DIRECT_URL` | Direct / non-pooling URL. Vercel Postgres: `POSTGRES_URL_NON_POOLING`. Neon: the non-pooler URL. Same as `DATABASE_URL` if the host has no pooler |
   | `APP_URL` | `https://your-project.vercel.app` (or your custom domain) |
   | `BLOB_READ_WRITE_TOKEN` | Optional. Vercel project → Storage → Blob → copy the read/write token. Enables team picture uploads in production |

4. **Deploy**. The Next.js build does not apply migrations or seed data.
5. **First deploy / empty database — run once** (and again after new migrations):

   ```bash
   npx vercel env pull .env.production.local
   npx prisma migrate deploy
   npx prisma db seed
   ```

   Equivalent: `npm run db:provision` with `DATABASE_URL` and `DIRECT_URL` pointing at that database.

   If you skip the migration folder, `npx prisma db push` then `npx prisma db seed` also creates the schema.

   Seed loads `data/fighters_by_class.json` (640 fighters) and, when a card file is present, the `UfcCard` rows used by Fighting this week. Optional `SEED_DEMO=true` is for local demos, not production.

   `prisma/migrations/20260926193600_ufc_card` adds `UfcCard`. Production needs `npx prisma migrate deploy` before `npx prisma db seed`. Re-run the seed after replacing the upcoming-card file so the standings panel picks up the new bouts. If that file is absent, seed leaves existing `UfcCard` rows alone and the page derives the next card from `Fighter.nextBoutJson`.

6. Confirm **Settings → Cron Jobs** shows `GET /api/jobs/sunday-score` on `0 22 * * 0`. Cron runs on production deployments only.

### Sunday cron and DST

`vercel.json` schedules **Sunday 22:00 UTC**. Vercel cron expressions are always UTC.

| Zone | Sunday 22:00 UTC |
| --- | --- |
| PDT (UTC−7) | **3:00 PM** America/Los_Angeles |
| PST (UTC−8) | **2:00 PM** America/Los_Angeles |

22:00 UTC is the documented default (3:00 PM during PDT). To hit 3:00 PM during PST, change the schedule to `0 23 * * 0`.

Vercel Cron issues an HTTP **GET** (not POST) to the path. This app accepts **GET and POST** on `/api/jobs/sunday-score`; both require `Authorization: Bearer $CRON_SECRET`. Manual run:

```bash
curl -X POST "$APP_URL/api/jobs/sunday-score" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Ingesting a full UFC Stats card can take tens of seconds. The route sets `maxDuration = 60`. If jobs time out, use a Vercel plan that allows a higher duration and raise `maxDuration`.

Hobby cron jobs run at most once per day (this weekly job is within that limit) and may fire anywhere inside the scheduled UTC hour.

## How to run a league

1. **Register** at `/register` (commissioner does not need an invite).
2. **Create a league** at `/leagues/new` (4–12 teams, default 8; pick clock default 120s / 2:00).
3. Copy the **invite link** from the lobby or Admin. Invitees hit `/join/[token]`, then register with email + password (or log in) and join. Unique email per league membership is enforced via unique user email + one membership per user/league.
4. **Admin**: randomize snake order, then Up/Down to pin last season’s winner at 1. Start the draft when at least 2 teams have joined.
5. **Draft**: on your turn pick **one fighter** into **any open slot**. Flex can be any class. No fighter may be drafted twice. When the server clock hits 0:00, the best eligible fighter is autodrafted (see below). Commissioner can pause, resume, reorder the snake, or force auto-pick.
6. **Standings** show who on each roster is booked for the upcoming card, then season totals, last-event delta, and roster breakdown (zeros until a scoring job runs).
7. **Account & team** (`/leagues/[id]/settings`, or the Settings tab) lets a member rename their own team, set a display picture, and change their password. Commissioners do not edit other teams. The name is trimmed, 2–32 characters, and unique in the league ignoring case. The picture is optional: JPEG, PNG, or WebP up to 2MB, shown in a circle (initials if unset). Password change asks for the current password and a confirmation; the new password must be at least 8 characters, the same rule as registration. There is no email reset in v1. The password is the account login, shared across leagues.

## Team pictures

Pictures are stored on `Membership.avatarUrl` (team-scoped, not the user account) so each league can have its own mark.

| Where it runs | How an upload is stored |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` is set | [Vercel Blob](https://vercel.com/docs/vercel-blob), public URL. This is the production path. No other new service. |
| Local dev, token unset | `public/uploads/avatars/` (gitignored). The dev server serves that folder. |
| Vercel without the token | Uploads are turned off. Paste an `http` or `https` image URL instead. |

The browser squares the file to 256×256 JPEG before upload when it can. The server still checks type (JPEG/PNG/WebP magic bytes) and the 2MB cap. `data:` URLs are rejected so Postgres does not hold image bytes. Replacing or removing a picture deletes the previous Blob or local file when this app stored it. Pasted URLs are stored as text and left on their host.

Server Action request bodies are raised to 3MB (`experimental.serverActions.bodySizeLimit`). The framework default is 1MB, which is too small for a 2MB image plus multipart overhead.

## Pick clock and autodraft

Each live pick stores `League.pickDeadline` (server-authoritative). `pickClockSeconds` is how long that window lasts; new leagues default to **120 seconds (2:00)**. Commissioners can still set 15–300s before or during the draft. Pause clears the deadline; resume and each committed pick start a fresh clock. The draft room countdown is display-only (`mm:ss`).

When `now >= pickDeadline` and the league is still `DRAFTING` on that pick, the server autodrafts inside a transaction (`SELECT … FOR UPDATE` on the league row) and advances the snake. The same check runs when any client loads draft state (`GET /api/leagues/:id/draft`, including the room’s ~2s poll) and when `GET` or `POST /api/jobs/draft-tick` runs with `Authorization: Bearer $CRON_SECRET`.

Autopick ranking uses data already on `Fighter` (no invented rank column):

1. Tapology division rank in `rankingJson.rank`: champion `"C"` first, then 1, 2, 3…. Null or missing ranks are last. A rank of 2 in one division is treated as better than a rank of 5 in another, because that is the only quality signal in the seed.
2. More recent `lastFightDate` (nulls last).
3. Name A→Z, then fighter id.

Only `active` fighters who are not already drafted are eligible. The best of those who fit an **open** slot is taken. If that fighter’s weight class is still open, they fill that slot. Flex is used only when the best remaining fighter does not match an open dedicated slot. The history row is stored with `autoPick` and shown with an **Auto** badge.

**Unattended drafts.** An open draft room keeps the clock honest because loading state performs the autopick. If everyone leaves, nothing advances until the next page load or a call to `/api/jobs/draft-tick`. That route is safe to cron. It is **not** on the default `vercel.json` schedule: Hobby cron is once per day, and a daily tick would only complete a single expired pick. On a plan that allows it, add:

```json
{ "path": "/api/jobs/draft-tick", "schedule": "* * * * *" }
```

```bash
curl -X POST "$APP_URL/api/jobs/draft-tick" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Scoring

Point values live in `src/lib/scoring.ts` and the in-app Scoring tab. Cite in UI as “scoring based on DraftKings Classic MMA”.

Documented path to score a completed event:

1. **Admin → Score demo fixture** — applies `data/sample-event.json` (no network). Idempotent upsert on event id.
2. **Admin → Ingest latest UFC Stats event** — pulls [ufcstats.com completed events](http://ufcstats.com/statistics/events/completed), then fight-detail pages.
3. **Admin → paste an event-details URL**.
4. **CLI**
   - `npm run score:sample`
   - `npm run score:ingest` (latest)
   - `npm run score:ingest -- http://ufcstats.com/event-details/...`
5. **Sunday afternoon job** (default 3:00 PM PT / 22:00 UTC)
   - Long-running: `npm run cron` (optional `--now`)
   - Vercel Cron: `GET /api/jobs/sunday-score` with `Authorization: Bearer $CRON_SECRET`
   - Manual: `POST /api/jobs/sunday-score` with the same header

Jobs store raw fight stat lines plus computed fantasy points per fighter per event. Re-running the same event replaces its fights/scores (idempotent for standings).

## Fighter seed

`data/fighters_by_class.json` is an Active Fighter Repository export (640 fighters, 11 classes; snapshot `2026-09-21T09:38:06-07:00`). `prisma/seed.ts` upserts each fighter and maps `class_key` → roster slots. Fighters already stored but missing from the file are marked `active: false` so they leave the draft pool; picks and scores stay attached to the old row.

| `class_key` | Roster slot |
| --- | --- |
| `mens_flyweight` | Men’s Flyweight |
| `mens_bantamweight` | Men’s Bantamweight |
| `mens_featherweight` | Men’s Featherweight |
| `mens_lightweight` | Men’s Lightweight |
| `mens_welterweight` | Men’s Welterweight |
| `mens_middleweight` | Men’s Middleweight |
| `mens_light_heavyweight` | Men’s Light Heavyweight |
| `mens_heavyweight` | Men’s Heavyweight |
| `womens_strawweight` | Women’s Strawweight |
| `womens_flyweight` | Women’s Flyweight |
| `womens_bantamweight` | Women’s Bantamweight (25 listed; under 30 is expected) |

Each fighter is stored once (`id` from Tapology slug). Women’s Bantamweight is thinner than the ≥30 guideline on purpose.

## Fighting this week

The standings page leads with the rostered fighters booked on the upcoming UFC card, grouped by team in standings order. The panel is server-rendered with the rest of the page.

The upcoming card is the file's primary event while that date is still today or later in **America/Los_Angeles**. An event stays on the panel through the end of its event day. After that day, the panel uses the earliest still-future entry in `next_events`. If every seeded card is in the past, the page derives a card from `Fighter.nextBoutJson` (earliest future `date`, grouped by event name). A bout with an event name and an empty `date` is included when that event name matches the chosen card. Bout names match fighter records without regard to accents or case, and a roster that holds both spellings (Juan Diaz and Juan Díaz) lists that person once. `confirmed: false` on the bout that is shown — either the card file or `nextBoutJson` — draws a small unconfirmed tag. `tapology_url` and `card_segment` may be null. Only fighters on a roster in the league being viewed are listed.

`Fighter.upcomingFightClass` is not used to pick the card. The seed sets it to the fighter's `classKey` whenever `nextBoutJson` is present.

`prisma db seed` loads the first upcoming-card file that exists:

1. `/home/box/shared/active-fighter-repository/upcoming_card.json`
2. `data/upcoming_card.json` (committed copy of the shared export)
3. `data/upcoming-card.json`

If none of those files exist, the seed logs a skip and does not change `UfcCard`. The file shape is:

```json
{
  "event": "UFC 332",
  "date": "2026-10-03",
  "location": "Las Vegas, Nevada",
  "tapology_url": "https://www.tapology.com/fightcenter/events/...",
  "bouts": [
    { "fighter_a": "Alden Coria", "fighter_b": "Imanol Rodriguez", "weight_class": "Flyweight", "card_segment": "Prelims" }
  ],
  "next_events": [{ "event": "UFC 333", "date": "2026-10-24", "bouts": [] }]
}
```

On production, copy the shared export into place (or rely on the committed fallback), then run `npx prisma migrate deploy` and `npx prisma db seed`.

Optional demo accounts (`SEED_DEMO=true` in `.env` before `npm run db:seed`):

- `commish@mmanomaly.local` / `draftready`
- `player@mmanomaly.local` / `draftready`

## Tests

```bash
npm test
```

Covers snake order (13 slots × N teams), the 2:00 autodraft (expiry, open slots, uniqueness, ranking, and a manual-vs-autopick race), and the DK Classic formula (SS = strike + additional, R1 quick-win, decision vs finish, loser move points).

## Out of scope for v1

Payments, public discovery, native mobile apps, live in-fight scoring, multi-league UX polish, chat.
