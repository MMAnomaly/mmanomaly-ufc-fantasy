import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { snakeDraftPosition, totalPicks } from "./draft";
import { ROSTER_SIZE } from "./slots";

describe("snake draft order", () => {
  it("walks 1..N then N..1", () => {
    const n = 4;
    const sequence = Array.from({ length: n * 2 }, (_, i) => snakeDraftPosition(i, n));
    assert.deepEqual(sequence, [1, 2, 3, 4, 4, 3, 2, 1]);
  });

  it("starts round 3 back at pick 1", () => {
    assert.equal(snakeDraftPosition(8, 4), 1);
  });

  it("fills 13 slots per team", () => {
    assert.equal(ROSTER_SIZE, 13);
    assert.equal(totalPicks(8), 104);
  });
});
