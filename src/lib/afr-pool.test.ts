import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { describe, it } from "node:test";
import { AfrImportError } from "./afr-results";
import {
  activePoolByClass,
  classKeyForUpcomingWeightClass,
  classKeyForWeightClass,
  foughtFightersFromEvent,
  importAfrCards,
  matchFighterByName,
  slugifyFighterName,
  syncFoughtFighters,
  syncUpcomingCardFighters,
  upcomingFightersFromCard,
  upsertFighterPool,
} from "./afr-pool";
import { CLASS_LABELS, CLASS_TO_SLOT, type ClassKey } from "./slots";

type StoredFighter = {
  id: string;
  name: string;
  active: boolean;
  tapologyUrl: string | null;
  rosterCount: number;
  classKey: string;
  slotKey: string;
  sex?: string;
  weightClass?: string;
  lastFightDate?: Date | null;
  lastFightClass?: string | null;
  activityNotes?: string | null;
  upcomingFightClass?: string | null;
  record?: string | null;
  aliases?: string[];
};

type NewFighter = Omit<StoredFighter, "rosterCount"> & { rosterCount?: number };

function fighter(partial: Partial<StoredFighter> & Pick<StoredFighter, "id" | "name">): StoredFighter {
  return {
    active: true,
    tapologyUrl: null,
    rosterCount: 0,
    classKey: "mens_flyweight",
    slotKey: "MEN_FLYWEIGHT",
    sex: "men",
    weightClass: "Flyweight",
    ...partial,
  };
}

type FighterWhere = {
  id?: string | { in: string[] };
  active?: boolean;
  rosterSlots?: { none?: object; some?: object };
};

function matches(row: StoredFighter, where: FighterWhere | undefined): boolean {
  if (!where) return true;
  for (const key of Object.keys(where)) {
    if (key !== "id" && key !== "active" && key !== "rosterSlots") {
      throw new Error(`unsupported fighter filter ${key}`);
    }
  }
  if (typeof where.id === "string" && row.id !== where.id) return false;
  if (where.id && typeof where.id === "object" && !where.id.in.includes(row.id)) return false;
  if (where.active !== undefined && row.active !== where.active) return false;
  if (where.rosterSlots?.none && row.rosterCount !== 0) return false;
  if (where.rosterSlots?.some && row.rosterCount === 0) return false;
  return true;
}

function project(row: StoredFighter, select?: Record<string, unknown>) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (!enabled) continue;
    if (key === "rosterSlots") {
      out.rosterSlots = row.rosterCount > 0 ? [{ id: `${row.id}-roster` }] : [];
      continue;
    }
    out[key] = row[key as keyof StoredFighter];
  }
  return out;
}

function memoryDb(seed: StoredFighter[] = []) {
  const rows = new Map<string, StoredFighter>(seed.map((row) => [row.id, { ...row }]));
  const fighterApi = {
    async findMany(args?: { where?: FighterWhere; select?: Record<string, unknown> }) {
      return [...rows.values()]
        .filter((row) => matches(row, args?.where))
        .map((row) => project(row, args?.select));
    },
    async count(args?: { where?: FighterWhere }) {
      return [...rows.values()].filter((row) => matches(row, args?.where)).length;
    },
    async create(args: { data: NewFighter }) {
      if (rows.has(args.data.id)) throw new Error(`duplicate fighter ${args.data.id}`);
      const row: StoredFighter = { ...args.data, rosterCount: args.data.rosterCount ?? 0 };
      rows.set(row.id, row);
      return row;
    },
    async update(args: { where: { id: string }; data: Record<string, unknown> }) {
      const row = rows.get(args.where.id);
      if (!row) throw new Error(`missing fighter ${args.where.id}`);
      const rosterCount = row.rosterCount;
      Object.assign(row, args.data);
      row.rosterCount = rosterCount;
      return row;
    },
    async updateMany(args: { where: FighterWhere; data: Record<string, unknown> }) {
      let count = 0;
      for (const row of rows.values()) {
        if (!matches(row, args.where)) continue;
        const rosterCount = row.rosterCount;
        Object.assign(row, args.data);
        row.rosterCount = rosterCount;
        count += 1;
      }
      return { count };
    },
    async upsert(args: { where: { id: string }; update: Record<string, unknown>; create: NewFighter }) {
      const existing = rows.get(args.where.id);
      if (existing) {
        const rosterCount = existing.rosterCount;
        Object.assign(existing, args.update);
        existing.rosterCount = rosterCount;
        return existing;
      }
      const row: StoredFighter = { ...args.create, id: args.where.id, rosterCount: args.create.rosterCount ?? 0 };
      rows.set(row.id, row);
      return row;
    },
  };
  const db = new Proxy(
    { fighter: fighterApi },
    {
      get(target, prop) {
        if (prop === "fighter") return target.fighter;
        throw new Error(`unexpected database access: ${String(prop)}`);
      },
    },
  ) as unknown as PrismaClient;
  return { db, rows };
}

