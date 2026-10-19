import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { AfrImportError, parseAfrResults } from "./afr-results";
import type { ParsedFight } from "./ufcstats";

function loadFixture(name: string): unknown {
  const file = path.join(process.cwd(), "test", "fixtures", name);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function fightNamed(fights: ParsedFight[], name: string): ParsedFight {
  const fight = fights.find((item) => item.stats.some((line) => line.fighterName === name));
  assert.ok(fight, `missing fight for ${name}`);
  return fight;
}

function lineNamed(fight: ParsedFight, name: string) {
  const line = fight.stats.find((item) => item.fighterName === name);
  assert.ok(line, `missing stat line for ${name}`);
  return line;
}

describe("Active Fighter Repository results mapping", () => {
  it("maps the Edmonton card onto ParsedEvent", () => {
    const raw = loadFixture("afr-edmonton-results.json");
    const parsed = parseAfrResults(raw);

    assert.equal(parsed.externalId, "https://www.ufc.com/event/ufc-fight-night-october-17-2026");
    assert.equal(parsed.url, parsed.externalId);
    assert.equal(parsed.name, "UFC Fight Night Edmonton");
    assert.equal(parsed.date.toISOString(), "2026-10-17T12:00:00.000Z");
    assert.equal(parsed.source, "afr-ufcstats");
    assert.equal(parsed.fights.length, 13);

    const main = parsed.fights[0];
    assert.equal(main.fighter1Name, "Joaquin Buckley");
    assert.equal(main.fighter2Name, "Mike Malott");
    assert.equal(main.winnerName, "Mike Malott");
    assert.equal(main.method, "KO/TKO");
    assert.equal(main.round, 2);
    assert.equal(main.time, "2:32");
    assert.equal(main.weightClass, "Welterweight");

    const buckley = lineNamed(main, "Joaquin Buckley");
    assert.equal(buckley.isWinner, false);
    assert.equal(buckley.strikes, 20);
    assert.equal(buckley.sigStrikes, 14);
    assert.equal(buckley.takedowns, 0);
    assert.equal(buckley.reversals, 0);
    assert.equal(buckley.controlTimeSeconds, 8);
    assert.equal(buckley.knockdowns, 0);

    const malott = lineNamed(main, "Mike Malott");
    assert.equal(malott.isWinner, true);
    assert.equal(malott.strikes, 38);
    assert.equal(malott.sigStrikes, 37);
    assert.equal(malott.takedowns, 0);
    assert.equal(malott.reversals, 0);
    assert.equal(malott.controlTimeSeconds, 85);
    assert.equal(malott.knockdowns, 1);

    for (const fight of parsed.fights) {
      const winners = fight.stats.filter((line) => line.isWinner);
      assert.equal(winners.length, 1);
      assert.equal(winners[0].fighterName, fight.winnerName);
      assert.equal(fight.stats.length, 2);
    }
  });

  it("ignores fighters_listed_on_card when those names differ", () => {
    const raw = loadFixture("afr-edmonton-results.json");
    assert.ok(raw && typeof raw === "object");
    const cloned = structuredClone(raw) as {
      bouts: { fighters_listed_on_card: string[]; fighters: { method: string; end_round: number }[] }[];
    };
    cloned.bouts[0].fighters_listed_on_card = ["Not On The Stats", "Also Mislabeled"];
    cloned.bouts[0].fighters[0].method = "SHOULD_NOT_USE";
    cloned.bouts[0].fighters[0].end_round = 99;

    const parsed = parseAfrResults(cloned);
    assert.equal(parsed.fights[0].fighter1Name, "Joaquin Buckley");
    assert.equal(parsed.fights[0].fighter2Name, "Mike Malott");
    assert.equal(parsed.fights[0].method, "KO/TKO");
    assert.equal(parsed.fights[0].round, 2);
    assert.equal(
      parsed.fights.every((fight) => fight.stats.every((line) => line.fighterName !== "Not On The Stats")),
      true,
    );
  });

  it("maps the Vegas 122 draw without awarding a winner", () => {
    const parsed = parseAfrResults(loadFixture("afr-vegas122-results.json"));

    assert.equal(parsed.externalId, "https://www.ufc.com/event/ufc-fight-night-october-10-2026");
    assert.equal(parsed.url, parsed.externalId);
    assert.equal(parsed.name, "UFC Vegas 122");
    assert.equal(parsed.date.toISOString(), "2026-10-10T12:00:00.000Z");
    assert.equal(parsed.source, "afr-ufcstats");
    assert.equal(parsed.fights.length, 12);

    const draw = fightNamed(parsed.fights, "Ernesta Kareckaitė");
    assert.equal(draw.fighter1Name, "Ernesta Kareckaitė");
    assert.equal(draw.fighter2Name, "Melissa Gatto");
    assert.equal(draw.winnerName, null);
    assert.equal(draw.method, "M-DEC");
    assert.equal(draw.round, 3);
    assert.equal(draw.time, "5:00");
    assert.equal(lineNamed(draw, "Ernesta Kareckaitė").isWinner, false);
    assert.equal(lineNamed(draw, "Melissa Gatto").isWinner, false);
    assert.equal(lineNamed(draw, "Ernesta Kareckaitė").strikes, 104);
    assert.equal(lineNamed(draw, "Ernesta Kareckaitė").sigStrikes, 48);
    assert.equal(lineNamed(draw, "Ernesta Kareckaitė").controlTimeSeconds, 250);
    assert.equal(lineNamed(draw, "Melissa Gatto").strikes, 74);
    assert.equal(lineNamed(draw, "Melissa Gatto").sigStrikes, 41);
    assert.equal(lineNamed(draw, "Melissa Gatto").takedowns, 1);
    assert.equal(lineNamed(draw, "Melissa Gatto").controlTimeSeconds, 355);

    for (const fight of parsed.fights) {
      const winners = fight.stats.filter((line) => line.isWinner);
      if (fight.winnerName === null) {
        assert.equal(winners.length, 0);
        assert.equal(
          fight.stats.every((line) => line.fighterName === "Ernesta Kareckaitė" || line.fighterName === "Melissa Gatto"),
          true,
        );
      } else {
        assert.equal(winners.length, 1);
        assert.equal(winners[0].fighterName, fight.winnerName);
      }
    }
  });

  it("prefers ufcstats_url over ufc_url", () => {
    const raw = loadFixture("afr-vegas122-results.json");
    const cloned = structuredClone(raw) as { event: { ufcstats_url: string | null } };
    cloned.event.ufcstats_url = "http://ufcstats.com/event-details/vegas-122";
    const parsed = parseAfrResults(cloned);
    assert.equal(parsed.externalId, "http://ufcstats.com/event-details/vegas-122");
    assert.equal(parsed.url, parsed.externalId);
  });

  it("rejects a results file with no event url or a bad date", () => {
    const raw = loadFixture("afr-edmonton-results.json");
    const noUrl = structuredClone(raw) as { event: { ufcstats_url: string | null; ufc_url: string | null } };
    noUrl.event.ufcstats_url = null;
    noUrl.event.ufc_url = null;
    assert.throws(() => parseAfrResults(noUrl), AfrImportError);

    const badDate = structuredClone(raw) as { event: { date: string } };
    badDate.event.date = "2026-02-31";
    assert.throws(() => parseAfrResults(badDate), AfrImportError);
  });
});
