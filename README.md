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
| `CRON_SECRET` | Bearer token for `/api/jobs/sunday-score`. Generate: `openssl rand -base64 32` |
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

4. **Deploy**. The Next.js build does not apply migrations or seed data.
5. **First deploy / empty database — run once** (and again after new migrations):

   ```bash
   npx vercel env pull .env.production.local
   npx prisma migrate deploy
   npx prisma db seed
   ```

   Equivalent: `npm run db:provision` with `DATABASE_URL` and `DIRECT_URL` pointing at that database.

   If you skip the migration folder, `npx prisma db push` then `npx prisma db seed` also creates the schema.

   Seed loads `data/fighters_by_class.json` (640 fighters). Optional `SEED_DEMO=true` is for local demos, not production.

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
2. **Create a league** at `/leagues/new` (4–12 teams, default 8; pick clock default 90s).
3. Copy the **invite link** from the lobby or Admin. Invitees hit `/join/[token]`, then register with email + password (or log in) and join. Unique email per league membership is enforced via unique user email + one membership per user/league.
4. **Admin**: randomize snake order, then Up/Down to pin last season’s winner at 1. Start the draft when at least 2 teams have joined.
5. **Draft**: on your turn pick **one fighter** into **any open slot**. Flex can be any class. No fighter may be drafted twice. Timer expiry auto-picks a random eligible fighter. Commissioner can pause, resume, or force auto-pick.
6. **Standings** show season totals, last-event delta, and roster breakdown (zeros until a scoring job runs).

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

Optional demo accounts (`SEED_DEMO=true` in `.env` before `npm run db:seed`):

- `commish@mmanomaly.local` / `draftready`
- `player@mmanomaly.local` / `draftready`

## Tests

```bash
npm test
```

Covers snake order (13 slots × N teams) and the DK Classic formula (SS = strike + additional, R1 quick-win, decision vs finish, loser move points).

## Out of scope for v1

Payments, public discovery, native mobile apps, live in-fight scoring, multi-league UX polish, chat.
