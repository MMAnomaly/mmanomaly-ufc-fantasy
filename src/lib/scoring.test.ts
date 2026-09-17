import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDkClassicPoints, parseClockToSeconds } from "./scoring";

describe("DraftKings Classic MMA scoring", () => {
  it("parses UFC Stats clocks", () => {
    assert.equal(parseClockToSeconds("0:45"), 45);
    assert.equal(parseClockToSeconds("4:15"), 255);
    assert.equal(parseClockToSeconds("1:00"), 60);
  });

  it("counts significant strikes as strike + additional SS", () => {
    const result = computeDkClassicPoints({
      strikes: 10,
      sigStrikes: 10,
      controlTimeSeconds: 0,
      takedowns: 0,
      reversals: 0,
      knockdowns: 0,
      isWinner: false,
    });
    assert.equal(result.strikes, 2);
    assert.equal(result.significantStrikes, 2);
    assert.equal(result.total, 4);
  });

  it("awards round-1 finish plus quick-win bonus", () => {
    const result = computeDkClassicPoints({
      strikes: 0,
      sigStrikes: 0,
      controlTimeSeconds: 0,
      takedowns: 0,
      reversals: 0,
      knockdowns: 1,
      isWinner: true,
      method: "KO/TKO",
      round: 1,
      timeSecondsInRound: 45,
    });
    assert.equal(result.knockdowns, 10);
    assert.equal(result.winBonus, 90);
    assert.equal(result.quickWinBonus, 25);
    assert.equal(result.total, 125);
  });

  it("awards decision winners +30 and still scores loser moves", () => {
    const winner = computeDkClassicPoints({
      strikes: 100,
      sigStrikes: 50,
      controlTimeSeconds: 100,
      takedowns: 1,
      reversals: 0,
      knockdowns: 0,
      isWinner: true,
      method: "U-DEC",
      round: 3,
      timeSecondsInRound: 300,
    });
    assert.equal(winner.winBonus, 30);
    assert.equal(winner.quickWinBonus, 0);
    assert.equal(winner.strikes, 20);
    assert.equal(winner.significantStrikes, 10);
    assert.equal(winner.controlTime, 3);
    assert.equal(winner.takedowns, 5);
    assert.equal(winner.total, 68);

    const loser = computeDkClassicPoints({
      strikes: 40,
      sigStrikes: 20,
      controlTimeSeconds: 0,
      takedowns: 0,
      reversals: 1,
      knockdowns: 0,
      isWinner: false,
      method: "U-DEC",
      round: 3,
    });
    assert.equal(loser.winBonus, 0);
    assert.equal(loser.reversals, 5);
    assert.equal(loser.total, 17);
  });

  it("uses round 5 finish bonus of 40", () => {
    const result = computeDkClassicPoints({
      strikes: 0,
      sigStrikes: 0,
      controlTimeSeconds: 0,
      takedowns: 0,
      reversals: 0,
      knockdowns: 0,
      isWinner: true,
      method: "Submission",
      round: 5,
      timeSecondsInRound: 90,
    });
    assert.equal(result.winBonus, 40);
    assert.equal(result.quickWinBonus, 0);
  });
});
