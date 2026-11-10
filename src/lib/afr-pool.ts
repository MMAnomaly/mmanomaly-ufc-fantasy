import type { PrismaClient } from "@prisma/client";
import { AfrImportError } from "./afr-results";
import { CLASS_LABELS, CLASS_TO_SLOT, type ClassKey } from "./slots";
import {
  parseUpcomingCardDocument,
  serializeBouts,
  upcomingCardExternalKey,
  type ExplicitCard,
} from "./upcoming-card";

type SeedFighter = {
  name: string;
  tapology_url?: string | null;
  wikipedia_url?: string | null;
  weight_class: string;
  class_key: string;
  sex: string;
  record?: string | null;
  ranking?: unknown;
  next_bout?: unknown;
  last_fight_date?: string | null;
  last_fight_note?: string | null;
  activity_notes?: string | null;
};

type FighterWrite = {
  id: string;
  classKey: string;
  name: string;
  slotKey: string;
  sex: string;
  weightClass: string;
  record: string | null;
  rankingJson: string | null;
  lastFightDate: Date | null;
  lastFightClass: string;
  lastFightNote: string | null;
  upcomingFightClass: string | null;
  nextBoutJson: string | null;
  tapologyUrl: string | null;
  wikipediaUrl: string | null;
  active: true;
  activityNotes: string | null;
};

export type FighterPoolResult = {
  upserted: number;
  deactivated: number;
  rosteredRetained: number;
  unmatchedReleases: string[];
  classCounts: Record<string, number>;
  /** Active fighters currently in the draft pool, keyed by class_key. Known divisions are always present. */
  activeByClass: Record<string, number>;
  skippedClasses: string[];
};

export type FoughtFighterInput = {
  name: string;
  weightClass: string | null;
  tapologyUrl?: string | null;
  foughtAt?: Date | null;
};

export type FoughtSyncResult = {
  added: string[];
  reactivated: string[];
  unclassified: string[];
};

type PoolIdentity = {
  id: string;
  name: string;
  tapologyUrl: string | null;
  active: boolean;
  rostered: boolean;
};

type PreparedFighter = {
  released: boolean;
  write: FighterWrite;
};

export type UpcomingCardResult = {
  upserted: number;
  removed: number;
  unchanged: boolean;
};

export type AfrCardsResult = {
  fighters: FighterPoolResult;
  cards: UpcomingCardResult;
  addedFromCards: string[];
  reactivatedFromCards: string[];
  unclassifiedFromCards: string[];
};

export type UpcomingCardFighter = {
  name: string;
  weightClass: string | null;
  tapologyUrl: string | null;
};

/** Cards-payload and fightersByClass removal lists. `left_ufc` is an alias of `inactive`. */
export type PoolRemovalOptions = {
  released?: unknown;
  cut?: unknown;
  retired?: unknown;
  inactive?: unknown;
  left_ufc?: unknown;
};

type RemovalToken = {
  /** Text returned when nobody matches. */
  label: string;
  /** A string entry (name or URL). Null when the entry is an object. */
  raw: string | null;
  name: string | null;
  tapologyUrl: string | null;
};

const REMOVAL_LIST_KEYS = ["released", "cut", "retired", "inactive", "left_ufc"] as const;

