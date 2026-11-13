import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POOL_CLASS_KEYS, buildFighterPool, filterPoolRows, poolCounts, type PoolFighterInput } from "./fighter-pool";

const today = "2026-11-10";

function fighter(partial: Partial<PoolFighterInput> & Pick<PoolFighterInput, "id" | "name">): PoolFighterInput {
  return {
    classKey: "mens_lightweight",
    weightClass: "Lightweight",
    record: "10-1",
    lastFightDate: new Date("2026-10-17T12:00:00.000Z"),
    lastFightClass: "mens_lightweight",
    nextBoutJson: null,
    tapologyUrl: null,
    active: true,
    activityNotes: null,
    draftedBy: null,
    ...partial,
  };
}

describe("fighter pool rows", () => {
  it("lists every active fighter and hides inactive fighters from members", () => {
    const built = buildFighterPool({
      today,
      cards: [],
      includeInactive: false,
      fighters: [
        fighter({ id: "active", name: "Active Ace" }),
        fighter({ id: "odd", name: "Odd Class", classKey: "atomweight", active: true }),
        fighter({ id: "gone", name: "Cut Guy", active: false, activityNotes: "Released 2026-10-17" }),
      ],
    });
    assert.deepEqual(
      built.active.map((row) => row.id),
      ["active", "odd"],
    );
    assert.equal(built.inactive.length, 0);
    const counts = poolCounts(built.active);
    assert.equal(counts.total, 2);
    assert.equal(counts.byClass.mens_lightweight, 1);
    assert.equal(counts.other, 1);
    assert.equal(POOL_CLASS_KEYS.length, 11);
  });

  it("shows inactive fighters and a stored note only for the commissioner", () => {
    const built = buildFighterPool({
      today,
      cards: [],
      includeInactive: true,
      fighters: [
        fighter({ id: "gone", name: "Cut Guy", active: false, activityNotes: "  Retired in the cage  " }),
        fighter({ id: "quiet", name: "Quiet Cut", active: false, activityNotes: "   " }),
      ],
    });
    assert.equal(built.active.length, 0);
    assert.equal(built.inactive[0]?.removalNote, "Retired in the cage");
    assert.equal(built.inactive[1]?.removalNote, null);
  });

  it("marks who drafted a fighter and can hide drafted rows", () => {
    const built = buildFighterPool({
      today,
      cards: [],
      includeInactive: false,
      fighters: [
        fighter({ id: "open", name: "Open Fighter" }),
        fighter({ id: "taken", name: "Taken Fighter", draftedBy: "The Pit" }),
      ],
    });
    const available = filterPoolRows(built.active, {
      query: "",
      classKey: "all",
      availableOnly: true,
      sort: "name",
      direction: "asc",
    });
    assert.deepEqual(available.map((row) => row.name), ["Open Fighter"]);
    assert.equal(built.active.find((row) => row.id === "taken")?.draftedBy, "The Pit");
  });

  it("searches names without accents and sorts by name or last fight", () => {
    const built = buildFighterPool({
      today,
      cards: [],
      includeInactive: false,
      fighters: [
        fighter({ id: "z", name: "Zed", lastFightDate: new Date("2026-09-01T12:00:00.000Z") }),
        fighter({ id: "j", name: "José Aldo", lastFightDate: null }),
        fighter({ id: "a", name: "Amy", lastFightDate: new Date("2026-11-01T12:00:00.000Z") }),
      ],
    });
    const searched = filterPoolRows(built.active, {
      query: "jose",
      classKey: "all",
      availableOnly: false,
      sort: "name",
      direction: "asc",
    });
    assert.deepEqual(searched.map((row) => row.name), ["José Aldo"]);
    const aliased = buildFighterPool({
      today,
      cards: [],
      includeInactive: false,
      fighters: [
        fighter({ id: "osman-diaz", name: "Osman 'Ozzy' Diaz", aliases: ["Ozzy Diaz", "Osman Diaz"] }),
        fighter({ id: "jan", name: "Jan Błachowicz" }),
      ],
    });
    const byAlias = filterPoolRows(aliased.active, {
      query: "ozzy diaz",
      classKey: "all",
      availableOnly: false,
      sort: "name",
      direction: "asc",
    });
    assert.deepEqual(byAlias.map((row) => row.id), ["osman-diaz"]);
    const byStem = filterPoolRows(aliased.active, {
      query: "blachowicz",
      classKey: "all",
      availableOnly: false,
      sort: "name",
      direction: "asc",
    });
    assert.deepEqual(byStem.map((row) => row.id), ["jan"]);

    const byDate = filterPoolRows(built.active, {
      query: "",
      classKey: "all",
      availableOnly: false,
      sort: "lastFight",
      direction: "desc",
    });
    assert.deepEqual(byDate.map((row) => row.name), ["Amy", "Zed", "José Aldo"]);
    const byNameDesc = filterPoolRows(built.active, {
      query: "",
      classKey: "mens_lightweight",
      availableOnly: false,
      sort: "name",
      direction: "desc",
    });
    assert.deepEqual(byNameDesc.map((row) => row.name), ["Zed", "José Aldo", "Amy"]);
  });

  it("prefers the soonest future bout from the card or nextBoutJson", () => {
    const built = buildFighterPool({
      today,
      includeInactive: false,
      cards: [
        {
          name: "UFC 336",
          date: "2027-01-30",
          boutsJson: JSON.stringify([{ fighter_a: "Ciryl Gane", fighter_b: "Josh Hokit", weight_class: "Heavyweight" }]),
        },
        {
          name: "UFC 334",
          date: "2026-11-14",
          boutsJson: JSON.stringify([{ fighter_a: "Ciryl Gane", fighter_b: "Tom Aspinall", weight_class: "Heavyweight" }]),
        },
      ],
      fighters: [
        fighter({
          id: "gane",
          name: "Ciryl Gane",
          classKey: "mens_heavyweight",
          nextBoutJson: JSON.stringify({ opponent: "Someone Later", event: "UFC 340", date: "2027-03-01" }),
        }),
        fighter({
          id: "aldo",
          name: "José Aldo",
          nextBoutJson: JSON.stringify({ opponent: "Mario Bautista", event: "UFC Fight Night", date: "" }),
        }),
        fighter({
          id: "bad-link",
          name: "Bad Link",
          tapologyUrl: "javascript:alert(1)",
        }),
      ],
    });
    assert.equal(built.active.find((row) => row.id === "gane")?.upcoming, "vs Tom Aspinall · UFC 334 · 2026-11-14");
    assert.equal(built.active.find((row) => row.id === "aldo")?.upcoming, "vs Mario Bautista · UFC Fight Night");
    assert.equal(built.active.find((row) => row.id === "bad-link")?.tapologyUrl, null);
  });
});
