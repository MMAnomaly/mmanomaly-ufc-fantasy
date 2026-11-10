import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEASON_5_END,
  SEASON_5_START,
  eventCountsForSeason,
  isSeededBaseline,
  placeLabel,
  seasonInstant,
  seasonPhase,
  seasonPodium,
  validateSeasonRange,
} from "./season";

const start = seasonInstant(SEASON_5_START);
const end = seasonInstant(SEASON_5_END);

function event(date: string, extra: { name?: string; source?: string; externalId?: string } = {}) {
  const instant = seasonInstant(date);
  assert.ok(instant);
  return { date: instant, ...extra };
}

describe("Season 5 window", () => {
  it("counts Los Angeles calendar days from July 1 through December 31, 2026", () => {
    assert.ok(start && end);
    assert.equal(eventCountsForSeason(event("2026-07-01"), start, end), true);
    assert.equal(eventCountsForSeason(event("2026-10-10"), start, end), true);
    assert.equal(eventCountsForSeason(event("2026-10-17"), start, end), true);
    assert.equal(eventCountsForSeason(event("2026-12-31"), start, end), true);
    assert.equal(eventCountsForSeason(event("2026-06-30"), start, end), false);
    assert.equal(eventCountsForSeason(event("2027-01-01"), start, end), false);
    assert.equal(eventCountsForSeason(event("2027-01-23"), start, end), false);
    assert.equal(eventCountsForSeason(event("2027-02-06"), start, end), false);
  });

  it("uses the Los Angeles day when UTC midnight has already rolled over", () => {
    assert.ok(start && end);
    const stillDecember = new Date("2027-01-01T07:30:00.000Z");
    const newYear = new Date("2027-01-01T08:30:00.000Z");
    assert.equal(eventCountsForSeason({ date: stillDecember }, start, end), true);
    assert.equal(eventCountsForSeason({ date: newYear }, start, end), false);
  });

  it("keeps every score when the league has no season dates", () => {
    assert.equal(eventCountsForSeason(event("2025-01-01"), null, null), true);
    assert.equal(eventCountsForSeason(event("2027-02-06"), null, end), true);
    assert.equal(eventCountsForSeason(event("2026-06-01"), start, null), true);
  });

  it("counts a seeded baseline even when its date is outside the window", () => {
    assert.ok(start && end);
    const before = event("2026-01-15", { name: "Season 5 baseline", source: "seed" });
    const bySource = event("2025-12-01", { name: "Opening points", source: "baseline" });
    const byId = event("2027-03-01", { externalId: "season-5-baseline" });
    assert.equal(isSeededBaseline(before), true);
    assert.equal(eventCountsForSeason(before, start, end), true);
    assert.equal(eventCountsForSeason(bySource, start, end), true);
    assert.equal(eventCountsForSeason(byId, start, end), true);
    assert.equal(eventCountsForSeason(event("2026-01-15", { name: "UFC 300" }), start, end), false);
    assert.equal(eventCountsForSeason({ ...event("2026-01-15"), fightCount: 0 }, start, end), true);
    assert.equal(eventCountsForSeason({ ...event("2026-01-15"), fightCount: 12 }, start, end), false);
  });
});

describe("season dates form", () => {
  it("requires a real end date after the start", () => {
    const ok = validateSeasonRange("2026-07-01", "2026-12-31");
    assert.equal(ok.ok, true);
    assert.equal(validateSeasonRange("2026-12-31", "2026-07-01").ok, false);
    assert.equal(validateSeasonRange("2026-07-01", "2026-07-01").ok, false);
    assert.equal(validateSeasonRange("2026-02-31", "2026-12-31").ok, false);
  });
});

describe("season status and winner", () => {
  it("announces the start, the run, and the close on Los Angeles days", () => {
    assert.ok(start && end);
    const before = seasonPhase(seasonInstant("2026-06-30")!, start, end);
    assert.equal(before.phase, "before");
    if (before.phase === "before") assert.match(before.label, /^Season starts /);
    const during = seasonPhase(seasonInstant("2026-11-10")!, start, end);
    assert.equal(during.phase, "during");
    if (during.phase === "during") {
      assert.equal(during.label, "Season runs Jul 1, 2026 – Dec 31, 2026");
    }
    const after = seasonPhase(seasonInstant("2027-01-01")!, start, end);
    assert.equal(after.phase, "after");
    assert.equal(seasonPhase(new Date(), null, null).phase, "undated");
  });

  it("lists 1st, 2nd, and 3rd with competition ranking for ties", () => {
    const clear = seasonPodium([
      { teamName: "Fourth", total: 10 },
      { teamName: "First", total: 40 },
      { teamName: "Third", total: 20 },
      { teamName: "Second", total: 30 },
    ]);
    assert.deepEqual(
      clear.map((spot) => [spot.place, spot.row.teamName, spot.row.total]),
      [
        [1, "First", 40],
        [2, "Second", 30],
        [3, "Third", 20],
      ],
    );
    assert.deepEqual(clear.map((spot) => placeLabel(spot.place)), ["1st", "2nd", "3rd"]);

    const tiedFirst = seasonPodium([
      { teamName: "House Account", total: 102 },
      { teamName: "Late Replacement", total: 102 },
      { teamName: "The Pit", total: 88.4 },
      { teamName: "Also Ran", total: 70 },
    ]);
    assert.deepEqual(
      tiedFirst.map((spot) => [spot.place, spot.row.teamName]),
      [
        [1, "House Account"],
        [1, "Late Replacement"],
        [3, "The Pit"],
      ],
    );

    const tiedSecond = seasonPodium([
      { teamName: "First", total: 50 },
      { teamName: "A", total: 40 },
      { teamName: "B", total: 40 },
      { teamName: "C", total: 40 },
      { teamName: "Next", total: 10 },
    ]);
    assert.deepEqual(
      tiedSecond.map((spot) => [spot.place, spot.row.teamName]),
      [
        [1, "First"],
        [2, "A"],
        [2, "B"],
        [2, "C"],
      ],
    );

    const tiedThird = seasonPodium([
      { teamName: "First", total: 9 },
      { teamName: "Second", total: 8 },
      { teamName: "C1", total: 7 },
      { teamName: "C2", total: 7 },
      { teamName: "C3", total: 7 },
      { teamName: "Fourth", total: 1 },
    ]);
    assert.deepEqual(
      tiedThird.map((spot) => spot.place),
      [1, 2, 3, 3, 3],
    );
    assert.equal(seasonPodium([]).length, 0);
    assert.deepEqual(
      seasonPodium([{ teamName: "Only", total: 4 }]).map((spot) => spot.place),
      [1],
    );
  });
});