function flyweightDoc(fighters: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    classes: {
      mens_flyweight: {
        fighters: fighters.map((entry) => ({
          sex: "men",
          weight_class: "Flyweight",
          class_key: "mens_flyweight",
          ...entry,
        })),
      },
    },
  };
}

function activeIds(rows: Map<string, StoredFighter>) {
  return [...rows.values()]
    .filter((row) => row.active)
    .map((row) => row.id)
    .sort();
}

describe("weight class mapping", () => {
  it("maps each draft division, including catchweight labels", () => {
    for (const [classKey, label] of Object.entries(CLASS_LABELS) as [ClassKey, string][]) {
      assert.equal(classKeyForWeightClass(label), classKey);
      assert.equal(classKeyForWeightClass(`${label} (catchweight 200 lb)`), classKey);
    }
    assert.equal(classKeyForWeightClass("Lightweight (catchweight 163.5 lb)"), "mens_lightweight");
    assert.equal(classKeyForWeightClass("Women's Strawweight (catchweight 117 lb)"), "womens_strawweight");
    assert.equal(classKeyForWeightClass("Light Heavyweight (catchweight 208.5 lb)"), "mens_light_heavyweight");
    assert.equal(classKeyForWeightClass("Strawweight"), "womens_strawweight");
    assert.equal(classKeyForWeightClass("Women’s Flyweight"), "womens_flyweight");
    assert.equal(classKeyForWeightClass("Catchweight"), null);
    assert.equal(classKeyForWeightClass("Women's Featherweight"), null);
  });
});

