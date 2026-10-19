import type { PrismaClient } from "@prisma/client";
import { AfrImportError } from "./afr-results";
import { CLASS_TO_SLOT, type ClassKey } from "./slots";
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
  classCounts: Record<string, number>;
  skippedClasses: string[];
};

export type UpcomingCardResult = {
  upserted: number;
  removed: number;
  unchanged: boolean;
};

export type AfrCardsResult = {
  fighters: FighterPoolResult;
  cards: UpcomingCardResult;
};

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
  const fromUrl = fighter.tapology_url?.split("/").filter(Boolean).pop();
  if (fromUrl) return fromUrl;
  return `${fighter.class_key}-${slugify(fighter.name)}`;
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
  fighters: FighterWrite[];
  classCounts: Record<string, number>;
  skippedClasses: string[];
} {
  if (!isRecord(raw) || !isRecord(raw.classes)) {
    throw new AfrImportError("fightersByClass must include a classes object");
  }

  const seen = new Set<string>();
  const fighters: FighterWrite[] = [];
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
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      fighters.push(row);
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
 * Touches `Fighter` and `UfcCard` only. Rostered fighters missing from the
 * file stay in place; unrostered absences are marked inactive and not deleted.
 */
export async function importAfrCards(
  db: PrismaClient,
  data: { fightersByClass: unknown; upcomingCard: unknown },
): Promise<AfrCardsResult> {
  const fighters = await upsertFighterPool(db, data.fightersByClass);
  const cards = await upsertUpcomingCards(db, data.upcomingCard);
  return { fighters, cards };
}

export async function upsertFighterPool(db: PrismaClient, raw: unknown): Promise<FighterPoolResult> {
  const prepared = prepareFighters(raw);
  const ids = prepared.fighters.map((fighter) => fighter.id);

  for (const fighter of prepared.fighters) {
    const { id, ...data } = fighter;
    await db.fighter.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  // Absent fighters leave the draft pool only when nobody has them rostered.
  // A Tapology URL change inserts a new id; the previous unrostered id goes inactive.
  const deactivated = await db.fighter.updateMany({
    where: {
      active: true,
      id: { notIn: ids },
      rosterSlots: { none: {} },
    },
    data: { active: false },
  });

  const rosteredRetained = await db.fighter.count({
    where: {
      id: { notIn: ids },
      rosterSlots: { some: {} },
    },
  });

  return {
    upserted: prepared.fighters.length,
    deactivated: deactivated.count,
    rosteredRetained,
    classCounts: prepared.classCounts,
    skippedClasses: prepared.skippedClasses,
  };
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
