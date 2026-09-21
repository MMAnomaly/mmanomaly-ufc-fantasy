import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseAutoPick,
  commitEvaluatedPick,
  prepareAutoPick,
  type DraftSnapshot,
  type PickFighter,
} from "./autodraft";
import { DEFAULT_PICK_CLOCK, snakeDraftPosition } from "./draft";

function rank(value: number | "C" | null) {
  return JSON.stringify({ division: "Test", rank: value });
}

function fighter(partial: Partial<PickFighter> & Pick<PickFighter, "id" | "name" | "slotKey">): PickFighter {
  return {
    active: true,
    rankingJson: null,
    lastFightDate: null,
    ...partial,
  };
}

function snapshot(partial: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    status: "DRAFTING",
    currentPickIndex: 0,
    pickDeadline: new Date("2026-09-21T20:02:00.000Z"),
    pickClockSeconds: DEFAULT_PICK_CLOCK,
    teamCount: 2,
    onTheClockMembershipId: "team-a",
    onTheClockDraftPosition: 1,
    filledSlots: [],
    takenFighterIds: [],
    ...partial,
  };
}

const pool = [
  fighter({
    id: "hw-champ",
    name: "Heavy Champ",
    slotKey: "MEN_HEAVYWEIGHT",
    rankingJson: rank("C"),
    lastFightDate: new Date("2026-01-01T00:00:00.000Z"),
  }),
  fighter({
    id: "fly-champ",
    name: "Fly Champ",
    slotKey: "MEN_FLYWEIGHT",
    rankingJson: rank("C"),
    lastFightDate: new Date("2026-08-01T00:00:00.000Z"),
  }),
  fighter({
    id: "fly-two",
    name: "Fly Two",
    slotKey: "MEN_FLYWEIGHT",
    rankingJson: rank(2),
    lastFightDate: new Date("2026-09-01T00:00:00.000Z"),
  }),
  fighter({
    id: "fly-unranked",
    name: "Ada Unranked",
    slotKey: "MEN_FLYWEIGHT",
    rankingJson: rank(null),
    lastFightDate: new Date("2026-09-19T00:00:00.000Z"),
  }),
  fighter({
    id: "fly-inactive",
    name: "Inactive Champ",
    slotKey: "MEN_FLYWEIGHT",
    active: false,
    rankingJson: rank("C"),
    lastFightDate: new Date("2026-09-20T00:00:00.000Z"),
  }),
];

describe("best available ranking", () => {
  it("picks the champion over a higher number, then an unranked fighter", () => {
    const choice = chooseAutoPick({
      fighters: pool,
      takenIds: [],
      openSlots: ["FLEX_1"],
    });
    assert.deepEqual(choice, { fighterId: "fly-champ", slot: "FLEX_1" });
  });

  it("breaks a rank tie alphabetically when neither fighter has a fight date", () => {
    const choice = chooseAutoPick({
      fighters: [
        fighter({ id: "z", name: "Zed Champ", slotKey: "MEN_HEAVYWEIGHT", rankingJson: rank("C") }),
        fighter({ id: "a", name: "Amy Champ", slotKey: "MEN_FLYWEIGHT", rankingJson: rank("C") }),
      ],
      takenIds: [],
      openSlots: ["FLEX_1"],
    });
    assert.equal(choice?.fighterId, "a");
  });

  it("uses a more recent fight, then name, when ranks tie", () => {
    const tied = [
      fighter({
        id: "b",
        name: "Bravo",
        slotKey: "MEN_FLYWEIGHT",
        rankingJson: rank(4),
        lastFightDate: new Date("2026-05-01T00:00:00.000Z"),
      }),
      fighter({
        id: "a",
        name: "Alpha",
        slotKey: "MEN_BANTAMWEIGHT",
        rankingJson: rank(4),
        lastFightDate: new Date("2026-05-01T00:00:00.000Z"),
      }),
      fighter({
        id: "c",
        name: "Charlie",
        slotKey: "MEN_FEATHERWEIGHT",
        rankingJson: rank(4),
        lastFightDate: new Date("2026-06-01T00:00:00.000Z"),
      }),
    ];
    const byDate = chooseAutoPick({ fighters: tied, takenIds: [], openSlots: ["FLEX_1"] });
    assert.equal(byDate?.fighterId, "c");
    const byName = chooseAutoPick({
      fighters: tied.filter((f) => f.id !== "c"),
      takenIds: [],
      openSlots: ["FLEX_1"],
    });
    assert.equal(byName?.fighterId, "a");
  });
});