describe("cards import pool membership", () => {
  it("keeps fighters who are absent from the file, including rostered ones", async () => {
    const absent = fighter({ id: "absent-vet", name: "Absent Vet" });
    const rostered = fighter({
      id: "rostered-star",
      name: "Rostered Star",
      rosterCount: 1,
      classKey: "mens_bantamweight",
      slotKey: "MEN_BANTAMWEIGHT",
    });
    const odd = fighter({ id: "odd-class", name: "Odd Class", classKey: "atomweight", slotKey: "ATOM" });
    const { db, rows } = memoryDb([absent, rostered, odd]);

    const result = await upsertFighterPool(
      db,
      flyweightDoc([
        {
          name: "New File Fighter",
          tapology_url: "https://www.tapology.com/fightcenter/fighters/new-file-fighter",
        },
      ]),
    );

    assert.equal(result.deactivated, 0);
    assert.equal(result.rosteredRetained, 0);
    assert.deepEqual(result.unmatchedReleases, []);
    assert.equal(rows.get("absent-vet")?.active, true);
    assert.equal(rows.get("rostered-star")?.active, true);
    assert.equal(rows.get("rostered-star")?.rosterCount, 1);
    assert.equal(rows.get("new-file-fighter")?.active, true);
    assert.equal(rows.get("new-file-fighter")?.classKey, "mens_flyweight");
    assert.equal(result.activeByClass.mens_flyweight, 2);
    assert.equal(result.activeByClass.mens_bantamweight, 1);
    assert.equal(result.activeByClass.mens_heavyweight, 0);
    assert.equal(result.activeByClass.atomweight, 1);
    assert.deepEqual(Object.keys(result.activeByClass).slice(0, Object.keys(CLASS_TO_SLOT).length), Object.keys(CLASS_TO_SLOT));
  });

  it("does not write when the export is empty or the release list is malformed", async () => {
    const keeper = fighter({ id: "keeper", name: "Keeper" });
    const { db, rows } = memoryDb([keeper]);

    await assert.rejects(() => upsertFighterPool(db, { classes: {} }), AfrImportError);
    await assert.rejects(
      () => upsertFighterPool(db, flyweightDoc([{ name: "Someone" }]), { released: "Someone" }),
      AfrImportError,
    );

    assert.equal(rows.size, 1);
    assert.equal(rows.get("keeper")?.active, true);
  });

  it("deactivates only unrostered fighters named by a release signal", async () => {
    const cut = fighter({
      id: "cut-guy",
      name: "Cut Guy",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/cut-guy",
    });
    const kept = fighter({
      id: "kept-star",
      name: "Kept Star",
      rosterCount: 1,
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/kept-star",
      classKey: "mens_welterweight",
      slotKey: "MEN_WELTERWEIGHT",
    });
    const still = fighter({ id: "still-here", name: "Still Here" });
    const listed = fighter({
      id: "listed-star",
      name: "Listed Star",
      rosterCount: 1,
      classKey: "mens_lightweight",
      slotKey: "MEN_LIGHTWEIGHT",
    });
    const { db, rows } = memoryDb([cut, kept, still, listed]);

    const result = await importAfrCards(db, {
      fightersByClass: flyweightDoc([
        { name: "Still Here", record: "10-1" },
        { name: "Listed Star", status: "released", record: "12-3" },
        { name: "Status Cut", status: "released", record: "1-2" },
      ]),
      upcomingCard: {},
      cut: [
        "Kept Star",
        "https://www.Tapology.com/fightcenter/fighters/cut-guy/",
        "http://ufcstats.com/fighter-details/does-not-match",
      ],
    });

    assert.equal(result.cards.unchanged, true);
    assert.equal(result.fighters.deactivated, 2);
    assert.equal(result.fighters.rosteredRetained, 2);
    assert.deepEqual(result.fighters.unmatchedReleases, ["http://ufcstats.com/fighter-details/does-not-match"]);
    assert.equal(rows.get("cut-guy")?.active, false);
    assert.equal(rows.get("kept-star")?.active, true);
    assert.equal(rows.get("kept-star")?.rosterCount, 1);
    assert.equal(rows.get("listed-star")?.active, true);
    assert.equal(rows.get("listed-star")?.rosterCount, 1);
    assert.equal(rows.get("listed-star")?.record, "12-3");
    assert.equal(rows.get("still-here")?.active, true);
    assert.equal(rows.get("still-here")?.record, "10-1");
    const statusCut = [...rows.values()].find((row) => row.name === "Status Cut");
    assert.ok(statusCut);
    assert.equal(statusCut.active, false);
    assert.equal(statusCut.record, "1-2");
    assert.equal(result.fighters.activeByClass.mens_flyweight, 2);
    assert.equal(result.fighters.activeByClass.mens_welterweight, 1);

    const again = await upsertFighterPool(db, flyweightDoc([{ name: "Still Here" }]), {
      released: ["Cut Guy", "Kept Star", "Status Cut"],
    });
    assert.equal(again.deactivated, 0);
    assert.equal(again.rosteredRetained, 1);
    assert.equal(rows.get("cut-guy")?.active, false);
    assert.equal(rows.get("kept-star")?.active, true);
    assert.equal(rows.get("listed-star")?.active, true);
    assert.deepEqual(activeIds(rows), ["kept-star", "listed-star", "still-here"]);
  });

  it("reactivates a fighter the file includes without a release signal", async () => {
    const { db, rows } = memoryDb([
      fighter({ id: "comeback", name: "Comeback Kid", active: false }),
    ]);
    const result = await upsertFighterPool(
      db,
      flyweightDoc([{ name: "Comeback Kid", tapology_url: "https://www.tapology.com/fightcenter/fighters/comeback" }], {
        released: ["Somebody Else"],
      }),
    );
    assert.equal(rows.get("comeback")?.active, true);
    assert.equal(rows.get("comeback")?.tapologyUrl, "https://www.tapology.com/fightcenter/fighters/comeback");
    assert.deepEqual(result.unmatchedReleases, ["Somebody Else"]);
    assert.equal(result.deactivated, 0);
  });

  it("lets an explicit release win over inclusion in the same payload", async () => {
    const { db, rows } = memoryDb([fighter({ id: "both", name: "Both Signals" })]);
    const first = await upsertFighterPool(
      db,
      flyweightDoc([{ name: "Both Signals", status: "CUT" }], { cut: ["Both Signals"] }),
    );
    assert.equal(rows.get("both")?.active, false);
    assert.equal(first.deactivated, 1);
    const second = await upsertFighterPool(
      db,
      flyweightDoc([{ name: "Both Signals", status: "released" }]),
    );
    assert.equal(rows.get("both")?.active, false);
    assert.equal(second.deactivated, 0);
  });

  it("adopts a results placeholder instead of inserting a second row", async () => {
    const placeholder = fighter({
      id: "mens_flyweight-jane-doe",
      name: "Jane Doe",
      tapologyUrl: null,
      classKey: "mens_lightweight",
      slotKey: "MEN_LIGHTWEIGHT",
    });
    const other = fighter({
      id: "111-alex-smith",
      name: "Alex Smith",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/111-alex-smith",
    });
    const { db, rows } = memoryDb([placeholder, other]);

    await upsertFighterPool(
      db,
      flyweightDoc([
        {
          name: "Jáne Doe",
          tapology_url: "https://www.tapology.com/fightcenter/fighters/999-jane-doe",
        },
        {
          name: "Alex Smith",
          tapology_url: "https://www.tapology.com/fightcenter/fighters/222-other-alex",
        },
      ]),
    );

    assert.equal(rows.size, 3);
    assert.equal(rows.has("999-jane-doe"), false);
    const jane = rows.get("mens_flyweight-jane-doe");
    assert.equal(jane?.name, "Jáne Doe");
    assert.equal(jane?.tapologyUrl, "https://www.tapology.com/fightcenter/fighters/999-jane-doe");
    assert.equal(jane?.classKey, "mens_flyweight");
    assert.equal(jane?.active, true);
    assert.equal(rows.get("111-alex-smith")?.tapologyUrl?.endsWith("111-alex-smith"), true);
    assert.equal(rows.get("222-other-alex")?.name, "Alex Smith");
    assert.equal(rows.get("222-other-alex")?.active, true);
  });
});

