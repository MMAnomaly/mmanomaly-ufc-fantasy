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
| `ADMIN_IMPORT_SECRET` | Bearer token for `POST /api/admin/import`. Same value on Vercel and the ops machine. Generate: `openssl rand -base64 32` |
| `BLOB_READ_WRITE_TOKEN` | Optional. Stores uploaded team pictures in Vercel Blob. Without it, local dev writes `public/uploads/avatars` (gitignored). On Vercel without it, members paste a public image URL |
| `SEED_DEMO` | If `true`, seed also creates demo users/league |

Do not commit real secrets. Copy `.env.example` and generate values locally / in the Vercel dashboard.

## Deploy on Vercel

1. **Provision Postgres** — [Vercel Postgres](https://vercel.com/storage/postgres) or [Neon](https://neon.tech) (or another hosted Postgres). Copy the connection strings; do not invent them.
2. **Import the GitHub repo** at [vercel.com/new](https://vercel.com/new). Framework preset: Next.js. Build command: `npm run build` (runs `prisma generate`, then `prisma migrate deploy` when `DATABASE_URL` is set, then `next build`). Install runs `postinstall` → `prisma generate`.
3. **Set environment variables** (Production; Preview if you use a separate database):

   | Name | Value |
   | --- | --- |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `CRON_SECRET` | `openssl rand -base64 32` (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when this is set) |
   | `ADMIN_IMPORT_SECRET` | `openssl rand -base64 32`. Ops sends this as `Authorization: Bearer <ADMIN_IMPORT_SECRET>` to `POST /api/admin/import` |
   | `DATABASE_URL` | Pooled URL. Vercel Postgres: `POSTGRES_PRISMA_URL` or `POSTGRES_URL`. Neon: the pooled (`-pooler`) URL |
   | `DIRECT_URL` | Direct / non-pooling URL. Vercel Postgres: `POSTGRES_URL_NON_POOLING`. Neon: the non-pooler URL. Same as `DATABASE_URL` if the host has no pooler |
   | `APP_URL` | `https://your-project.vercel.app` (or your custom domain) |
   | `BLOB_READ_WRITE_TOKEN` | Optional. Vercel project → Storage → Blob → copy the read/write token. Enables team picture uploads in production |

4. **Deploy**. When `DATABASE_URL` is set, the Vercel build runs `prisma migrate deploy` before `next build`. That is how schema changes reach production: the ops machine cannot open Postgres on port 5432, and Vercel can. The command only applies migrations that are not already recorded. It does not seed and it does not delete scores. `DIRECT_URL` is the unpooled URL Prisma uses for migrate; if it is unset, the build uses `DATABASE_URL`. A local `npm run build` without `DATABASE_URL` skips migrate. If the database is unreachable, the production build fails instead of shipping a schema the app cannot read.
5. **First deploy / empty database — seed once** (migrate already ran in the build when the database env vars were set):

   ```bash
   npx vercel env pull .env.production.local
   npx prisma migrate deploy
   npx prisma db seed
   ```

   Equivalent: `npm run db:provision` with `DATABASE_URL` and `DIRECT_URL` pointing at that database.

   If you skip the migration folder, `npx prisma db push` then `npx prisma db seed` also creates the schema.

   Seed loads `data/fighters_by_class.json` (640 fighters) and, when a card file is present, the `UfcCard` rows used by Fighting this week. Optional `SEED_DEMO=true` is for local demos, not production.

   `prisma/migrations/20260926193600_ufc_card` adds `UfcCard`. `prisma/migrations/20261110183000_league_season_dates` adds `League.seasonStart` and `League.seasonEnd` and sets MMAnomaly League Season 5 to 2026-07-01 through 2026-12-31. The Vercel build applies both. The manual `npx prisma migrate deploy` above is the fallback when a build could not reach the database. Re-run the seed after replacing the upcoming-card file so the standings panel picks up the new bouts. If that file is absent, seed leaves existing `UfcCard` rows alone and the page derives the next card from `Fighter.nextBoutJson`.

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
2. **Create a league** at `/leagues/new` (4–12 teams, default 8; pick clock default 120s / 2:00). Season start and season end are required, and the end date has to be after the start. The commissioner can change both later under Admin → League settings. Dates are calendar days in America/Los_Angeles. Standings count a score when that event's Los Angeles day is inside the window, inclusive. Leagues with no dates still count every score. A seeded baseline always counts, including when its timestamp sits outside the window. A baseline event is one whose name, source, or external id contains `baseline`, or a score row with no bouts. Scores stay in the database either way. After the end date, standings keep that line and list the final podium: 1st, 2nd, and 3rd, with team name and season total. Ties use competition ranking (two teams tied for 1st are both 1st, and the next team is 3rd). Every team that ties into a top-3 place is shown. MMAnomaly League Season 5 is set to July 1, 2026 through December 31, 2026 by migration `20261110183000_league_season_dates`.
3. Copy the **invite link** from the lobby or Admin. Invitees hit `/join/[token]`, then register with email + password (or log in) and join. Unique email per league membership is enforced via unique user email + one membership per user/league.
4. **Admin**: randomize snake order, then Up/Down to pin last season’s winner at 1. Start the draft when at least 2 teams have joined. The commissioner can delete the league from Admin → Danger zone. That removes the league, memberships, roster slots, draft picks, and invites. Fighters, events, scores, upcoming cards, and user accounts stay.
5. **Pool** (`/leagues/[id]/pool`) lists every active fighter the draft can select, before and during the draft. Search, class, and available-only filters stay in the browser. **Draft**: on your turn pick **one fighter** into **any open slot**. Flex can be any class. No fighter may be drafted twice. When the server clock hits 0:00, the best eligible fighter is autodrafted (see below). Commissioner can pause, resume, reorder the snake, or force auto-pick.
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

Only `active` fighters who are not already drafted are eligible. The best of those who fit an **open** slot is taken. If that fighter’s weight class is still open, they fill that slot. Flex is used only when the best remaining fighter does not match an open dedicated slot. A manual pick uses the same server check inside the league lock: the fighter row has to be active, the slot has to be open and legal for that fighter (their division or Flex), and the fighter has to be undrafted in this league. The history row is stored with `autoPick` and shown with an **Auto** badge.

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

Jobs store raw fight stat lines plus computed fantasy points per fighter per event. Re-running the same event from the admin UI or CLI replaces its fights/scores (idempotent for standings). The ops import endpoint below does not rewrite an event that already has scores.

## Push Active Fighter Repository data

When the ops machine cannot open Postgres (`TCP 5432`) but can reach the deployment over HTTPS, scoring and card reloads run inside Vercel. Set `ADMIN_IMPORT_SECRET` on the deployment and on the ops machine, and set `APP_URL` to the deployment origin (no path).

```bash
node scripts/push-afr.mjs --cards /path/to/active-fighter-repository
node scripts/push-afr.mjs --results vegas122-results.json edmonton-results.json
node scripts/push-afr.mjs --cards /path/to/active-fighter-repository --results vegas122-results.json edmonton-results.json
```

`scripts/push-afr.mjs` is Node 20 with built-in `fetch` and no dependencies. `--cards` reads `fighters_by_class.json` and `upcoming_card.json` from that folder, and also `released.json`, `cut.json`, `retired.json`, `inactive.json`, and `left_ufc.json` when those files are present (each one is a JSON array). `--results` takes one or more results files and posts them oldest `event.date` first. When both flags are present, the card reload is posted first so new fighters exist before scoring. The script prints each response body and does not print the secret.

`POST /api/admin/import` is an App Router route handler on the Node.js runtime. Auth is `Authorization: Bearer <ADMIN_IMPORT_SECRET>`, compared in constant time. A mismatch is 401. If the env var is unset, the route returns 503 and does not read the body. The JSON body is `{ "kind": "results" | "cards", "data": ... }`. A full card reload is about 0.77 MB, under the platform body limit.

- `kind: "results"` — `data` is one Active Fighter Repository results file (see `test/fixtures/afr-edmonton-results.json` and `test/fixtures/afr-vegas122-results.json`). Each bout's `fighters` array is mapped into the existing `ParsedEvent` shape and scored with `persistAndScoreEvent`. `fighters_listed_on_card` is ignored. `externalId` and `url` are `event.ufcstats_url`, or `event.ufc_url` when that is null. `name` is `event.short_name`. `date` is the event date at 12:00 UTC. `source` is `afr-ufcstats`. Stat lines use `total_strikes_landed`, `sig_strikes_landed`, `takedowns_landed`, `reversals`, `control_time_seconds`, and `knockdowns`. `method`, `end_round`, and `end_time` come from the bout. `isWinner` is `result === "W"`; a draw (`"D"`) is not a winner. Optional `tapology_url` on a bout fighter is kept and becomes the pool id when that fighter is new. Before stat lines are written, every fighter on the card is synced into the draft pool (`Fighter` rows only): a fighter who is not already in the pool is inserted `active: true` in the division of their first bout in file order (AFR files sort `bout_order` ascending, so the main event is first). Catchweight text in parentheses is ignored, so `Lightweight (catchweight 163.5 lb)` maps to lightweight and `Women's Strawweight (catchweight 117 lb)` maps to women's strawweight. A label that is not one of the eleven draft divisions is returned in `unclassifiedFighters` and that fighter is left unmatched. An inactive fighter on the card is set `active: true` again; when they are on no roster, their division is updated to that bout. An already-active fighter keeps their current division. This sync does not modify users, leagues, rosters, picks, or scores. If a `UfcEvent` with that `externalId` already has fantasy scores, the handler returns `{ "alreadyScored": true, "activePoolByClass": ... }` and leaves the event, fights, scores, and the pool alone. Otherwise the response lists scored fighters with points, the unmatched fighter names, `fightersAdded`, `fightersReactivated`, `unclassifiedFighters`, and `activePoolByClass`.
- `kind: "cards"` — `data` is `{ "fightersByClass", "upcomingCard" }` in the shapes of `data/fighters_by_class.json` and `upcoming_card.json`, plus optional removal arrays `released`, `cut`, `retired`, `inactive`, and `left_ufc` (`left_ufc` is an alias of `inactive`). The fighter and `UfcCard` / `next_bout` upsert lives in `src/lib/afr-pool.ts` and is what `prisma/seed.ts` calls too. It writes fighters and upcoming-card rows only. It does not modify users, leagues, memberships, roster slots, draft picks, events, or scores. A fighter who is missing from the file keeps their current `active` flag and stays in the database. A fighter listed in `fightersByClass` is upserted `active: true` unless this same payload also removes them. Every fighter on the upcoming card (top-level `bouts`, then each `next_events[].bouts`) is added in that bout's division or reactivated. Title notes such as `(title)`, `(interim title)`, and `(BMF title)` are ignored. A catchweight or unknown class is skipped and returned in `unclassifiedFromCards`. An already-active unrostered fighter moves to the upcoming division when it differs from the division already stored (the pool lists the most recent competed class unless the upcoming bout is a new class). Rostered fighters are not moved. A fighter who is also on this import's removal lists is not added or reactivated. The response returns `fightersUpserted`, `fightersDeactivated`, `rosteredFightersRetained`, `unmatchedReleases`, `skippedClasses`, `addedFromCards`, `reactivatedFromCards`, `unclassifiedFromCards`, `activePoolByClass`, and the card counts. `activePoolByClass` is the number of active fighters in each `class_key` after the import (every draft division is present, plus any other class key still active). Use it to confirm each division stays at or above 30; heavyweight may run thinner, and the seeded women's bantamweight list is under 30 on purpose. A card payload with no dated events leaves existing `UfcCard` rows unchanged. The first mapped bout in that file order wins when the same fighter is booked twice.

### Removal signal

Send a removal signal when a fighter is cut, released, retired, or otherwise no longer active in the UFC. Leaving them out of `fighters_by_class.json` does not remove them from the draft pool. A later cards import that includes the fighter and omits the signal marks them active again, so keep sending the signal for as long as they should stay out, or include them again only when they are back.

`released`, `cut`, `retired`, `inactive`, and `left_ufc` are optional arrays. They can sit on the cards payload, on the `fightersByClass` document (next to `classes`), or both. The same arrays can be files named `released.json`, `cut.json`, `retired.json`, `inactive.json`, and `left_ufc.json` in the folder passed to `scripts/push-afr.mjs`. A fighter object inside a class may also set `status` to `released`, `cut`, `retired`, `retirement`, `release`, `inactive`, or `left_ufc` (any casing).

Each entry is a fighter name, a Tapology fighter URL, a UFC Stats fighter-details URL, or an object `{ "name", "tapology_url", "type", "date", "source" }`. `type`, `date`, and `source` are stored by the provider and ignored here; the object is still a removal. An object matches `tapology_url` first and uses `name` when the URL matches nobody.

```json
{
  "fightersByClass": {},
  "upcomingCard": {},
  "released": [
    "Some Cut Fighter",
    "https://www.tapology.com/fightcenter/fighters/12345-some-cut-fighter",
    {
      "name": "Farid Basharat",
      "tapology_url": null,
      "type": "release",
      "date": "2026-10-17",
      "source": "Contract not renewed"
    }
  ],
  "retired": [
    {
      "name": "Julian Erosa",
      "tapology_url": "https://www.tapology.com/fightcenter/fighters/julian-erosa",
      "type": "retirement",
      "date": "2026-10-31",
      "source": "Retired in the cage"
    }
  ]
}
```

Names match the stored name with accents, case, and punctuation ignored. The match is the full name. A Tapology URL matches `Fighter.tapologyUrl` or the fighter id (the URL slug). A UFC Stats URL matches when its last path segment equals the fighter id. Fighter ids are Tapology slugs, so send the fighter's name or Tapology URL; a UFC Stats hex id matches only when that id is already the stored fighter id. Entries that match nobody are returned in `unmatchedReleases` and do not fail the import. Rostered fighters stay active (`rosteredFightersRetained`). Unrostered matches are set `active: false` (`fightersDeactivated` is how many of those were active before this import). Sending the same payload again leaves those flags as they are. Manual picks and autodraft only accept an active pool fighter, in an open slot that fighter fills, who is not already drafted.

## Fighter seed

`data/fighters_by_class.json` is an Active Fighter Repository export (640 fighters, 11 classes; snapshot `2026-09-21T09:38:06-07:00`). `prisma/seed.ts` upserts each fighter and maps `class_key` → roster slots through `src/lib/afr-pool.ts`, the same function the cards import uses, then adds fighters from the upcoming-card file with the same rules. Fighters already stored but missing from the file keep their current `active` flag. A removal list on that file marks unrostered matches inactive. Rostered fighters stay active, and picks and scores stay on the same row. The seed log prints the active pool count per class.

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

Covers snake order (13 slots × N teams), the 2:00 autodraft (expiry, open slots, uniqueness, ranking, inactive and already-drafted fighters, and a manual-vs-autopick race), manual-pick rejection of an inactive fighter, a missing fighter, and a slot the fighter does not fill, the draft-pool import (absence keeps a fighter active, release/retirement/inactive signals, results-card and upcoming-card additions), the DK Classic formula (SS = strike + additional, R1 quick-win, decision vs finish, loser move points), and the Active Fighter Repository results mapping against `test/fixtures`.

## Out of scope for v1

Payments, public discovery, native mobile apps, live in-fight scoring, multi-league UX polish, chat.
