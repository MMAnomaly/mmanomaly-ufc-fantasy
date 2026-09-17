# MMAnomaly UFC Fantasy

Invite-only UFC season fantasy for private leagues. Snake draft, 13-slot rosters, scoring based on DraftKings Classic MMA.

MMAnomaly is **not** affiliated with, endorsed by, or sponsored by UFC or DraftKings.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Prisma (SQLite for local demo; schema is Postgres-ready)
- Email + password sessions (httpOnly JWT cookie)
- Polling draft room (~2s)
- UFC Stats ingest scaffold + Sunday 3:00 PM `America/Los_Angeles` job hook

## Quick start

```bash
cp .env.example .env
# set AUTH_SECRET and CRON_SECRET (openssl rand -base64 32)

npm install
npm run setup      # prisma generate + db push + seed 685 fighters
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Default `file:./dev.db` (SQLite, relative to `prisma/`) |
| `AUTH_SECRET` | JWT signing key (required, ≥16 chars) |
| `APP_URL` | Optional public origin for scripts |
| `CRON_SECRET` | Bearer token for `POST /api/jobs/sunday-score` |
| `SEED_DEMO` | If `true`, seed also creates demo users/league |

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
5. **Sunday afternoon job** (default 3:00 PM PT)
   - Long-running: `npm run cron` (optional `--now`)
   - Platform cron: `POST /api/jobs/sunday-score` with `Authorization: Bearer $CRON_SECRET`

Jobs store raw fight stat lines plus computed fantasy points per fighter per event. Re-running the same event replaces its fights/scores (idempotent for standings).

## Fighter seed

`data/fighters_by_class.json` is an Active Fighter Repository export (~685 fighters, 11 classes). `prisma/seed.ts` maps `class_key` → roster slots:

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
| `womens_bantamweight` | Women’s Bantamweight (27 listed; under 30 is expected) |

Each fighter is stored once (`id` from Tapology slug). Women’s Bantamweight is thinner than the ≥30 guideline on purpose.

Optional demo accounts (`SEED_DEMO=true` in `.env` before `npm run db:seed`):

- `commish@mmanomaly.local` / `draftready`
- `player@mmanomaly.local` / `draftready`

## Postgres

Schema avoids SQLite-only types so you can switch:

1. `docker compose up -d` (optional)
2. In `prisma/schema.prisma` set `provider = "postgresql"`
3. `DATABASE_URL="postgresql://mmanomaly:mmanomaly@localhost:5432/mmanomaly"`
4. `npx prisma db push && npm run db:seed`

## Tests

```bash
npm test
```

Covers snake order (13 slots × N teams) and the DK Classic formula (SS = strike + additional, R1 quick-win, decision vs finish, loser move points).

## Out of scope for v1

Payments, public discovery, native mobile apps, live in-fight scoring, multi-league UX polish, chat.
