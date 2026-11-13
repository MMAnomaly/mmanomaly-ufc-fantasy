import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { CLASS_LABELS, CLASS_TO_SLOT, type ClassKey } from "./slots";
import { computePoolPlan, parsePoolPlan, standingsByTeam, type PoolFighterState, type PoolSnapshot } from "./pool-plan";

const DRAFTED_KEEPS = ["max-holloway", "erin-blanchfield", "ailin-perez", "jasmine-jasudavicius", "jan-b-achowicz"];

function isClassKey(value: string): value is ClassKey {
  return Object.prototype.hasOwnProperty.call(CLASS_TO_SLOT, value);
}

function makeFighter(partial: Partial<PoolFighterState> & Pick<PoolFighterState, "id" | "name" | "classKey">): PoolFighterState {
  const classKey = isClassKey(partial.classKey) ? partial.classKey : "mens_lightweight";
  return {
    sex: classKey.startsWith("womens_") ? "women" : "men",
    weightClass: CLASS_LABELS[classKey],
    active: true,
    tapologyUrl: null,
    record: null,
    activityNotes: null,
    aliases: [],
    ...partial,
    classKey,
    slotKey: CLASS_TO_SLOT[classKey],
  };
}

function emptySnapshot(): PoolSnapshot {
  return { fighters: [], rosterSlots: [], picks: [], scores: [], statLines: [], fights: [] };
}