describe("results import pool membership", () => {
  it("adds a debut in the bout division and reactivates an inactive fighter", async () => {
    const inactive = fighter({
      id: "inactive-vet",
      name: "Inactive Vet",
      active: false,
      classKey: "mens_flyweight",
      slotKey: "MEN_FLYWEIGHT",
      lastFightDate: new Date("2020-01-01T00:00:00.000Z"),
    });
    const active = fighter({
      id: "active-vet",
      name: "José Aldo",
      classKey: "mens_featherweight",
      slotKey: "MEN_FEATHERWEIGHT",
      lastFightDate: new Date("2024-01-01T00:00:00.000Z"),
    });
    const rosteredInactive = fighter({
      id: "rostered-inactive",
      name: "Rostered Inactive",
      active: false,
      rosterCount: 1,
      classKey: "mens_bantamweight",
      slotKey: "MEN_BANTAMWEIGHT",
    });
    const { db, rows } = memoryDb([inactive, active, rosteredInactive]);
    const foughtAt = new Date("2026-11-08T12:00:00.000Z");

    const appearances = foughtFightersFromEvent({
      date: foughtAt,
      fights: [
        {
          fighter1Name: "Jane Doe",
          fighter2Name: "Inactive Vet",
          weightClass: "Women's Strawweight (catchweight 117 lb)",
          stats: [
            {
              fighterName: "Jane Doe",
              tapologyUrl: "https://www.tapology.com/fightcenter/fighters/999-jane-doe",
            },
            { fighterName: "Inactive Vet" },
          ],
        },
        {
          fighter1Name: "Jane Doe",
          fighter2Name: "Inactive Vet",
          weightClass: "Bantamweight",
          stats: [{ fighterName: "Jane Doe" }, { fighterName: "Inactive Vet" }],
        },
        {
          fighter1Name: "Jose Aldo",
          fighter2Name: "Rostered Inactive",
          weightClass: "Welterweight",
          stats: [],
        },
        {
          fighter1Name: "Mystery",
          fighter2Name: "José Aldo",
          weightClass: "Catchweight",
          stats: [{ fighterName: "Mystery" }],
        },
        {
          fighter1Name: "No Class",
          fighter2Name: "José Aldo",
          weightClass: null,
          stats: [{ fighterName: "No Class" }],
        },
      ],
    });

    const first = await syncFoughtFighters(db, appearances);
    assert.deepEqual(first.added, ["Jane Doe"]);
    assert.deepEqual(first.reactivated, ["Inactive Vet", "Rostered Inactive"]);
    assert.deepEqual(first.unclassified, ["Mystery"]);
    assert.equal([...rows.values()].some((row) => row.name === "No Class"), false);

    const jane = rows.get("999-jane-doe");
    assert.ok(jane);
    assert.equal(jane.active, true);
    assert.equal(jane.classKey, "womens_strawweight");
    assert.equal(jane.slotKey, "WOMEN_STRAWWEIGHT");
    assert.equal(jane.sex, "women");
    assert.equal(jane.weightClass, "Women's Strawweight");
    assert.equal(jane.activityNotes, "Added from fight results.");
    assert.equal(jane.lastFightDate?.toISOString(), foughtAt.toISOString());
    assert.equal(jane.rosterCount, 0);

    const vet = rows.get("inactive-vet");
    assert.equal(vet?.active, true);
    assert.equal(vet?.classKey, "womens_strawweight");
    assert.equal(vet?.slotKey, "WOMEN_STRAWWEIGHT");
    assert.equal(vet?.lastFightDate?.toISOString(), foughtAt.toISOString());

    assert.equal(rows.get("active-vet")?.classKey, "mens_featherweight");
    assert.equal(rows.get("active-vet")?.lastFightDate?.toISOString(), "2024-01-01T00:00:00.000Z");
    assert.equal(rows.size, 4);

    assert.equal(rows.get("rostered-inactive")?.active, true);
    assert.equal(rows.get("rostered-inactive")?.classKey, "mens_bantamweight");
    assert.equal(rows.get("rostered-inactive")?.rosterCount, 1);

    const second = await syncFoughtFighters(db, appearances);
    assert.deepEqual(second, { added: [], reactivated: [], unclassified: ["Mystery"] });
    assert.equal(rows.size, 4);

    const counts = await activePoolByClass(db);
    assert.equal(counts.womens_strawweight, 2);
    assert.equal(counts.mens_featherweight, 1);
    assert.equal(counts.mens_bantamweight, 1);
    assert.equal(counts.mens_heavyweight, 0);
  });

  it("adopts the results row when the cards file later names that fighter", async () => {
    const { db, rows } = memoryDb();
    await syncFoughtFighters(db, [
      {
        name: "Debut Ace",
        weightClass: "Heavyweight",
        foughtAt: new Date("2026-12-01T12:00:00.000Z"),
      },
    ]);
    assert.equal(rows.size, 1);
    const created = [...rows.values()][0];
    assert.equal(created.id, "mens_heavyweight-debut-ace");
    assert.equal(created.tapologyUrl, null);

    await upsertFighterPool(
      db,
      {
        classes: {
          mens_heavyweight: {
            fighters: [
              {
                name: "Debut Ace",
                sex: "men",
                weight_class: "Heavyweight",
                class_key: "mens_heavyweight",
                tapology_url: "https://www.tapology.com/fightcenter/fighters/555-debut-ace",
                record: "1-0",
              },
            ],
          },
        },
      },
    );

    assert.equal(rows.size, 1);
    assert.equal(rows.get("mens_heavyweight-debut-ace")?.tapologyUrl?.endsWith("/555-debut-ace"), true);
    assert.equal(rows.get("mens_heavyweight-debut-ace")?.record, "1-0");
    assert.equal(rows.get("mens_heavyweight-debut-ace")?.active, true);
    assert.equal(rows.has("555-debut-ace"), false);
  });
});

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), "test", "fixtures", name), "utf8")) as unknown;
}