const REMOVAL_STATUSES = new Set([
  "released",
  "cut",
  "retired",
  "retirement",
  "release",
  "inactive",
  "left_ufc",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isClassKey(value: string): value is ClassKey {
  return Object.prototype.hasOwnProperty.call(CLASS_TO_SLOT, value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function fighterId(fighter: SeedFighter) {
  const fromUrl = tapologySlug(fighter.tapology_url ?? null);
  if (fromUrl) return fromUrl;
  return `${fighter.class_key}-${slugify(fighter.name)}`;
}

/** Accents, case, and punctuation ignored. Shared with scoring's name match. */
export function normalizeFighterName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Exact normalized name, otherwise the unique fighter whose name contains the
 * other. The same rule scoring uses, so a results row and a score attach to
 * one pool fighter.
 */
export function matchFighterByName<T extends { name: string }>(fighters: T[], name: string): T | null {
  const target = normalizeFighterName(name);
  if (!target) return null;
  const exact = fighters.find((fighter) => normalizeFighterName(fighter.name) === target);
  if (exact) return exact;
  const contains = fighters.filter((fighter) => {
    const normalized = normalizeFighterName(fighter.name);
    return normalized.includes(target) || target.includes(normalized);
  });
  return contains.length === 1 ? contains[0] : null;
}

function normalizeDivisionLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z']+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Map a bout's weight-class label onto a roster division.
 * Catchweight notes in parentheses are ignored (`Lightweight (catchweight 163.5 lb)`).
 * Returns null when the label is not one of the eleven draft divisions.
 */
export function classKeyForWeightClass(weightClass: string): ClassKey | null {
  const normalized = normalizeDivisionLabel(weightClass);
  if (!normalized) return null;
  const labels = (Object.entries(CLASS_LABELS) as [ClassKey, string][]).sort(
    (a, b) => normalizeDivisionLabel(b[1]).length - normalizeDivisionLabel(a[1]).length,
  );
  for (const [classKey, label] of labels) {
    const needle = normalizeDivisionLabel(label);
    if (normalized === needle || normalized.startsWith(`${needle} `)) return classKey;
  }
  const aliases: Record<string, ClassKey> = {
    strawweight: "womens_strawweight",
    "women strawweight": "womens_strawweight",
    "womens strawweight": "womens_strawweight",
  };
  return aliases[normalized.replace(/'/g, "")] ?? null;
}

/**
 * Division for an upcoming-card bout. Title and interim notes in parentheses
 * are ignored. A catchweight label is not a draft division.
 */
export function classKeyForUpcomingWeightClass(weightClass: string): ClassKey | null {
  if (/catch\s*weight/i.test(weightClass)) return null;
  return classKeyForWeightClass(weightClass);
}

function sexForClass(classKey: ClassKey): string {
  return classKey.startsWith("womens_") ? "women" : "men";
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function urlSlug(value: string): string | null {
  const canonical = canonicalUrl(value);
  if (!canonical) return null;
  const slug = new URL(canonical).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!slug) return null;
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function tapologySlug(url: string | null): string | null {
  if (!url) return null;
  return urlSlug(url);
}

/**
 * A release entry matches a stored fighter when:
 * - the text is the fighter id (Tapology slug), or
 * - the text is an http(s) URL whose slug or canonical form matches the id or `tapologyUrl`, or
 * - the text is the fighter's full name (accents, case, and punctuation ignored).
 * URL entries that do not match are not compared as names. UFC Stats fighter-details
 * URLs match only when that last path segment is the stored fighter id.
 */
function releaseTokenMatches(
  token: string,
  fighter: { id: string; name: string; tapologyUrl: string | null },
): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (fighter.id.toLowerCase() === trimmed.toLowerCase()) return true;
  const slug = urlSlug(trimmed);
  if (slug) {
    if (fighter.id.toLowerCase() === slug.toLowerCase()) return true;
    if (fighter.tapologyUrl) {
      const fighterSlug = urlSlug(fighter.tapologyUrl);
      if (fighterSlug && fighterSlug.toLowerCase() === slug.toLowerCase()) return true;
      const left = canonicalUrl(fighter.tapologyUrl);
      const right = canonicalUrl(trimmed);
      if (left && right && left === right) return true;
    }
    return false;
  }
  return normalizeFighterName(fighter.name) === normalizeFighterName(trimmed);
}

function removalTokenFrom(entry: unknown, label: string, index: number): RemovalToken {
  if (typeof entry === "string") {
    const text = entry.trim();
    if (!text) throw new AfrImportError(`${label}[${index}] must be a name, URL, or object`);
    return { label: text, raw: text, name: null, tapologyUrl: null };
  }
  if (isRecord(entry)) {
    const name = readString(entry.name);
    const tapologyUrl = readString(entry.tapology_url) ?? readString(entry.tapologyUrl);
    if (!name && !tapologyUrl) {
      throw new AfrImportError(`${label}[${index}] needs a name or tapology_url`);
    }
    return { label: name ?? tapologyUrl ?? "", raw: null, name, tapologyUrl };
  }
  throw new AfrImportError(`${label}[${index}] must be a name, URL, or object`);
}

function readRemovalList(value: unknown, label: string): RemovalToken[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new AfrImportError(`${label} must be an array of fighter names, URLs, or { name, tapology_url } objects`);
  }
  return value.map((entry, index) => removalTokenFrom(entry, label, index));
}

function tokenKey(token: RemovalToken): string {
  const url = token.tapologyUrl ?? (token.raw && urlSlug(token.raw) ? token.raw : null);
  if (url) return `url:${canonicalUrl(url) ?? url.toLowerCase()}`;
  if (token.name) return `name:${normalizeFighterName(token.name)}`;
  if (token.raw) return `raw:${normalizeFighterName(token.raw) || token.raw.toLowerCase()}`;
  return token.label.toLowerCase();
}

function dedupeTokens(tokens: RemovalToken[]): RemovalToken[] {
  const seen = new Set<string>();
  const out: RemovalToken[] = [];
  for (const token of tokens) {
    const key = tokenKey(token);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function isRemovalStatus(value: unknown): boolean {
  const text = readString(value);
  if (!text) return false;
  return REMOVAL_STATUSES.has(text.toLowerCase());
}

export function removalTokensFrom(raw: unknown, options?: PoolRemovalOptions): RemovalToken[] {
  const document = isRecord(raw) ? raw : {};
  const tokens: RemovalToken[] = [];
  for (const key of REMOVAL_LIST_KEYS) {
    tokens.push(...readRemovalList(document[key], key));
    tokens.push(...readRemovalList(options?.[key], key));
  }
  return dedupeTokens(tokens);
}

function identitiesMatchingToken<T extends { id: string; name: string; tapologyUrl: string | null }>(
  token: RemovalToken,
  roster: T[],
): T[] {
  if (token.raw) {
    const raw = token.raw;
    return roster.filter((fighter) => releaseTokenMatches(raw, fighter));
  }
  if (token.tapologyUrl) {
    const tapologyUrl = token.tapologyUrl;
    const byUrl = roster.filter((fighter) => releaseTokenMatches(tapologyUrl, fighter));
    if (byUrl.length > 0) return byUrl;
  }
  if (token.name) {
    const nameKey = normalizeFighterName(token.name);
    return roster.filter((fighter) => normalizeFighterName(fighter.name) === nameKey);
  }
  return [];
}

function sameBookedFighter(
  hit: { id: string; name: string; tapologyUrl: string | null },
  person: { name: string; tapologyUrl: string | null },
): boolean {
  if (normalizeFighterName(hit.name) === normalizeFighterName(person.name)) return true;
  if (person.tapologyUrl && hit.tapologyUrl && canonicalUrl(person.tapologyUrl) === canonicalUrl(hit.tapologyUrl)) {
    return true;
  }
  const slug = tapologySlug(person.tapologyUrl);
  return Boolean(slug && hit.id.toLowerCase() === slug.toLowerCase());
}

/** True when this import's removal lists name the booked fighter. URL matches win over a different name. */
function removalAppliesTo(
  person: { name: string; tapologyUrl: string | null },
  tokens: RemovalToken[],
  roster: { id: string; name: string; tapologyUrl: string | null }[],
): boolean {
  const probe = {
    id: tapologySlug(person.tapologyUrl) ?? "",
    name: person.name,
    tapologyUrl: person.tapologyUrl,
  };
  return tokens.some((token) => {
    const hits = identitiesMatchingToken(token, roster);
    if (hits.some((hit) => sameBookedFighter(hit, person))) return true;
    if (token.tapologyUrl && hits.length > 0) return false;
    if (token.raw) return releaseTokenMatches(token.raw, probe);
    if (token.tapologyUrl && releaseTokenMatches(token.tapologyUrl, probe)) return true;
    if (token.name && normalizeFighterName(token.name) === normalizeFighterName(person.name)) return true;
    return false;
  });
}

function asFighter(value: unknown, classKey: string): SeedFighter {
  if (!isRecord(value)) throw new AfrImportError(`Fighter in ${classKey} must be an object`);
  const name = readString(value.name);
  const sex = readString(value.sex);
  const weightClass = readString(value.weight_class);
  if (!name || !sex || !weightClass) {
    throw new AfrImportError(`Fighter in ${classKey} is missing name, sex, or weight_class`);
  }
  const classOnFighter = readString(value.class_key) ?? classKey;
  return {
    name,
    tapology_url: readString(value.tapology_url),
    wikipedia_url: readString(value.wikipedia_url),
    weight_class: weightClass,
    class_key: classOnFighter,
    sex,
    record: readString(value.record),
    ranking: value.ranking,
    next_bout: value.next_bout,
    last_fight_date: readString(value.last_fight_date),
    last_fight_note: readString(value.last_fight_note),
    activity_notes: readString(value.activity_notes),
  };
}

function fighterWrite(fighter: SeedFighter, classKey: ClassKey): FighterWrite {
  const hasBout = Boolean(fighter.next_bout);
  let lastFightDate: Date | null = null;
  if (fighter.last_fight_date) {
    const parsed = new Date(fighter.last_fight_date);
    if (Number.isNaN(parsed.getTime())) {
      throw new AfrImportError(`Invalid last_fight_date for ${fighter.name}`);
    }
    lastFightDate = parsed;
  }
  return {
    id: fighterId(fighter),
    name: fighter.name,
    classKey,
    slotKey: CLASS_TO_SLOT[classKey],
    sex: fighter.sex,
    weightClass: fighter.weight_class,
    record: fighter.record ?? null,
    rankingJson: fighter.ranking ? JSON.stringify(fighter.ranking) : null,
    lastFightDate,
    lastFightClass: classKey,
    lastFightNote: fighter.last_fight_note ?? null,
    upcomingFightClass: hasBout ? classKey : null,
    nextBoutJson: fighter.next_bout ? JSON.stringify(fighter.next_bout) : null,
    tapologyUrl: fighter.tapology_url ?? null,
    wikipediaUrl: fighter.wikipedia_url ?? null,
    active: true,
    activityNotes: fighter.activity_notes ?? null,
  };
}

function prepareFighters(raw: unknown): {
  fighters: PreparedFighter[];
  classCounts: Record<string, number>;
  skippedClasses: string[];
} {
  if (!isRecord(raw) || !isRecord(raw.classes)) {
    throw new AfrImportError("fightersByClass must include a classes object");
  }

  const fighters: PreparedFighter[] = [];
  const classCounts: Record<string, number> = {};
  const skippedClasses: string[] = [];

  for (const [classKey, group] of Object.entries(raw.classes)) {
    if (!isClassKey(classKey)) {
      skippedClasses.push(classKey);
      continue;
    }
    if (!isRecord(group) || !Array.isArray(group.fighters)) {
      throw new AfrImportError(`Class ${classKey} is missing a fighters array`);
    }
    classCounts[classKey] = 0;
    for (const entry of group.fighters) {
      const fighter = asFighter(entry, classKey);
      const row = fighterWrite(fighter, classKey);
      const released = isRecord(entry) && isRemovalStatus(entry.status);
      const prior = fighters.find((item) => item.write.id === row.id);
      if (prior) {
        if (released) prior.released = true;
        continue;
      }
      fighters.push({ released, write: row });
      classCounts[classKey] += 1;
    }
  }

  if (fighters.length === 0) {
    throw new AfrImportError("Fighter export contained no fighters; leaving existing active flags unchanged.");
  }

  return { fighters, classCounts, skippedClasses };
}

/**
 * Upsert the draftable fighter pool and upcoming-card rows.
 * Touches `Fighter` and `UfcCard` only. Absence from the file does not change
 * `active`. Removal lists mark unrostered fighters inactive. Fighters on the
 * upcoming card are added or reactivated unless this import also removes them.
 * Rostered fighters stay active. Users, leagues, rosters, picks, and scores
 * are not modified.
 *
 * Removal lists (`released`, `cut`, `retired`, `inactive`, `left_ufc`) may sit
 * on this payload and/or inside `fightersByClass`. Entries are names, URLs, or
 * `{ name, tapology_url }` objects. A fighter object may set `status` to
 * released, cut, retired, retirement, release, inactive, or left_ufc.
 */
export async function importAfrCards(
  db: PrismaClient,
  data: {
    fightersByClass: unknown;
    upcomingCard: unknown;
  } & PoolRemovalOptions,
): Promise<AfrCardsResult> {
  const options: PoolRemovalOptions = {
    released: data.released,
    cut: data.cut,
    retired: data.retired,
    inactive: data.inactive,
    left_ufc: data.left_ufc,
  };
  const fighters = await upsertFighterPool(db, data.fightersByClass, options);
  const cards = await upsertUpcomingCards(db, data.upcomingCard);
  const fromCards = await syncUpcomingCardFighters(
    db,
    data.upcomingCard,
    removalTokensFrom(data.fightersByClass, options),
  );
  return {
    fighters: { ...fighters, activeByClass: await activePoolByClass(db) },
    cards,
    addedFromCards: fromCards.added,
    reactivatedFromCards: fromCards.reactivated,
    unclassifiedFromCards: fromCards.unclassified,
  };
}

function poolFields(fighter: FighterWrite, active: boolean) {
  return {
    name: fighter.name,
    classKey: fighter.classKey,
    slotKey: fighter.slotKey,
    sex: fighter.sex,
    weightClass: fighter.weightClass,
    record: fighter.record,
    rankingJson: fighter.rankingJson,
    lastFightDate: fighter.lastFightDate,
    lastFightClass: fighter.lastFightClass,
    lastFightNote: fighter.lastFightNote,
    upcomingFightClass: fighter.upcomingFightClass,
    nextBoutJson: fighter.nextBoutJson,
    tapologyUrl: fighter.tapologyUrl,
    wikipediaUrl: fighter.wikipediaUrl,
    active,
    activityNotes: fighter.activityNotes,
  };
}

function resolvePoolId(fighter: FighterWrite, rows: PoolIdentity[]): string {
  const byId = rows.find((row) => row.id === fighter.id);
  if (byId) return byId.id;
  if (fighter.tapologyUrl) {
    const wanted = canonicalUrl(fighter.tapologyUrl);
    const byUrl = rows.filter((row) => row.tapologyUrl && wanted && canonicalUrl(row.tapologyUrl) === wanted);
    if (byUrl.length === 1) return byUrl[0].id;
  }
  const nameKey = normalizeFighterName(fighter.name);
  const placeholders = rows.filter((row) => !row.tapologyUrl && normalizeFighterName(row.name) === nameKey);
  if (placeholders.length === 1) return placeholders[0].id;
  return fighter.id;
}

export async function activePoolByClass(db: PrismaClient): Promise<Record<string, number>> {
  const rows = await db.fighter.findMany({
    where: { active: true },
    select: { classKey: true },
  });
  const counts: Record<string, number> = {};
  for (const classKey of Object.keys(CLASS_TO_SLOT)) counts[classKey] = 0;
  for (const row of rows) {
    counts[row.classKey] = (counts[row.classKey] ?? 0) + 1;
  }
  return counts;
}

/**
 * Upsert fighters from an AFR class export.
 * Fighters missing from the file keep their current `active` flag.
 * Removal lists and a per-fighter removal `status` are the only deactivation
 * signals, and they never deactivate a fighter who is on a roster.
 * A results-created row with no Tapology URL is adopted in place when this
 * file later includes that same name, so scores stay on one id.
 */
export async function upsertFighterPool(
  db: PrismaClient,
  raw: unknown,
  options?: PoolRemovalOptions,
): Promise<FighterPoolResult> {
  const prepared = prepareFighters(raw);
  const releaseTokens = removalTokensFrom(raw, options);

  const existingRows = await db.fighter.findMany({
    select: {
      id: true,
      name: true,
      tapologyUrl: true,
      active: true,
      rosterSlots: { select: { id: true }, take: 1 },
    },
  });
  const original: PoolIdentity[] = existingRows.map((row) => ({
    id: row.id,
    name: row.name,
    tapologyUrl: row.tapologyUrl,
    active: row.active,
    rostered: row.rosterSlots.length > 0,
  }));
  const index = original.map((row) => ({ ...row }));

  const planned: {
    id: string;
    write: FighterWrite;
    released: boolean;
    rostered: boolean;
    previouslyActive: boolean | null;
  }[] = [];

  for (const fighter of prepared.fighters) {
    const id = resolvePoolId(fighter.write, index);
    const prior = index.find((row) => row.id === id);
    planned.push({
      id,
      write: fighter.write,
      released: fighter.released,
      rostered: prior?.rostered ?? false,
      previouslyActive: prior ? prior.active : null,
    });
    if (prior) {
      prior.name = fighter.write.name;
      prior.tapologyUrl = fighter.write.tapologyUrl;
    } else {
      index.push({
        id,
        name: fighter.write.name,
        tapologyUrl: fighter.write.tapologyUrl,
        active: true,
        rostered: false,
      });
    }
  }

  const matchRoster = [
    ...original,
    ...planned.map((row) => ({
      id: row.id,
      name: row.write.name,
      tapologyUrl: row.write.tapologyUrl,
      active: row.previouslyActive ?? true,
      rostered: row.rostered,
    })),
  ];
  const removalIds = new Set<string>();
  const unmatchedReleases: string[] = [];
  for (const token of releaseTokens) {
    const hits = identitiesMatchingToken(token, matchRoster);
    if (hits.length === 0) unmatchedReleases.push(token.label);
    else for (const hit of hits) removalIds.add(hit.id);
  }
  for (const row of planned) {
    if (removalIds.has(row.id)) row.released = true;
  }

  let deactivated = 0;
  for (const row of planned) {
    const active = row.released && !row.rostered ? false : true;
    const data = poolFields(row.write, active);
    await db.fighter.upsert({
      where: { id: row.id },
      update: data,
      create: { id: row.id, ...data },
    });
    if (!active && row.previouslyActive !== false) deactivated += 1;
  }

  const touched = new Set(planned.map((row) => row.id));
  const stale = original.filter((row) => !touched.has(row.id) && removalIds.has(row.id));
  const toDeactivate = stale.filter((row) => !row.rostered && row.active).map((row) => row.id);
  if (toDeactivate.length > 0) {
    const updated = await db.fighter.updateMany({
      where: {
        id: { in: toDeactivate },
        active: true,
        rosterSlots: { none: {} },
      },
      data: { active: false },
    });
    deactivated += updated.count;
  }

  const rosteredRetained =
    planned.filter((row) => row.released && row.rostered).length + stale.filter((row) => row.rostered).length;

  return {
    upserted: prepared.fighters.length,
    deactivated,
    rosteredRetained,
    unmatchedReleases,
    classCounts: prepared.classCounts,
    activeByClass: await activePoolByClass(db),
    skippedClasses: prepared.skippedClasses,
  };
}

function divisionFields(classKey: ClassKey) {
  return {
    classKey,
    slotKey: CLASS_TO_SLOT[classKey],
    sex: sexForClass(classKey),
    weightClass: CLASS_LABELS[classKey],
    lastFightClass: classKey,
  };
}

function boutCorner(value: unknown, urlValue: unknown): { name: string; tapologyUrl: string | null } | null {
  if (typeof value === "string") {
    const name = readString(value);
    if (!name) return null;
    return { name, tapologyUrl: readString(urlValue) };
  }
  if (isRecord(value)) {
    const name = readString(value.name);
    if (!name) return null;
    return {
      name,
      tapologyUrl: readString(value.tapology_url) ?? readString(value.tapologyUrl) ?? readString(urlValue),
    };
  }
  return null;
}

function cornersFromBout(bout: unknown): UpcomingCardFighter[] {
  if (!isRecord(bout)) return [];
  const weightClass = readString(bout.weight_class);
  return [boutCorner(bout.fighter_a, bout.fighter_a_tapology_url), boutCorner(bout.fighter_b, bout.fighter_b_tapology_url)].flatMap(
    (corner) => (corner ? [{ name: corner.name, weightClass, tapologyUrl: corner.tapologyUrl }] : []),
  );
}

/** Primary-card bouts first, then each `next_events` card in file order. */
export function upcomingFightersFromCard(raw: unknown): UpcomingCardFighter[] {
  if (!isRecord(raw)) return [];
  const out: UpcomingCardFighter[] = [];
  const takeBouts = (bouts: unknown) => {
    if (!Array.isArray(bouts)) return;
    for (const bout of bouts) out.push(...cornersFromBout(bout));
  };
  takeBouts(raw.bouts);
  if (Array.isArray(raw.next_events)) {
    for (const event of raw.next_events) {
      if (isRecord(event)) takeBouts(event.bouts);
    }
  }
  return out;
}

/**
 * Add or reactivate fighters booked on the upcoming card.
 * The first bout in file order whose class maps wins. Catchweight and unknown
 * classes are reported and do not add or move anyone. A fighter named by this
 * import's removal lists is left for the removal pass. Unrostered active
 * fighters move when the upcoming bout is a different division. Writes `Fighter` only.
 */
export async function syncUpcomingCardFighters(
  db: PrismaClient,
  rawCard: unknown,
  removalTokens: RemovalToken[] = [],
): Promise<FoughtSyncResult> {
  const added: string[] = [];
  const reactivated: string[] = [];
  const unclassified: string[] = [];

  const existing = await db.fighter.findMany({
    select: {
      id: true,
      name: true,
      active: true,
      classKey: true,
      tapologyUrl: true,
      rosterSlots: { select: { id: true }, take: 1 },
    },
  });
  const known = existing.map((row) => ({
    id: row.id,
    name: row.name,
    tapologyUrl: row.tapologyUrl,
    active: row.active,
    classKey: row.classKey,
    rostered: row.rosterSlots.length > 0,
  }));
  const roster = known.map((row) => ({ id: row.id, name: row.name, tapologyUrl: row.tapologyUrl }));
  const taken = new Set(known.map((row) => row.id));
  const seen = new Map<string, { classified: boolean }>();

  const dropUnclassified = (name: string) => {
    const key = normalizeFighterName(name);
    for (let index = unclassified.length - 1; index >= 0; index -= 1) {
      if (normalizeFighterName(unclassified[index] ?? "") === key) unclassified.splice(index, 1);
    }
  };

  for (const appearance of upcomingFightersFromCard(rawCard)) {
    const name = appearance.name.trim();
    const nameKey = normalizeFighterName(name);
    if (!nameKey) continue;
    const prior = seen.get(nameKey);
    if (prior?.classified) continue;
    const classKey = appearance.weightClass ? classKeyForUpcomingWeightClass(appearance.weightClass) : null;
    if (!classKey) {
      if (!prior) {
        unclassified.push(name);
        seen.set(nameKey, { classified: false });
      }
      continue;
    }

    seen.set(nameKey, { classified: true });
    dropUnclassified(name);
    const person = { name, tapologyUrl: appearance.tapologyUrl };
    if (removalAppliesTo(person, removalTokens, roster)) continue;

    const match = matchFighterByName(known, name);
    if (!match) {
      const id = unusedFighterId(name, classKey, appearance.tapologyUrl, taken);
      taken.add(id);
      await db.fighter.create({
        data: {
          id,
          name,
          ...divisionFields(classKey),
          record: null,
          rankingJson: null,
          lastFightDate: null,
          lastFightNote: null,
          upcomingFightClass: classKey,
          nextBoutJson: null,
          tapologyUrl: appearance.tapologyUrl,
          wikipediaUrl: null,
          active: true,
          activityNotes: "Added from an upcoming card.",
        },
      });
      known.push({
        id,
        name,
        tapologyUrl: appearance.tapologyUrl,
        active: true,
        classKey,
        rostered: false,
      });
      roster.push({ id, name, tapologyUrl: appearance.tapologyUrl });
      added.push(name);
      continue;
    }

    if (!match.active) {
      const data: {
        active: true;
        upcomingFightClass?: string;
        classKey?: string;
        slotKey?: string;
        sex?: string;
        weightClass?: string;
        lastFightClass?: string;
      } = { active: true };
      if (!match.rostered) {
        Object.assign(data, divisionFields(classKey));
        data.upcomingFightClass = classKey;
        match.classKey = classKey;
      }
      await db.fighter.update({ where: { id: match.id }, data });
      match.active = true;
      reactivated.push(name);
      continue;
    }

    if (!match.rostered && match.classKey !== classKey) {
      await db.fighter.update({
        where: { id: match.id },
        data: { ...divisionFields(classKey), upcomingFightClass: classKey },
      });
      match.classKey = classKey;
    }
  }

  return { added, reactivated, unclassified };
}

function unusedFighterId(name: string, classKey: ClassKey, tapologyUrl: string | null, taken: Set<string>): string {
  const fromUrl = tapologySlug(tapologyUrl);
  if (fromUrl && !taken.has(fromUrl)) return fromUrl;
  const base = `${classKey}-${slugify(name)}`;
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** First appearance of each fighter wins, so callers pass the most recent bout first. */
export function foughtFightersFromEvent(event: {
  date: Date;
  fights: {
    fighter1Name: string;
    fighter2Name: string;
    weightClass?: string | null;
    stats: { fighterName: string; tapologyUrl?: string | null }[];
  }[];
}): FoughtFighterInput[] {
  const appearances: FoughtFighterInput[] = [];
  for (const fight of event.fights) {
    const urls = new Map<string, string | null>();
    for (const line of fight.stats) {
      if (!urls.has(line.fighterName)) urls.set(line.fighterName, line.tapologyUrl ?? null);
    }
    if (!urls.has(fight.fighter1Name)) urls.set(fight.fighter1Name, null);
    if (!urls.has(fight.fighter2Name)) urls.set(fight.fighter2Name, null);
    for (const [name, tapologyUrl] of urls) {
      appearances.push({
        name,
        weightClass: fight.weightClass ?? null,
        tapologyUrl,
        foughtAt: event.date,
      });
    }
  }
  return appearances;
}

/**
 * Ensure every fighter on a scored card is in the draft pool.
 * Inserts missing fighters into the bout's division and reactivates an
 * inactive fighter who is on the card. Writes `Fighter` only.
 */
export async function syncFoughtFighters(
  db: PrismaClient,
  appearances: FoughtFighterInput[],
): Promise<FoughtSyncResult> {
  const added: string[] = [];
  const reactivated: string[] = [];
  const unclassified: string[] = [];

  const existing = await db.fighter.findMany({
    select: {
      id: true,
      name: true,
      active: true,
      tapologyUrl: true,
      rosterSlots: { select: { id: true }, take: 1 },
    },
  });
  const known: (PoolIdentity & { rostered: boolean })[] = existing.map((row) => ({
    id: row.id,
    name: row.name,
    tapologyUrl: row.tapologyUrl,
    active: row.active,
    rostered: row.rosterSlots.length > 0,
  }));
  const taken = new Set(known.map((row) => row.id));
  const seen = new Set<string>();

  for (const appearance of appearances) {
    const name = appearance.name.trim();
    const nameKey = normalizeFighterName(name);
    if (!nameKey || seen.has(nameKey)) continue;
    seen.add(nameKey);

    const classKey = appearance.weightClass ? classKeyForWeightClass(appearance.weightClass) : null;
    const foughtAt =
      appearance.foughtAt && !Number.isNaN(appearance.foughtAt.getTime()) ? appearance.foughtAt : null;
    const match = matchFighterByName(known, name);

    if (match) {
      if (match.active) continue;
      const data: {
        active: true;
        lastFightDate?: Date;
        classKey?: string;
        slotKey?: string;
        sex?: string;
        weightClass?: string;
        lastFightClass?: string;
      } = { active: true };
      if (foughtAt) data.lastFightDate = foughtAt;
      if (!match.rostered && classKey) {
        data.classKey = classKey;
        data.slotKey = CLASS_TO_SLOT[classKey];
        data.sex = sexForClass(classKey);
        data.weightClass = CLASS_LABELS[classKey];
        data.lastFightClass = classKey;
      }
      await db.fighter.update({ where: { id: match.id }, data });
      match.active = true;
      reactivated.push(name);
      continue;
    }

    if (!classKey) {
      if (appearance.weightClass) unclassified.push(name);
      continue;
    }

    const id = unusedFighterId(name, classKey, appearance.tapologyUrl ?? null, taken);
    taken.add(id);
    await db.fighter.create({
      data: {
        id,
        name,
        classKey,
        slotKey: CLASS_TO_SLOT[classKey],
        sex: sexForClass(classKey),
        weightClass: CLASS_LABELS[classKey],
        record: null,
        rankingJson: null,
        lastFightDate: foughtAt,
        lastFightClass: classKey,
        lastFightNote: null,
        upcomingFightClass: null,
        nextBoutJson: null,
        tapologyUrl: appearance.tapologyUrl ?? null,
        wikipediaUrl: null,
        active: true,
        activityNotes: "Added from fight results.",
      },
    });
    known.push({
      id,
      name,
      tapologyUrl: appearance.tapologyUrl ?? null,
      active: true,
      rostered: false,
    });
    added.push(name);
  }

  return { added, reactivated, unclassified };
}

export async function upsertUpcomingCards(db: PrismaClient, raw: unknown): Promise<UpcomingCardResult> {
  const cards = dedupeUpcomingCards(parseUpcomingCardDocument(raw));
  if (cards.length === 0) {
    return { upserted: 0, removed: 0, unchanged: true };
  }

  const keys = cards.map((card) => upcomingCardExternalKey(card.event, card.date));
  const [removed] = await db.$transaction([
    db.ufcCard.deleteMany({ where: { externalKey: { notIn: keys } } }),
    ...cards.map((card) => {
      const externalKey = upcomingCardExternalKey(card.event, card.date);
      const data = {
        name: card.event,
        date: card.date,
        location: card.location,
        tapologyUrl: card.tapologyUrl,
        boutsJson: serializeBouts(card.bouts),
        sortOrder: card.sortOrder,
      };
      return db.ufcCard.upsert({
        where: { externalKey },
        update: data,
        create: { externalKey, ...data },
      });
    }),
  ]);

  return { upserted: cards.length, removed: removed.count, unchanged: false };
}

function dedupeUpcomingCards(cards: ExplicitCard[]) {
  const byKey = new Map<string, ExplicitCard>();
  for (const card of cards) {
    const key = upcomingCardExternalKey(card.event, card.date);
    const existing = byKey.get(key);
    if (!existing || card.bouts.length > existing.bouts.length) byKey.set(key, card);
  }
  return [...byKey.values()];
}
