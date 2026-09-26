import path from "node:path";

/**
 * Upcoming-card selection for the standings "Fighting this week" panel.
 *
 * An event dated today in America/Los_Angeles stays upcoming through the end
 * of that calendar day. `Fighter.upcomingFightClass` is not a card identifier:
 * the seed copies the fighter's class key into it whenever `nextBoutJson` is set.
 */

const LA_TIME_ZONE = "America/Los_Angeles";

const SHARED_UPCOMING_CARD = "/home/box/shared/active-fighter-repository/upcoming_card.json";

export type CardBout = {
  fighterA: string;
  fighterB: string;
  weightClass: string | null;
  cardSegment: string | null;
  /** False when the card file marks the bout as reported but not on the official card. */
  confirmed: boolean;
  order: number;
};

export type ExplicitCard = {
  event: string;
  date: string;
  location: string | null;
  tapologyUrl: string | null;
  bouts: CardBout[];
  sortOrder: number;
};

export type FightingRosterFighter = {
  id: string;
  name: string;
  weightClass: string | null;
  nextBoutJson: string | null;
};

export type FightingTeamInput = {
  membershipId: string;
  teamName: string;
  avatarUrl: string | null;
  fighters: FightingRosterFighter[];
};

export type FightingFighterView = {
  id: string;
  name: string;
  opponent: string | null;
  weightClass: string | null;
  cardSegment: string | null;
  unconfirmed: boolean;
};

export type FightingTeamView = {
  membershipId: string;
  teamName: string;
  avatarUrl: string | null;
  fighters: FightingFighterView[];
};

export type FightingThisWeek = {
  card: {
    event: string;
    date: string;
    dateLabel: string;
    location: string | null;
    tapologyUrl: string | null;
  } | null;
  teams: FightingTeamView[];
  teamsWithoutFighters: number;
};

type NextBout = {
  opponent: string | null;
  event: string | null;
  date: string;
  /** Null when the seed omitted the flag. False means reported, not official. */
  confirmed: boolean | null;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function upcomingCardCandidatePaths(cwd: string): string[] {
  return [
    SHARED_UPCOMING_CARD,
    path.join(cwd, "data", "upcoming_card.json"),
    path.join(cwd, "data", "upcoming-card.json"),
  ];
}

/** First existing candidate, or null when the card file is not on this machine. */
export function resolveUpcomingCardPath(
  exists: (filePath: string) => boolean,
  cwd = process.cwd(),
): string | null {
  return upcomingCardCandidatePaths(cwd).find((filePath) => exists(filePath)) ?? null;
}

export function upcomingCardExternalKey(event: string, date: string): string {
  const slug = normalizeMatchKey(event).replace(/\s+/g, "-");
  return `${slug || "card"}-${date}`;
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

/** Calendar day in America/Los_Angeles as YYYY-MM-DD. */
export function losAngelesDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Could not resolve the America/Los_Angeles calendar day");
  }
  return `${year}-${month}-${day}`;
}

