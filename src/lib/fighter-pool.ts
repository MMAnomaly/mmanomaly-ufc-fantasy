import { CLASS_TO_SLOT, CLASS_LABELS, SLOT_LABELS, type ClassKey } from "./slots";
import { isIsoDate, losAngelesDateKey, normalizeMatchKey, parseNextBout } from "./upcoming-card";

export const POOL_CLASS_KEYS = Object.keys(CLASS_TO_SLOT) as ClassKey[];

export type PoolFighterInput = {
  id: string;
  name: string;
  classKey: string;
  weightClass: string;
  record: string | null;
  lastFightDate: Date | null;
  lastFightClass: string | null;
  nextBoutJson: string | null;
  tapologyUrl: string | null;
  active: boolean;
  activityNotes: string | null;
  draftedBy: string | null;
};

export type PoolCardInput = {
  name: string;
  date: string;
  boutsJson: string;
};

export type PoolRow = {
  id: string;
  name: string;
  classKey: string;
  classLabel: string;
  record: string | null;
  weightClass: string;
  lastFightDate: string | null;
  lastFightClass: string | null;
  upcoming: string | null;
  tapologyUrl: string | null;
  draftedBy: string | null;
  removalNote: string | null;
};

export type PoolSort = "name" | "lastFight";

export type PoolFilter = {
  query: string;
  classKey: string;
  availableOnly: boolean;
  sort: PoolSort;
  direction: "asc" | "desc";
};

type UpcomingCandidate = {
  opponent: string | null;
  event: string | null;
  date: string | null;
};

export function poolClassLabel(classKey: string): string {
  if (classKey in CLASS_TO_SLOT) {
    return SLOT_LABELS[CLASS_TO_SLOT[classKey as ClassKey]];
  }
  return classKey;
}

export function poolCounts(rows: Pick<PoolRow, "classKey">[]): { byClass: Record<ClassKey, number>; other: number; total: number } {
  const byClass = Object.fromEntries(POOL_CLASS_KEYS.map((key) => [key, 0])) as Record<ClassKey, number>;
  let other = 0;
  for (const row of rows) {
    if (row.classKey in byClass) byClass[row.classKey as ClassKey] += 1;
    else other += 1;
  }
  return { byClass, other, total: rows.length };
}

export function buildFighterPool(args: {
  fighters: PoolFighterInput[];
  cards: PoolCardInput[];
  includeInactive: boolean;
  today: string;
}): { active: PoolRow[]; inactive: PoolRow[] } {
  const cardsByName = indexCards(args.cards);
  const active: PoolRow[] = [];
  const inactive: PoolRow[] = [];
  for (const fighter of args.fighters) {
    const row = toRow(fighter, cardsByName, args.today);
    if (fighter.active) active.push(row);
    else if (args.includeInactive) inactive.push(row);
  }
  active.sort(compareName);
  inactive.sort(compareName);
  return { active, inactive };
}

export function filterPoolRows(rows: PoolRow[], filter: PoolFilter): PoolRow[] {
  const query = normalizeMatchKey(filter.query);
  const matched = rows.filter((row) => {
    if (filter.classKey === "other") {
      if ((POOL_CLASS_KEYS as string[]).includes(row.classKey)) return false;
    } else if (filter.classKey !== "all" && row.classKey !== filter.classKey) return false;
    if (filter.availableOnly && row.draftedBy) return false;
    if (query && !normalizeMatchKey(row.name).includes(query)) return false;
    return true;
  });
  const direction = filter.direction === "desc" ? -1 : 1;
  return [...matched].sort((a, b) => {
    if (filter.sort === "lastFight") {
      if (a.lastFightDate === b.lastFightDate) return compareName(a, b);
      if (!a.lastFightDate) return 1;
      if (!b.lastFightDate) return -1;
      return a.lastFightDate < b.lastFightDate ? -direction : direction;
    }
    return compareName(a, b) * direction;
  });
}

function toRow(fighter: PoolFighterInput, cardsByName: Map<string, UpcomingCandidate[]>, today: string): PoolRow {
  const lastFightDate = fighter.lastFightDate ? losAngelesDateKey(fighter.lastFightDate) : null;
  return {
    id: fighter.id,
    name: fighter.name,
    classKey: fighter.classKey,
    classLabel: poolClassLabel(fighter.classKey),
    record: fighter.record,
    weightClass: fighter.weightClass,
    lastFightDate,
    lastFightClass: fightClassLabel(fighter.lastFightClass),
    upcoming: upcomingLabel(fighter.name, fighter.nextBoutJson, cardsByName, today),
    tapologyUrl: safeHttpUrl(fighter.tapologyUrl),
    draftedBy: fighter.draftedBy,
    removalNote: fighter.active ? null : blankToNull(fighter.activityNotes),
  };
}

function fightClassLabel(value: string | null): string | null {
  if (!value) return null;
  if (value in CLASS_LABELS) return CLASS_LABELS[value as ClassKey];
  return value;
}

function upcomingLabel(
  name: string,
  nextBoutJson: string | null,
  cardsByName: Map<string, UpcomingCandidate[]>,
  today: string,
): string | null {
  const candidates = [...(cardsByName.get(normalizeMatchKey(name)) ?? [])];
  const next = parseNextBout(nextBoutJson);
  if (next) {
    const date = next.date && isIsoDate(next.date) ? next.date : null;
    candidates.push({ opponent: next.opponent, event: next.event, date });
  }
  const future = candidates
    .filter((item) => item.date && item.date >= today)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.event ?? "").localeCompare(b.event ?? ""));
  if (future[0]) return formatUpcoming(future[0]);
  const announced = candidates.find((item) => !item.date && (item.opponent || item.event));
  return announced ? formatUpcoming(announced) : null;
}

function formatUpcoming(item: UpcomingCandidate): string | null {
  const parts = [item.opponent ? `vs ${item.opponent}` : null, item.event, item.date].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function indexCards(cards: PoolCardInput[]): Map<string, UpcomingCandidate[]> {
  const map = new Map<string, UpcomingCandidate[]>();
  for (const card of cards) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(card.boutsJson) as unknown;
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const bout of parsed) {
      if (!bout || typeof bout !== "object") continue;
      const record = bout as { fighter_a?: unknown; fighter_b?: unknown };
      const fighterA = typeof record.fighter_a === "string" ? record.fighter_a.trim() : "";
      const fighterB = typeof record.fighter_b === "string" ? record.fighter_b.trim() : "";
      const date = isIsoDate(card.date) ? card.date : null;
      if (fighterA) pushCard(map, fighterA, { opponent: fighterB || null, event: card.name, date });
      if (fighterB) pushCard(map, fighterB, { opponent: fighterA || null, event: card.name, date });
    }
  }
  return map;
}

function pushCard(map: Map<string, UpcomingCandidate[]>, name: string, candidate: UpcomingCandidate) {
  const key = normalizeMatchKey(name);
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(candidate);
  else map.set(key, [candidate]);
}

function compareName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "en");
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