describe("removal reasons", () => {
  it("accepts retired, inactive, left_ufc, and the wider status spellings", async () => {
    const retired = fighter({ id: "retired-vet", name: "Retired Vet" });
    const left = fighter({ id: "left-vet", name: "Left Vet" });
    const rostered = fighter({
      id: "rostered-retiree",
      name: "Rostered Retiree",
      rosterCount: 1,
      classKey: "mens_welterweight",
      slotKey: "MEN_WELTERWEIGHT",
    });
    const { db, rows } = memoryDb([retired, left, rostered]);

    const result = await upsertFighterPool(
      db,
      flyweightDoc(
        [
          { name: "Status Retired", status: "RETIRED" },
          { name: "Status Retirement", status: "Retirement" },
          { name: "Status Release", status: "release" },
          { name: "Status Inactive", status: "inactive" },
          { name: "Status Left", status: "left_ufc" },
        ],
        { inactive: ["Left Vet"], left_ufc: ["Rostered Retiree"] },
      ),
      { retired: ["Retired Vet"] },
    );

    assert.equal(rows.get("retired-vet")?.active, false);
    assert.equal(rows.get("left-vet")?.active, false);
    assert.equal(rows.get("rostered-retiree")?.active, true);
    assert.equal(rows.get("rostered-retiree")?.rosterCount, 1);
    for (const name of ["Status Retired", "Status Retirement", "Status Release", "Status Inactive", "Status Left"]) {
      const row = [...rows.values()].find((item) => item.name === name);
      assert.ok(row, name);
      assert.equal(row.active, false);
    }
    assert.equal(result.rosteredRetained, 1);
    assert.ok(result.deactivated >= 6);
  });

  it("matches removal objects by tapology url first, then name", async () => {
    const julian = fighter({
      id: "julian-erosa",
      name: "Julian Erosa",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/julian-erosa",
    });
    const farid = fighter({ id: "farid-basharat", name: "Farid Basharat", tapologyUrl: null });
    const decoy = fighter({
      id: "decoy",
      name: "Wrong Name",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/real-slug",
    });
    const fallback = fighter({ id: "fallback-name", name: "Fallback Name" });
    const { db, rows } = memoryDb([julian, farid, decoy, fallback]);
    const log = loadFixture("afr-released-log.json") as { name: string; tapology_url: string | null }[];

    const result = await upsertFighterPool(db, flyweightDoc([{ name: "Keeper" }]), {
      released: [
        ...log,
        {
          name: "Wrong Name",
          tapology_url: "https://www.tapology.com/fightcenter/fighters/real-slug",
          type: "release",
          date: "2026-11-01",
          source: "url wins",
        },
        { name: "Nobody Home", tapology_url: null, type: "release" },
        {
          name: "Fallback Name",
          tapology_url: "https://www.tapology.com/fightcenter/fighters/missing-slug",
          type: "retirement",
        },
      ],
    });

    assert.equal(rows.get("julian-erosa")?.active, false);
    assert.equal(rows.get("farid-basharat")?.active, false);
    assert.equal(rows.get("decoy")?.active, false);
    assert.equal(rows.get("decoy")?.name, "Wrong Name");
    assert.equal(rows.get("fallback-name")?.active, false);
    assert.deepEqual(result.unmatchedReleases, ["Nobody Home"]);
  });

  it("does not let an object url remove a different fighter who only shares the name", async () => {
    const slug = fighter({
      id: "julian-erosa",
      name: "Julian Erosa",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/julian-erosa",
    });
    const sameName = fighter({
      id: "other-julian",
      name: "Julian Erosa",
      classKey: "mens_bantamweight",
      slotKey: "MEN_BANTAMWEIGHT",
    });
    const { db, rows } = memoryDb([slug, sameName]);
    await upsertFighterPool(db, flyweightDoc([{ name: "Keeper" }]), {
      retired: [
        {
          name: "Julian Erosa",
          tapology_url: "https://www.tapology.com/fightcenter/fighters/julian-erosa",
        },
      ],
    });
    assert.equal(rows.get("julian-erosa")?.active, false);
    assert.equal(rows.get("other-julian")?.active, true);
  });

  it("accepts the string released.json sample", async () => {
    const julian = fighter({
      id: "julian-erosa",
      name: "Julian Erosa",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/julian-erosa",
    });
    const farid = fighter({ id: "farid", name: "Farid Basharat" });
    const { db, rows } = memoryDb([julian, farid]);
    const result = await upsertFighterPool(db, flyweightDoc([{ name: "Keeper" }]), {
      released: loadFixture("afr-released.json"),
    });
    assert.equal(rows.get("julian-erosa")?.active, false);
    assert.equal(rows.get("farid")?.active, false);
    assert.deepEqual(result.unmatchedReleases, []);
  });
});