/** "Sat, Oct 3" for a YYYY-MM-DD calendar date, rendered in America/Los_Angeles. */
export function formatCardDate(isoDate: string): string {
  if (!isIsoDate(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-").map(Number);
  // 20:00 UTC is still the same calendar day in Pacific time (UTC−7/−8).
  const instant = new Date(Date.UTC(year, month - 1, day, 20, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(instant);
}

export function normalizeMatchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseNextBout(json: string | null | undefined): NextBout | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const event = readString(parsed.event);
  const opponent = readString(parsed.opponent);
  const date = typeof parsed.date === "string" ? parsed.date.trim() : "";
  const confirmed = typeof parsed.confirmed === "boolean" ? parsed.confirmed : null;
  if (!event && !opponent) return null;
  return { event, opponent, date, confirmed };
}

export function parseUpcomingCardDocument(raw: unknown): ExplicitCard[] {
  if (!isRecord(raw)) return [];
  const cards: ExplicitCard[] = [];
  const primary = parseCard(raw, 0);
  if (primary) cards.push(primary);
  if (Array.isArray(raw.next_events)) {
    raw.next_events.forEach((item, index) => {
      const parsed = parseCard(item, index + 1);
      if (parsed) cards.push(parsed);
    });
  }
  return cards;
}

export function explicitCardFromStored(row: {
  name: string;
  date: string;
  location: string | null;
  tapologyUrl: string | null;
  boutsJson: string;
  sortOrder: number;
}): ExplicitCard | null {
  let bouts: unknown = [];
  try {
    bouts = JSON.parse(row.boutsJson);
  } catch {
    bouts = [];
  }
  return parseCard(
    {
      event: row.name,
      date: row.date,
      location: row.location,
      tapology_url: row.tapologyUrl,
      bouts,
    },
    row.sortOrder,
  );
}

export function serializeBouts(bouts: CardBout[]): string {
  return JSON.stringify(
    bouts.map((bout) => ({
      fighter_a: bout.fighterA,
      fighter_b: bout.fighterB,
      weight_class: bout.weightClass,
      card_segment: bout.cardSegment,
      confirmed: bout.confirmed,
    })),
  );
}

export function selectUpcomingCard(input: {
  explicitCards: ExplicitCard[];
  fighterNextBouts: (string | null | undefined)[];
  now: Date;
}): ExplicitCard | null {
  const today = losAngelesDateKey(input.now);
  const upcoming = input.explicitCards.filter(
    (card) => card.event.trim() && isIsoDate(card.date) && card.date >= today,
  );
  // The file's primary event stays up through the end of its Pacific day.
  // After that, the earliest still-future next_events entry takes over.
  const primary = upcoming.find((card) => card.sortOrder === 0);
  if (primary) return primary;
  const nextEvent = upcoming
    .filter((card) => card.sortOrder !== 0)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder || a.event.localeCompare(b.event),
    )[0];
  if (nextEvent) return nextEvent;
  return deriveCardFromBouts(input.fighterNextBouts, today);
}

export function buildFightingThisWeek(input: {
  teams: FightingTeamInput[];
  explicitCards: ExplicitCard[];
  fighterNextBouts: (string | null | undefined)[];
  now: Date;
}): FightingThisWeek {
  const card = selectUpcomingCard(input);
  if (!card) {
    return { card: null, teams: [], teamsWithoutFighters: input.teams.length };
  }

  const teams: FightingTeamView[] = [];
  for (const team of input.teams) {
    const seenIds = new Set<string>();
    const matched: (FightingFighterView & { segmentRank: number; order: number; nameKey: string })[] = [];
    for (const fighter of team.fighters) {
      if (seenIds.has(fighter.id)) continue;
      const row = matchFighter(fighter, card);
      if (!row) continue;
      seenIds.add(fighter.id);
      matched.push({ ...row, nameKey: normalizeMatchKey(fighter.name) || fighter.id });
    }
    // Juan Diaz and Juan Díaz are one person stored twice. Keep the card bout over a next-bout fallback.
    const byName = new Map<string, (typeof matched)[number]>();
    for (const row of matched) {
      const existing = byName.get(row.nameKey);
      if (!existing || preferRosterRow(row, existing)) byName.set(row.nameKey, row);
    }
    const fighters = [...byName.values()];
    fighters.sort(
      (a, b) => a.segmentRank - b.segmentRank || a.order - b.order || a.name.localeCompare(b.name),
    );
    if (fighters.length === 0) continue;
    teams.push({
      membershipId: team.membershipId,
      teamName: team.teamName,
      avatarUrl: team.avatarUrl,
      fighters: fighters.map((fighter) => ({
        id: fighter.id,
        name: fighter.name,
        opponent: fighter.opponent,
        weightClass: fighter.weightClass,
        cardSegment: fighter.cardSegment,
        unconfirmed: fighter.unconfirmed,
      })),
    });
  }

  return {
    card: {
      event: card.event,
      date: card.date,
      dateLabel: formatCardDate(card.date),
      location: card.location,
      tapologyUrl: safeHttpUrl(card.tapologyUrl),
    },
    teams,
    teamsWithoutFighters: input.teams.length - teams.length,
  };
}

function preferRosterRow(
  incoming: { order: number; unconfirmed: boolean },
  existing: { order: number; unconfirmed: boolean },
): boolean {
  if (incoming.order !== existing.order) return incoming.order < existing.order;
  if (incoming.unconfirmed !== existing.unconfirmed) return !incoming.unconfirmed;
  return false;
}

function deriveCardFromBouts(fighterNextBouts: (string | null | undefined)[], today: string): ExplicitCard | null {
  const byEvent = new Map<string, { event: string; date: string }>();
  for (const json of fighterNextBouts) {
    const bout = parseNextBout(json);
    if (!bout?.event || !isIsoDate(bout.date) || bout.date < today) continue;
    const key = normalizeMatchKey(bout.event);
    if (!key) continue;
    const existing = byEvent.get(key);
    if (!existing || bout.date < existing.date) {
      byEvent.set(key, { event: bout.event, date: bout.date });
    }
  }
  const earliest = [...byEvent.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.event.localeCompare(b.event),
  )[0];
  if (!earliest) return null;
  return {
    event: earliest.event,
    date: earliest.date,
    location: null,
    tapologyUrl: null,
    bouts: [],
    sortOrder: 0,
  };
}

function matchFighter(
  fighter: FightingRosterFighter,
  card: ExplicitCard,
): (FightingFighterView & { segmentRank: number; order: number }) | null {
  const nameKey = normalizeMatchKey(fighter.name);
  if (!nameKey) return null;

  const bout = card.bouts.find((item) => {
    return normalizeMatchKey(item.fighterA) === nameKey || normalizeMatchKey(item.fighterB) === nameKey;
  });
  if (bout) {
    const opponent = normalizeMatchKey(bout.fighterA) === nameKey ? bout.fighterB : bout.fighterA;
    return {
      id: fighter.id,
      name: fighter.name,
      opponent: opponent.trim() || null,
      weightClass: bout.weightClass?.trim() || fighter.weightClass?.trim() || null,
      cardSegment: segmentLabel(bout.cardSegment),
      unconfirmed: bout.confirmed === false,
      segmentRank: segmentRank(bout.cardSegment),
      order: bout.order,
    };
  }

  const next = parseNextBout(fighter.nextBoutJson);
  if (!next?.event) return null;
  if (normalizeMatchKey(next.event) !== normalizeMatchKey(card.event)) return null;
  if (next.date !== "" && next.date !== card.date) return null;
  if (next.date !== "" && !isIsoDate(next.date)) return null;

  return {
    id: fighter.id,
    name: fighter.name,
    opponent: next.opponent,
    weightClass: fighter.weightClass?.trim() || null,
    cardSegment: null,
    unconfirmed: next.confirmed === false,
    segmentRank: segmentRank(null),
    order: Number.MAX_SAFE_INTEGER,
  };
}

function segmentLabel(segment: string | null): string | null {
  if (!segment?.trim()) return null;
  const key = normalizeMatchKey(segment);
  const labels: Record<string, string> = {
    main: "Main card",
    prelims: "Prelims",
    prelim: "Prelims",
    "early prelims": "Early prelims",
    "early prelim": "Early prelims",
  };
  return labels[key] ?? segment.trim();
}

function segmentRank(segment: string | null): number {
  if (!segment) return 50;
  const key = normalizeMatchKey(segment);
  const ranks: Record<string, number> = {
    "main event": 0,
    main: 0,
    "main card": 1,
    prelims: 2,
    prelim: 2,
    "preliminary card": 2,
    "early prelims": 3,
    "early prelim": 3,
    "early preliminary card": 3,
  };
  return ranks[key] ?? 40;
}

function parseCard(value: unknown, sortOrder: number): ExplicitCard | null {
  if (!isRecord(value)) return null;
  const event = readString(value.event);
  const date = readString(value.date);
  if (!event || !date || !isIsoDate(date)) return null;
  const bouts: CardBout[] = [];
  if (Array.isArray(value.bouts)) {
    value.bouts.forEach((item, index) => {
      const bout = parseBout(item, index);
      if (bout) bouts.push(bout);
    });
  }
  return {
    event,
    date,
    location: readString(value.location),
    tapologyUrl: readString(value.tapology_url),
    bouts,
    sortOrder,
  };
}

function parseBout(value: unknown, order: number): CardBout | null {
  if (!isRecord(value)) return null;
  const fighterA = readString(value.fighter_a);
  const fighterB = readString(value.fighter_b);
  if (!fighterA || !fighterB) return null;
  return {
    fighterA,
    fighterB,
    weightClass: readString(value.weight_class),
    cardSegment: readString(value.card_segment),
    confirmed: value.confirmed !== false,
    order,
  };
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