describe("pool plan", () => {
  it("moves scores onto the kept id when the rostered row is the one removed", () => {
    const before = emptySnapshot();
    before.fighters.push(
      makeFighter({ id: "keep-slug", name: "Sample Fighter", classKey: "mens_lightweight", active: false, tapologyUrl: null }),
      makeFighter({
        id: "remove-numeric",
        name: "Sample Fighter",
        classKey: "mens_lightweight",
        tapologyUrl: "https://www.tapology.com/fightcenter/fighters/10-sample-fighter",
      }),
    );
    before.rosterSlots.push({ id: "slot-1", fighterId: "remove-numeric", membershipId: "team-a", slot: "MEN_LIGHTWEIGHT" });
    before.picks.push({ id: "pick-1", leagueId: "season-5", fighterId: "remove-numeric" });
    before.scores.push({ id: "score-1", eventId: "vegas", fighterId: "remove-numeric", points: 12.5 });
    before.statLines.push({ id: "line-1", fightId: "fight-1", fighterId: "remove-numeric", fighterName: "Sample Fighter" });
    before.fights.push({ id: "fight-1", fighter1Id: "remove-numeric", fighter2Id: null });

    const plan = parsePoolPlan({
      merges: [
        {
          keep: { id: "keep-slug" },
          remove: [{ id: "remove-numeric" }],
          setActive: true,
          copyTapologyUrl: "https://www.tapology.com/fightcenter/fighters/10-sample-fighter",
        },
      ],
    });
    const first = computePoolPlan(before, plan);
    assert.equal(first.diff.standingsUnchanged, true);
    assert.equal(first.diff.standingsPointsBefore, 12.5);
    assert.equal(first.diff.standingsPointsAfter, 12.5);
    assert.equal(first.next.rosterSlots[0]?.fighterId, "keep-slug");
    assert.equal(first.next.rosterSlots[0]?.slot, "MEN_LIGHTWEIGHT");
    assert.equal(first.next.scores[0]?.fighterId, "keep-slug");
    assert.equal(first.next.scores[0]?.points, 12.5);
    assert.equal(first.next.picks[0]?.fighterId, "keep-slug");
    assert.equal(first.next.statLines[0]?.fighterId, "keep-slug");
    assert.equal(first.next.fights[0]?.fighter1Id, "keep-slug");
    assert.equal(first.next.fighters.some((fighter) => fighter.id === "remove-numeric"), false);
    assert.equal(first.next.fighters.find((fighter) => fighter.id === "keep-slug")?.active, true);

    const second = computePoolPlan(first.next, plan);
    assert.equal(second.diff.merges[0]?.action, "skip");
    assert.equal(second.diff.standingsPointsAfter, 12.5);
    assert.equal(second.next.fighters.length, first.next.fighters.length);
  });

  it("does not copy a non-rostered duplicate's extra points onto the rostered fighter", () => {
    const before = emptySnapshot();
    before.fighters.push(
      makeFighter({ id: "rostered", name: "Max Holloway", classKey: "mens_featherweight", active: false }),
      makeFighter({ id: "duplicate", name: "Max Holloway", classKey: "mens_featherweight" }),
    );
    before.rosterSlots.push({ id: "slot", fighterId: "rostered", membershipId: "Jive Turkey", slot: "MEN_FEATHERWEIGHT" });
    before.scores.push(
      { id: "keep-score", eventId: "vegas", fighterId: "rostered", points: 96.3 },
      { id: "dup-score", eventId: "vegas", fighterId: "duplicate", points: 96.3 },
      { id: "extra-score", eventId: "edmonton", fighterId: "duplicate", points: 20 },
    );
    const plan = parsePoolPlan({
      merges: [{ keep: { id: "rostered" }, remove: [{ id: "duplicate" }], setActive: true }],
    });
    const { next, diff } = computePoolPlan(before, plan);
    assert.equal(diff.standingsUnchanged, true);
    assert.equal(standingsByTeam(next)["Jive Turkey"], 96.3);
    assert.equal(next.scores.length, 1);
    assert.equal(next.scores[0]?.fighterId, "rostered");
    assert.equal(next.fighters.find((fighter) => fighter.id === "rostered")?.active, true);
  });

  it("dry-runs the audited plan without moving Season 5 points", () => {
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), "data", "pool-fix-plan.json"), "utf8")) as Record<string, unknown>;
    const poisoned = structuredClone(raw) as {
      reactivations: Record<string, unknown>[];
      adds: Record<string, unknown>[];
    };
    poisoned.reactivations.push(
      { name: "Saygid Izagakhmaev", id: "saygid-izagakhmaev", classKey: "mens_welterweight", weightClass: "Welterweight" },
      { name: "Farid Basharat", id: "farid-basharat", classKey: "mens_bantamweight", weightClass: "Bantamweight" },
      { name: "Julian Erosa", id: "julian-erosa", classKey: "mens_featherweight", weightClass: "Featherweight" },
    );
    poisoned.adds.push(
      { name: "Michael Page", classKey: "mens_middleweight", weightClass: "Middleweight", tapologyUrl: "https://www.tapology.com/fightcenter/fighters/michael-page" },
      { name: "Edson Barboza", classKey: "mens_lightweight", weightClass: "Lightweight" },
    );
    const plan = parsePoolPlan(poisoned);
    const before = emptySnapshot();
    const seen = new Set<string>();

    const addFighter = (entry: { id?: string; name?: string; classKey?: string; active?: boolean; tapologyUrl?: string | null; draftedBy?: string | null; seasonPoints?: number }, active: boolean) => {
      if (!entry.id || !entry.name || seen.has(entry.id)) return;
      seen.add(entry.id);
      const classKey = entry.classKey && isClassKey(entry.classKey) ? entry.classKey : "mens_lightweight";
      before.fighters.push(
        makeFighter({
          id: entry.id,
          name: entry.name,
          classKey,
          active,
          tapologyUrl: entry.tapologyUrl ?? null,
        }),
      );
      if (entry.draftedBy) {
        before.rosterSlots.push({
          id: `slot-${entry.id}`,
          fighterId: entry.id,
          membershipId: entry.draftedBy,
          slot: "FLEX_1",
        });
        before.picks.push({ id: `pick-${entry.id}`, leagueId: "season-5", fighterId: entry.id });
        before.scores.push({
          id: `score-${entry.id}`,
          eventId: "season",
          fighterId: entry.id,
          points: entry.seasonPoints ?? 0,
        });
      }
    };

    for (const merge of plan.merges) {
      const keep = merge.keep ?? {};
      addFighter(keep, keep.active === true);
      for (const remove of merge.remove ?? []) {
        addFighter(remove, remove.active !== false);
        if (!remove.draftedBy && remove.id) {
          before.scores.push({
            id: `dup-${remove.id}`,
            eventId: "season",
            fighterId: remove.id,
            points: remove.seasonPoints ?? 0,
          });
          before.scores.push({ id: `extra-${remove.id}`, eventId: `extra-${remove.id}`, fighterId: remove.id, points: 7 });
          before.statLines.push({ id: `line-${remove.id}`, fightId: `fight-${remove.id}`, fighterId: remove.id, fighterName: remove.name ?? remove.id });
          before.fights.push({ id: `fight-${remove.id}`, fighter1Id: remove.id, fighter2Id: null });
          before.picks.push({ id: `pick-dup-${remove.id}`, leagueId: "season-5", fighterId: remove.id });
        }
      }
    }
    for (const reactivation of plan.reactivations) {
      addFighter(reactivation, false);
    }
    for (const rename of plan.renames) {
      addFighter({ id: rename.id, name: rename.from, classKey: rename.classKey }, true);
    }
    for (const id of ["saygid-izagakhmaev", "farid-basharat", "julian-erosa"]) {
      addFighter({ id, name: id, classKey: "mens_welterweight" }, false);
    }
    const luciaSlot = before.rosterSlots.find((slot) => slot.fighterId === "lucia-szabova");
    if (!luciaSlot) {
      before.rosterSlots.push({ id: "slot-lucia", fighterId: "lucia-szabova", membershipId: "Unaudited", slot: "WOMEN_BANTAMWEIGHT" });
    }

    const teamsBefore = standingsByTeam(before);
    const { next, diff } = computePoolPlan(before, plan);

    assert.equal(diff.standingsUnchanged, true);
    assert.deepEqual(diff.standingsByTeamAfter, teamsBefore);
    assert.equal(diff.dumont?.keepId, "139271-norma-dumont-viana");
    assert.equal(diff.dumont?.active, false);
    assert.equal(diff.dumont?.rosterKept, true);

    for (const id of DRAFTED_KEEPS) {
      const fighter = next.fighters.find((row) => row.id === id);
      assert.ok(fighter, id);
      assert.equal(fighter?.active, true, id);
      const beforeSlot = before.rosterSlots.find((slot) => slot.fighterId === id);
      const afterSlot = next.rosterSlots.find((slot) => slot.id === beforeSlot?.id);
      assert.equal(afterSlot?.fighterId, id);
      assert.equal(afterSlot?.membershipId, beforeSlot?.membershipId);
    }
    const dumont = next.fighters.find((fighter) => fighter.id === "139271-norma-dumont-viana");
    assert.equal(dumont?.active, false);
    assert.equal(next.rosterSlots.some((slot) => slot.fighterId === "139271-norma-dumont-viana" && slot.membershipId === "Drew"), true);
    assert.equal(next.scores.some((score) => score.fighterId === "139271-norma-dumont-viana" && score.points === 35.8), true);
    assert.equal(next.fighters.some((fighter) => fighter.id === "norma-dumont"), false);
    assert.equal(next.fighters.filter((fighter) => fighter.name === "Max Holloway").length, 1);

    const holloway = next.fighters.find((fighter) => fighter.id === "max-holloway");
    assert.match(holloway?.tapologyUrl ?? "", /12723-max-holloway/);

    for (const id of ["saygid-izagakhmaev", "farid-basharat", "julian-erosa"]) {
      assert.equal(next.fighters.find((fighter) => fighter.id === id)?.active, false);
    }
    assert.equal(next.fighters.some((fighter) => fighter.name === "Michael Page" || fighter.name === "Edson Barboza"), false);
    assert.equal(diff.added.some((row) => row.action === "add" && /Michael Page|Edson Barboza|Aliaskhab Khizriev/.test(row.name)), false);

    const valesca = next.fighters.find((fighter) => fighter.id === "valesca-machado");
    assert.equal(valesca?.name, "Tina Black (Valesca Machado)");
    assert.equal(valesca?.active, true);
    assert.ok(valesca?.aliases.some((alias) => alias === "Tina Black"));
    assert.ok(valesca?.aliases.some((alias) => alias === "Valesca Machado"));

    const jose = next.fighters.find((fighter) => fighter.id === "jose-luiz");
    assert.equal(jose?.name, "José Luiz Montanha");
    assert.ok(jose?.aliases.some((alias) => alias === "Jose Montanha"));
    const ozzy = next.fighters.find((fighter) => fighter.id === "osman-diaz");
    assert.equal(ozzy?.name, "Osman 'Ozzy' Diaz");
    assert.ok(ozzy?.aliases.some((alias) => alias === "Ozzy Diaz"));
    assert.equal(next.fighters.find((fighter) => fighter.id === "eduardo-henrique")?.name, "Eduardo Henrique 'Chapolin'");
    assert.equal(next.fighters.find((fighter) => fighter.id === "thomas-gantt")?.name, "Thomas 'Tommy' Gantt");
    assert.equal(next.fighters.find((fighter) => fighter.id === "beatriz-mesquita")?.name, "Beatriz 'Bia' Mesquita");
    assert.equal(next.fighters.find((fighter) => fighter.id === "liu-ce")?.name, "Liu Ce");
    assert.ok(next.fighters.find((fighter) => fighter.id === "liu-ce")?.aliases.includes("Ce Liu"));

    assert.equal(next.fighters.some((fighter) => fighter.id === "189683-luis-hernandez"), true);
    assert.equal(next.fighters.find((fighter) => fighter.id === "luis-hernandez")?.classKey, "mens_middleweight");
    assert.equal(next.fighters.find((fighter) => fighter.id === "189683-luis-hernandez")?.classKey, "mens_light_heavyweight");

    const lucia = next.fighters.find((fighter) => fighter.id === "lucia-szabova");
    assert.equal(lucia?.classKey, "womens_flyweight");
    assert.equal(next.rosterSlots.find((slot) => slot.fighterId === "lucia-szabova")?.slot, "WOMEN_BANTAMWEIGHT");

    const again = computePoolPlan(next, plan);
    assert.equal(again.diff.standingsUnchanged, true);
    assert.deepEqual(again.diff.standingsByTeamAfter, teamsBefore);
    assert.equal(again.next.fighters.find((fighter) => fighter.id === "139271-norma-dumont-viana")?.active, false);
    assert.equal(again.diff.merges.every((merge) => merge.action === "skip"), true);
  });
});