describe("upcoming card pool additions", () => {
  it("maps title suffixes and skips catchweight", () => {
    assert.equal(classKeyForUpcomingWeightClass("Heavyweight (title)"), "mens_heavyweight");
    assert.equal(classKeyForUpcomingWeightClass("Women's Bantamweight (title)"), "womens_bantamweight");
    assert.equal(classKeyForUpcomingWeightClass("Welterweight (interim title)"), "mens_welterweight");
    assert.equal(classKeyForUpcomingWeightClass("Lightweight (BMF title)"), "mens_lightweight");
    assert.equal(classKeyForUpcomingWeightClass("Flyweight (title)"), "mens_flyweight");
    assert.equal(classKeyForWeightClass("Lightweight (catchweight 163.5 lb)"), "mens_lightweight");
    assert.equal(classKeyForUpcomingWeightClass("Lightweight (catchweight 163.5 lb)"), null);
    assert.equal(classKeyForUpcomingWeightClass("Catchweight"), null);

    const card = loadFixture("afr-upcoming-card.json");
    const booked = upcomingFightersFromCard(card);
    const gane = booked.find((fighter) => fighter.name === "Ciryl Gane");
    const harrison = booked.find((fighter) => fighter.name === "Kayla Harrison");
    const prochazka = booked.find((fighter) => fighter.name === "Jiří Procházka");
    const bmf = booked.find((fighter) => fighter.name === "Max Holloway" || fighter.weightClass?.includes("BMF"));
    assert.equal(gane?.weightClass, "Heavyweight (title)");
    assert.equal(harrison?.weightClass, "Women's Bantamweight (title)");
    assert.ok(prochazka, "next_events bout is included");
    assert.ok(booked.some((fighter) => fighter.weightClass === "Lightweight (BMF title)"));
    assert.ok(booked.some((fighter) => fighter.weightClass === "Welterweight (interim title)"));
    assert.ok(bmf);
  });

  it("adds debuts, reactivates returning fighters, and moves an unrostered active fighter", async () => {
    const mover = fighter({
      id: "class-mover",
      name: "Class Mover",
      classKey: "mens_flyweight",
      slotKey: "MEN_FLYWEIGHT",
    });
    const rostered = fighter({
      id: "rostered-champ",
      name: "Rostered Champ",
      rosterCount: 1,
      classKey: "mens_flyweight",
      slotKey: "MEN_FLYWEIGHT",
    });
    const returning = fighter({
      id: "returning-vet",
      name: "Returning Vet",
      active: false,
      classKey: "mens_bantamweight",
      slotKey: "MEN_BANTAMWEIGHT",
    });
    const removed = fighter({
      id: "removed-vet",
      name: "Removed Vet",
      active: false,
    });
    const same = fighter({
      id: "same-class",
      name: "Same Class",
      classKey: "mens_heavyweight",
      slotKey: "MEN_HEAVYWEIGHT",
      activityNotes: "stay",
    });
    const { db, rows } = memoryDb([mover, rostered, returning, removed, same]);

    const result = await importAfrCards(db, {
      fightersByClass: flyweightDoc([{ name: "Keeper" }]),
      upcomingCard: {
        bouts: [
          {
            fighter_a: "Ciryl Gane",
            fighter_b: "Class Mover",
            weight_class: "Heavyweight (title)",
            fighter_a_tapology_url: "https://www.tapology.com/fightcenter/fighters/ciryl-gane",
          },
          { fighter_a: "Catchweight Kid", fighter_b: "Unknown Kid", weight_class: "Catchweight" },
          { fighter_a: "Rostered Champ", fighter_b: "Returning Vet", weight_class: "Women's Strawweight" },
          { fighter_a: "Same Class", fighter_b: "Ciryl Gane", weight_class: "Heavyweight (title)" },
        ],
        next_events: [
          {
            bouts: [
              { fighter_a: "Class Mover", fighter_b: "Next Event Only", weight_class: "Flyweight" },
              { fighter_a: "Removed Vet", fighter_b: "Late Debut", weight_class: "Lightweight (interim title)" },
            ],
          },
        ],
      },
      retired: ["Removed Vet"],
    });

    assert.deepEqual(result.addedFromCards, ["Ciryl Gane", "Next Event Only", "Late Debut"]);
    assert.deepEqual(result.reactivatedFromCards, ["Returning Vet"]);
    assert.deepEqual(result.unclassifiedFromCards, ["Catchweight Kid", "Unknown Kid"]);
    const gane = rows.get("ciryl-gane");
    assert.equal(gane?.active, true);
    assert.equal(gane?.classKey, "mens_heavyweight");
    assert.equal(gane?.slotKey, "MEN_HEAVYWEIGHT");
    assert.equal(gane?.activityNotes, "Added from an upcoming card.");
    assert.equal(rows.get("class-mover")?.classKey, "mens_heavyweight");
    assert.equal(rows.get("class-mover")?.slotKey, "MEN_HEAVYWEIGHT");
    assert.equal(rows.get("rostered-champ")?.classKey, "mens_flyweight");
    assert.equal(rows.get("rostered-champ")?.rosterCount, 1);
    assert.equal(rows.get("returning-vet")?.active, true);
    assert.equal(rows.get("returning-vet")?.classKey, "womens_strawweight");
    assert.equal(rows.get("returning-vet")?.slotKey, "WOMEN_STRAWWEIGHT");
    assert.equal(rows.get("removed-vet")?.active, false);
    assert.equal([...rows.values()].some((row) => row.name === "Catchweight Kid"), false);
    assert.equal(rows.get("mens_lightweight-late-debut")?.classKey, "mens_lightweight");
    assert.equal(rows.get("same-class")?.classKey, "mens_heavyweight");
    assert.equal(rows.get("same-class")?.activityNotes, "stay");
    assert.equal(rows.get("same-class")?.upcomingFightClass, undefined);
    assert.equal(result.fighters.activeByClass.mens_heavyweight, 3);
    assert.equal(result.fighters.rosteredRetained, 0);
  });

  it("transliterates ł đ ø æ ß in slug ids", () => {
    assert.equal(slugifyFighterName("Jan Błachowicz"), "jan-blachowicz");
    assert.equal(slugifyFighterName("Đặng"), "dang");
    assert.equal(slugifyFighterName("Søren"), "soren");
    assert.equal(slugifyFighterName("Ægir"), "aegir");
    assert.equal(slugifyFighterName("Straße"), "strasse");
  });

  it("adopts a slug-only row when the file has the numeric Tapology URL", async () => {
    const slug = fighter({
      id: "aaron-pico",
      name: "Aaron Pico",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/aaron-pico",
      classKey: "mens_featherweight",
      slotKey: "MEN_FEATHERWEIGHT",
    });
    const { db, rows } = memoryDb([slug]);
    await upsertFighterPool(db, {
      classes: {
        mens_featherweight: {
          fighters: [
            {
              name: "Aaron Pico",
              sex: "men",
              weight_class: "Featherweight",
              tapology_url: "https://www.tapology.com/fightcenter/fighters/86018-aaron-pico",
            },
          ],
        },
      },
    });
    assert.equal(rows.size, 1);
    assert.equal(rows.get("aaron-pico")?.tapologyUrl, "https://www.tapology.com/fightcenter/fighters/86018-aaron-pico");
    assert.equal(rows.has("86018-aaron-pico"), false);
  });

  it("collapses reversed names and accent duplicates onto one row", async () => {
    const lee = fighter({
      id: "lee-jeong-yeong",
      name: "Lee Jeong-yeong",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/lee-jeong-yeong",
      classKey: "mens_featherweight",
      slotKey: "MEN_FEATHERWEIGHT",
    });
    const { db, rows } = memoryDb([lee]);
    await upsertFighterPool(db, {
      classes: {
        mens_featherweight: {
          fighters: [
            { name: "Jeong Yeong Lee", sex: "men", weight_class: "Featherweight" },
            {
              name: "Juan Diaz",
              sex: "men",
              weight_class: "Featherweight",
            },
            {
              name: "Juan Díaz",
              sex: "men",
              weight_class: "Featherweight",
              tapology_url: "https://www.tapology.com/fightcenter/fighters/juan-diaz",
            },
          ],
        },
      },
    });
    assert.equal(rows.size, 2);
    assert.equal(rows.has("lee-jeong-yeong"), true);
    const juan = [...rows.values()].filter((row) => /juan/i.test(row.name));
    assert.equal(juan.length, 1);
    assert.equal(juan[0]?.tapologyUrl, "https://www.tapology.com/fightcenter/fighters/juan-diaz");
  });

  it("matches an alias and prefers the rostered copy", () => {
    const chosen = matchFighterByName(
      [
        { id: "old", name: "Osman Diaz", active: false, tapologyUrl: null, aliases: ["Ozzy Diaz"] },
        { id: "live", name: "Osman Diaz", active: true, rostered: true, tapologyUrl: "https://www.tapology.com/fightcenter/fighters/61676-ozzy-diaz", aliases: ["Ozzy Diaz"] },
      ],
      "Ozzy Diaz",
    );
    assert.equal(chosen?.id, "live");
  });

  it("does not reactivate an inactive copy when a live copy already matches", async () => {
    const inactive = fighter({
      id: "samuel-sanches",
      name: "Samuel Sanches",
      active: false,
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/samuel-sanches",
      classKey: "mens_bantamweight",
      slotKey: "MEN_BANTAMWEIGHT",
    });
    const live = fighter({
      id: "12345-samuel-sanches",
      name: "Samuel Sanches",
      active: true,
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/12345-samuel-sanches",
      classKey: "mens_bantamweight",
      slotKey: "MEN_BANTAMWEIGHT",
    });
    const { db, rows } = memoryDb([inactive, live]);
    const result = await syncUpcomingCardFighters(db, {
      bouts: [
        {
          fighter_a: "Samuel Sanches",
          fighter_a_tapology_url: "https://www.tapology.com/fightcenter/fighters/samuel-sanches",
          fighter_b: "Keeper",
          weight_class: "Bantamweight",
        },
      ],
    });
    assert.equal(result.reactivated.includes("Samuel Sanches"), false);
    assert.equal(rows.get("samuel-sanches")?.active, false);
    assert.equal(rows.get("12345-samuel-sanches")?.active, true);
  });
});