describe("autopick eligibility", () => {
  it("fills the dedicated slot instead of flex when the best fighter matches it", () => {
    const choice = chooseAutoPick({
      fighters: pool,
      takenIds: [],
      openSlots: ["MEN_FLYWEIGHT", "FLEX_1", "FLEX_2"],
    });
    assert.deepEqual(choice, { fighterId: "fly-champ", slot: "MEN_FLYWEIGHT" });
  });

  it("uses flex when the best remaining fighter does not match an open weight class", () => {
    const choice = chooseAutoPick({
      fighters: pool,
      takenIds: ["fly-champ"],
      openSlots: ["MEN_FLYWEIGHT", "FLEX_1"],
    });
    assert.deepEqual(choice, { fighterId: "hw-champ", slot: "FLEX_1" });
  });

  it("skips fighters who fit no open slot, taken ids, and inactive rows", () => {
    const onlyFly = chooseAutoPick({
      fighters: pool,
      takenIds: ["fly-champ", "fly-two", "fly-unranked"],
      openSlots: ["MEN_FLYWEIGHT"],
    });
    assert.equal(onlyFly, null);

    const withoutInactive = chooseAutoPick({
      fighters: [pool.find((f) => f.id === "fly-inactive")!],
      takenIds: [],
      openSlots: ["MEN_FLYWEIGHT", "FLEX_1"],
    });
    assert.equal(withoutInactive, null);
  });

  it("rejects a second commit of a fighter already on a roster", () => {
    const draft = snapshot({ takenFighterIds: ["fly-champ"], currentPickIndex: 1, onTheClockMembershipId: "team-b", onTheClockDraftPosition: 2 });
    const result = commitEvaluatedPick(draft, {
      now: new Date("2026-09-21T20:03:00.000Z"),
      expectedIndex: 1,
      membershipId: "team-b",
      membershipDraftPosition: 2,
      fighter: pool[1],
      slot: "MEN_FLYWEIGHT",
      autoPick: false,
      requireExpired: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "That fighter is already drafted.");
  });
});

describe("timer expiry", () => {
  it("waits until the deadline, then autopicks and starts a fresh 120s clock", () => {
    assert.equal(DEFAULT_PICK_CLOCK, 120);
    const start = new Date("2026-09-21T20:00:00.000Z");
    const draft = snapshot({
      pickDeadline: new Date(start.getTime() + 120_000),
      pickClockSeconds: 120,
    });
    const early = prepareAutoPick(draft, pool, new Date(start.getTime() + 119_000));
    assert.deepEqual(early, { action: "idle" });

    const due = prepareAutoPick(draft, pool, new Date(start.getTime() + 120_000));
    assert.equal(due.action, "pick");
    if (due.action !== "pick") return;
    assert.equal(due.fighterId, "fly-champ");
    assert.equal(due.slot, "MEN_FLYWEIGHT");
    assert.equal(due.membershipId, "team-a");
    assert.equal(due.pickNumber, 1);
    assert.equal(due.nextIndex, 1);
    assert.equal(due.nextStatus, "DRAFTING");
    assert.equal(due.nextDeadline?.toISOString(), new Date(start.getTime() + 240_000).toISOString());
    assert.equal(snakeDraftPosition(due.nextIndex, draft.teamCount), 2);
  });

  it("does not autodraft a paused league", () => {
    const paused = prepareAutoPick(
      snapshot({ status: "PAUSED", pickDeadline: null }),
      pool,
      new Date("2026-09-21T21:00:00.000Z"),
    );
    assert.deepEqual(paused, { action: "idle" });
  });

  it("clears the clock when the last roster slot is filled", () => {
    const filled = [
      "MEN_BANTAMWEIGHT",
      "MEN_FEATHERWEIGHT",
      "MEN_LIGHTWEIGHT",
      "MEN_WELTERWEIGHT",
      "MEN_MIDDLEWEIGHT",
      "MEN_LIGHT_HEAVYWEIGHT",
      "MEN_HEAVYWEIGHT",
      "WOMEN_STRAWWEIGHT",
      "WOMEN_FLYWEIGHT",
      "WOMEN_BANTAMWEIGHT",
      "FLEX_1",
      "FLEX_2",
    ];
    const last = prepareAutoPick(
      snapshot({
        teamCount: 1,
        currentPickIndex: 12,
        pickDeadline: new Date("2026-09-21T20:00:00.000Z"),
        filledSlots: filled,
      }),
      pool,
      new Date("2026-09-21T20:00:00.000Z"),
    );
    assert.equal(last.action, "pick");
    if (last.action !== "pick") return;
    assert.equal(last.slot, "MEN_FLYWEIGHT");
    assert.equal(last.nextStatus, "IN_SEASON");
    assert.equal(last.nextDeadline, null);
    assert.equal(last.nextIndex, 13);
  });
});

describe("manual pick vs autopick race", () => {
  const now = new Date("2026-09-21T20:02:00.000Z");
  const manualArgs = {
    now,
    expectedIndex: 0,
    membershipId: "team-a",
    membershipDraftPosition: 1,
    fighter: pool[2],
    slot: "MEN_FLYWEIGHT",
    autoPick: false,
    requireExpired: false,
  };
  const autoFighter = pool[1];

  it("accepts both commits against a stale snapshot, so the loser must re-read", () => {
    const seen = snapshot();
    const manual = commitEvaluatedPick(seen, manualArgs);
    const auto = commitEvaluatedPick(seen, {
      ...manualArgs,
      fighter: autoFighter,
      autoPick: true,
      requireExpired: true,
    });
    assert.equal(manual.ok, true);
    assert.equal(auto.ok, true);
    assert.equal(manual.ok && auto.ok && manual.draft.currentPickIndex === auto.draft.currentPickIndex, true);
  });

  it("lets only one commit win when the second reads the row after the first", async () => {
    let draft = snapshot();
    let chain: Promise<void> = Promise.resolve();
    function commit(args: Parameters<typeof commitEvaluatedPick>[1]) {
      const run = chain.then(() => {
        const result = commitEvaluatedPick(draft, args);
        if (result.ok) draft = result.draft;
        return result;
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }

    const [manual, auto] = await Promise.all([
      commit(manualArgs),
      commit({
        ...manualArgs,
        fighter: autoFighter,
        autoPick: true,
        requireExpired: true,
      }),
    ]);
    const winners = [manual, auto].filter((result) => result.ok);
    assert.equal(winners.length, 1);
    assert.equal(draft.currentPickIndex, 1);
    assert.equal(draft.takenFighterIds.length, 1);
    const loser = [manual, auto].find((result) => !result.ok);
    assert.ok(loser && !loser.ok);
    if (loser && !loser.ok) assert.equal(loser.reason, "Pick already processed.");
  });
});
