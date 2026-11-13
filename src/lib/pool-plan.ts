import {
  fighterMatchesName,
  hasNumericTapology,
  normalizeFighterName,
  preferTapologyUrl,
  slugifyFighterName,
  tapologyFullSlug,
} from "./afr-pool";
import { CLASS_LABELS, CLASS_TO_SLOT, type ClassKey } from "./slots";

export class PoolPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoolPlanError";
  }
}

/** Confirmed out. A later plan cannot turn these back on through reactivate or add. */
const HARD_BLOCK_IDS = new Set(["saygid-izagakhmaev", "farid-basharat", "julian-erosa"]);
const HARD_BLOCK_NAMES = ["Saygid Izagakhmaev", "Farid Basharat", "Julian Erosa"];

export type PoolFighterState = {
  id: string;
  name: string;
  classKey: string;
  slotKey: string;
  sex: string;
  weightClass: string;
  active: boolean;
  tapologyUrl: string | null;
  record: string | null;
  activityNotes: string | null;
  aliases: string[];
};

export type RosterSlotState = { id: string; fighterId: string; membershipId: string; slot: string };
export type DraftPickState = { id: string; leagueId: string; fighterId: string };
export type ScoreState = { id: string; eventId: string; fighterId: string; points: number };
export type StatLineState = { id: string; fightId: string; fighterId: string | null; fighterName: string };
export type FightCornerState = { id: string; fighter1Id: string | null; fighter2Id: string | null };

export type PoolSnapshot = {
  fighters: PoolFighterState[];
  rosterSlots: RosterSlotState[];
  picks: DraftPickState[];
  scores: ScoreState[];
  statLines: StatLineState[];
  fights: FightCornerState[];
};

export type PoolPlanDiff = {
  merges: { keepId: string; removeId: string; action: "merge" | "skip"; detail: string }[];
  reactivated: { id: string; name: string; action: "reactivate" | "update" | "skip"; detail: string }[];
  added: { id: string | null; name: string; action: "add" | "update" | "skip"; detail: string }[];
  classChanges: { id: string; from: string | null; to: string; action: "change" | "skip"; detail: string }[];
  renames: { id: string; name: string; aliases: string[]; action: "rename" | "skip"; detail: string }[];
  dumont: { keepId: string; active: false; rosterKept: boolean; detail: string } | null;
  blocked: { name: string; id: string | null; action: string }[];
  standingsByTeamBefore: Record<string, number>;
  standingsByTeamAfter: Record<string, number>;
  standingsPointsBefore: number;
  standingsPointsAfter: number;
  standingsUnchanged: boolean;
};

type PlanFighterRef = {
  id?: string;
  name?: string;
  classKey?: string;
  active?: boolean;
  tapologyUrl?: string | null;
  draftedBy?: string | null;
  seasonPoints?: number;
};

type PlanMerge = {
  keep?: PlanFighterRef;
  remove?: PlanFighterRef[];
  copyTapologyUrl?: string | null;
  setActive?: boolean;
  setClassKey?: string | null;
  setName?: string | null;
};

type PlanAdd = {
  name?: string;
  weightClass?: string;
  classKey?: string;
  tapologyUrl?: string | null;
};

type PlanReactivation = {
  name?: string;
  id?: string;
  classKey?: string;
  weightClass?: string;
  tapologyUrl?: string | null;
  setName?: string | null;
  suggestedDisplayName?: string | null;
  copyTapologyUrl?: string | null;
};

type PlanClassChange = {
  id?: string;
  name?: string;
  fromClassKey?: string;
  toClassKey?: string;
  toWeightClass?: string;
};

type PlanRename = {
  id?: string;
  from?: string;
  to?: string;
  classKey?: string;
  alsoKnownAs?: string;
  suggestedDisplayName?: string | null;
  tapologyUrl?: string | null;
};

type PlanAlias = { reportedAs?: string; poolName?: string };

export type PoolPlan = {
  merges: PlanMerge[];
  adds: PlanAdd[];
  reactivations: PlanReactivation[];
  classChanges: PlanClassChange[];
  renames: PlanRename[];
  alreadyInPoolUnderAnotherName: PlanAlias[];
  dumont: { verdict?: string; keepId?: string; removeId?: string; date?: string } | null;
  blockedNames: string[];
  blockedIds: Set<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parsePoolPlan(data: unknown): PoolPlan {
  if (!isRecord(data)) throw new PoolPlanError("Pool plan must be a JSON object");
  if (!Array.isArray(data.merges)) throw new PoolPlanError("Pool plan is missing merges");
  const blockedNames = [
    ...HARD_BLOCK_NAMES,
    ...asArray(data.notInUfc).map((entry) => (isRecord(entry) ? readString(entry.name) : null)),
    ...asArray(data.unverifiedDoNotAddAutomatically).map((entry) => (isRecord(entry) ? readString(entry.name) : null)),
  ].filter((name): name is string => Boolean(name));
  const blockedIds = new Set(HARD_BLOCK_IDS);
  for (const entry of asArray(data.notInUfc)) {
    if (isRecord(entry) && typeof entry.id === "string") blockedIds.add(entry.id);
  }
  const dumont = isRecord(data.dumont) ? data.dumont : null;
  return {
    merges: data.merges as PlanMerge[],
    adds: asArray(data.adds) as PlanAdd[],
    reactivations: asArray(data.reactivations) as PlanReactivation[],
    classChanges: asArray(data.classChanges) as PlanClassChange[],
    renames: asArray(data.renames) as PlanRename[],
    alreadyInPoolUnderAnotherName: asArray(data.alreadyInPoolUnderAnotherName) as PlanAlias[],
    dumont: dumont
      ? {
          verdict: readString(dumont.verdict) ?? undefined,
          keepId: readString(dumont.keepId) ?? undefined,
          removeId: readString(dumont.removeId) ?? undefined,
          date: readString(dumont.date) ?? undefined,
        }
      : null,
    blockedNames,
    blockedIds,
  };
}

function roundPoints(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function standingsByTeam(state: PoolSnapshot): Record<string, number> {
  const pointsByFighter = new Map<string, number>();
  for (const score of state.scores) {
    pointsByFighter.set(score.fighterId, (pointsByFighter.get(score.fighterId) ?? 0) + score.points);
  }
  const totals: Record<string, number> = {};
  for (const slot of state.rosterSlots) {
    totals[slot.membershipId] = roundPoints((totals[slot.membershipId] ?? 0) + (pointsByFighter.get(slot.fighterId) ?? 0));
  }
  return totals;
}

function totalPoints(byTeam: Record<string, number>): number {
  return roundPoints(Object.values(byTeam).reduce((sum, points) => sum + points, 0));
}

function sameTotals(before: Record<string, number>, after: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (roundPoints(before[key] ?? 0) !== roundPoints(after[key] ?? 0)) return false;
  }
  return true;
}

function isBlocked(plan: PoolPlan, name: string | null | undefined, id: string | null | undefined): boolean {
  if (id && plan.blockedIds.has(id)) return true;
  if (!name) return false;
  return plan.blockedNames.some((blocked) => fighterMatchesName({ name: blocked }, name) || fighterMatchesName({ name }, blocked));
}

function addAlias(fighter: PoolFighterState, alias: string | null | undefined) {
  const trimmed = alias?.trim();
  if (!trimmed) return;
  if (normalizeFighterName(trimmed) === normalizeFighterName(fighter.name)) return;
  if (fighter.aliases.some((existing) => normalizeFighterName(existing) === normalizeFighterName(trimmed))) return;
  fighter.aliases.push(trimmed);
}

function applyClass(fighter: PoolFighterState, classKey: string, weightClass?: string | null) {
  if (!isClassKey(classKey)) return false;
  fighter.classKey = classKey;
  fighter.slotKey = CLASS_TO_SLOT[classKey];
  fighter.sex = classKey.startsWith("womens_") ? "women" : "men";
  fighter.weightClass = weightClass?.trim() || CLASS_LABELS[classKey];
  return true;
}

function isClassKey(value: string): value is ClassKey {
  return Object.prototype.hasOwnProperty.call(CLASS_TO_SLOT, value);
}

function rosteredIds(state: PoolSnapshot): Set<string> {
  return new Set(state.rosterSlots.map((slot) => slot.fighterId));
}

function findFighter(state: PoolSnapshot, id: string | null | undefined): PoolFighterState | undefined {
  if (!id) return undefined;
  return state.fighters.find((fighter) => fighter.id === id);
}

function findByName(state: PoolSnapshot, name: string | null | undefined): PoolFighterState | undefined {
  if (!name) return undefined;
  const hits = state.fighters.filter((fighter) => fighterMatchesName(fighter, name) || fighter.aliases.some((alias) => fighterMatchesName({ name: alias }, name)));
  if (hits.length === 0) return undefined;
  const rostered = rosteredIds(state);
  return [...hits].sort((a, b) => {
    const score = (fighter: PoolFighterState) =>
      (rostered.has(fighter.id) ? 4 : 0) + (fighter.active ? 2 : 0) + (hasNumericTapology(fighter.tapologyUrl) || hasNumericTapology(fighter.id) ? 1 : 0);
    return score(b) - score(a) || a.id.localeCompare(b.id);
  })[0];
}

/**
 * Drop scores that were not already counting for a roster, and keep the rostered
 * fighter's points when both ids have the same event. Standings sum each roster
 * slot's fighter, so copying a non-rostered duplicate onto the kept id would change
 * the season total.
 */
function mergeScores(state: PoolSnapshot, keepId: string, removeId: string, keepRostered: boolean, removeRostered: boolean) {
  const removeScores = state.scores.filter((score) => score.fighterId === removeId);
  for (const score of removeScores) {
    const conflict = state.scores.find((other) => other !== score && other.fighterId === keepId && other.eventId === score.eventId);
    const counts = removeRostered && !keepRostered;
    if (!counts) {
      state.scores = state.scores.filter((other) => other !== score);
      continue;
    }
    if (conflict) {
      conflict.points = score.points;
      state.scores = state.scores.filter((other) => other !== score);
    } else {
      score.fighterId = keepId;
    }
  }
}

function mergeRefs(state: PoolSnapshot, keepId: string, removeId: string) {
  for (const slot of state.rosterSlots) {
    if (slot.fighterId === removeId) slot.fighterId = keepId;
  }
  state.picks = state.picks.filter((pick) => {
    if (pick.fighterId !== removeId) return true;
    const clash = state.picks.some((other) => other !== pick && other.leagueId === pick.leagueId && other.fighterId === keepId);
    if (clash) return false;
    pick.fighterId = keepId;
    return true;
  });
  state.statLines = state.statLines.filter((line) => {
    if (line.fighterId !== removeId) return true;
    const clash = state.statLines.some(
      (other) => other !== line && other.fightId === line.fightId && other.fighterName === line.fighterName && other.fighterId === keepId,
    );
    if (clash) return false;
    line.fighterId = keepId;
    return true;
  });
  for (const fight of state.fights) {
    if (fight.fighter1Id === removeId) fight.fighter1Id = keepId;
    if (fight.fighter2Id === removeId) fight.fighter2Id = keepId;
  }
}

function applyDisplay(fighter: PoolFighterState, display: string | null, aliases: (string | null | undefined)[]) {
  const previous = fighter.name;
  if (display && display.trim()) fighter.name = display.trim();
  addAlias(fighter, previous);
  for (const alias of aliases) addAlias(fighter, alias);
}

export function computePoolPlan(before: PoolSnapshot, plan: PoolPlan): { next: PoolSnapshot; diff: PoolPlanDiff } {
  const next: PoolSnapshot = structuredClone(before);
  const beforeTotals = standingsByTeam(next);
  const diff: PoolPlanDiff = {
    merges: [],
    reactivated: [],
    added: [],
    classChanges: [],
    renames: [],
    dumont: null,
    blocked: [],
    standingsByTeamBefore: beforeTotals,
    standingsByTeamAfter: beforeTotals,
    standingsPointsBefore: totalPoints(beforeTotals),
    standingsPointsAfter: totalPoints(beforeTotals),
    standingsUnchanged: true,
  };

  for (const merge of plan.merges) {
    const keepId = readString(merge.keep?.id);
    if (!keepId) {
      diff.merges.push({ keepId: "", removeId: "", action: "skip", detail: "Merge is missing a keep id" });
      continue;
    }
    for (const remove of asArray(merge.remove)) {
      const removeId = isRecord(remove) ? readString(remove.id) : null;
      if (!removeId) {
        diff.merges.push({ keepId, removeId: "", action: "skip", detail: "Merge remove entry is missing an id" });
        continue;
      }
      if (removeId === keepId) {
        diff.merges.push({ keepId, removeId, action: "skip", detail: "Keep and remove are the same id" });
        continue;
      }
      const keep = findFighter(next, keepId);
      const removed = findFighter(next, removeId);
      if (!keep || !removed) {
        diff.merges.push({
          keepId,
          removeId,
          action: "skip",
          detail: !removed ? "Remove id is already gone" : "Keep id is missing",
        });
        continue;
      }
      const rostered = rosteredIds(next);
      const keepRostered = rostered.has(keepId);
      const removeRostered = rostered.has(removeId);
      mergeScores(next, keepId, removeId, keepRostered, removeRostered);
      mergeRefs(next, keepId, removeId);
      for (const alias of removed.aliases) addAlias(keep, alias);
      addAlias(keep, removed.name);
      keep.tapologyUrl = preferTapologyUrl(keep.tapologyUrl, readString(merge.copyTapologyUrl) ?? removed.tapologyUrl);
      if (readString(merge.setName)) applyDisplay(keep, readString(merge.setName), [keep.name]);
      if (readString(merge.setClassKey)) applyClass(keep, readString(merge.setClassKey) ?? "", null);
      if (keepRostered || removeRostered || merge.setActive === true) keep.active = true;
      else if (merge.setActive === false) keep.active = false;
      if (removed.record && !keep.record) keep.record = removed.record;
      next.fighters = next.fighters.filter((fighter) => fighter.id !== removeId);
      diff.merges.push({ keepId, removeId, action: "merge", detail: "Repointed roster, picks, scores, stat lines, and fight corners" });
    }
  }

  for (const change of plan.classChanges) {
    const id = readString(change.id);
    const to = readString(change.toClassKey);
    const fighter = findFighter(next, id) ?? findByName(next, change.name);
    if (!fighter || !to) {
      diff.classChanges.push({ id: id ?? "", from: null, to: to ?? "", action: "skip", detail: "Fighter or class is missing" });
      continue;
    }
    const from = fighter.classKey;
    if (from === to) {
      diff.classChanges.push({ id: fighter.id, from, to, action: "skip", detail: "Already in that class" });
      continue;
    }
    applyClass(fighter, to, readString(change.toWeightClass));
    diff.classChanges.push({ id: fighter.id, from, to, action: "change", detail: "Updated fighter class. Roster slot labels were left as drafted." });
  }

  for (const reactivation of plan.reactivations) {
    const name = readString(reactivation.name);
    const id = readString(reactivation.id);
    if (isBlocked(plan, name, id)) {
      diff.blocked.push({ name: name ?? id ?? "", id, action: "reactivate" });
      diff.reactivated.push({ id: id ?? "", name: name ?? "", action: "skip", detail: "Blocked. Left inactive." });
      continue;
    }
    const fighter = findFighter(next, id) ?? findByName(next, name);
    if (!fighter) {
      diff.reactivated.push({ id: id ?? "", name: name ?? "", action: "skip", detail: "Fighter is not in the pool" });
      continue;
    }
    const display = readString(reactivation.suggestedDisplayName) ?? readString(reactivation.setName);
    applyDisplay(fighter, display, [name, readString(reactivation.setName)]);
    if (readString(reactivation.classKey)) applyClass(fighter, readString(reactivation.classKey) ?? "", readString(reactivation.weightClass));
    fighter.tapologyUrl = preferTapologyUrl(fighter.tapologyUrl, readString(reactivation.copyTapologyUrl) ?? readString(reactivation.tapologyUrl));
    const wasActive = fighter.active;
    fighter.active = true;
    diff.reactivated.push({
      id: fighter.id,
      name: fighter.name,
      action: wasActive ? "update" : "reactivate",
      detail: wasActive ? "Already active" : "Marked active",
    });
  }

  for (const add of plan.adds) {
    const name = readString(add.name);
    if (!name) {
      diff.added.push({ id: null, name: "", action: "skip", detail: "Add is missing a name" });
      continue;
    }
    if (isBlocked(plan, name, null)) {
      diff.blocked.push({ name, id: null, action: "add" });
      diff.added.push({ id: null, name, action: "skip", detail: "Blocked. Not added." });
      continue;
    }
    const classKey = readString(add.classKey);
    const full = tapologyFullSlug(readString(add.tapologyUrl));
    const existing =
      (full ? next.fighters.find((fighter) => fighter.id === full || tapologyFullSlug(fighter.tapologyUrl) === full || tapologyFullSlug(fighter.id) === full) : undefined) ??
      findCompatibleName(next, plan, name, full);
    if (existing) {
      if (classKey) applyClass(existing, classKey, readString(add.weightClass));
      existing.tapologyUrl = preferTapologyUrl(existing.tapologyUrl, readString(add.tapologyUrl));
      existing.active = true;
      diff.added.push({ id: existing.id, name: existing.name, action: "update", detail: "Already in the pool" });
      continue;
    }
    if (!classKey || !isClassKey(classKey)) {
      diff.added.push({ id: null, name, action: "skip", detail: "Add is missing a draft class" });
      continue;
    }
    const id = full && !next.fighters.some((fighter) => fighter.id === full) ? full : unusedId(next, `${classKey}-${slugifyFighterName(name)}`);
    const created: PoolFighterState = {
      id,
      name,
      classKey,
      slotKey: CLASS_TO_SLOT[classKey],
      sex: classKey.startsWith("womens_") ? "women" : "men",
      weightClass: readString(add.weightClass) || CLASS_LABELS[classKey],
      active: true,
      tapologyUrl: readString(add.tapologyUrl),
      record: null,
      activityNotes: null,
      aliases: [],
    };
    next.fighters.push(created);
    diff.added.push({ id, name, action: "add", detail: "Inserted" });
  }

  for (const rename of plan.renames) {
    const id = readString(rename.id);
    const fighter = findFighter(next, id) ?? findByName(next, rename.from);
    if (!fighter) {
      diff.renames.push({ id: id ?? "", name: readString(rename.to) ?? "", aliases: [], action: "skip", detail: "Fighter is not in the pool" });
      continue;
    }
    const display = readString(rename.suggestedDisplayName) ?? readString(rename.to);
    applyDisplay(fighter, display, [readString(rename.from), readString(rename.to), readString(rename.alsoKnownAs)]);
    fighter.tapologyUrl = preferTapologyUrl(fighter.tapologyUrl, readString(rename.tapologyUrl));
    diff.renames.push({ id: fighter.id, name: fighter.name, aliases: [...fighter.aliases], action: "rename", detail: "Display name and aliases updated" });
  }

  for (const alias of plan.alreadyInPoolUnderAnotherName) {
    const reported = readString(alias.reportedAs);
    const poolName = readString(alias.poolName);
    if (!reported || !poolName) continue;
    const fighter = findByName(next, poolName) ?? findByName(next, reported);
    if (!fighter) continue;
    addAlias(fighter, reported);
    addAlias(fighter, poolName);
  }

  if (plan.dumont?.verdict === "confirmed_released" && plan.dumont.keepId) {
    const keep = findFighter(next, plan.dumont.keepId);
    if (keep) {
      keep.active = false;
      const date = plan.dumont.date ?? "2026-11-10";
      keep.activityNotes = `Released ${date}. Stays on the Season 5 roster.`;
      const rosterKept = next.rosterSlots.some((slot) => slot.fighterId === keep.id);
      diff.dumont = {
        keepId: keep.id,
        active: false,
        rosterKept,
        detail: "Inactive so she cannot be drafted. Roster slots and scores stay on the kept id.",
      };
    } else {
      diff.dumont = {
        keepId: plan.dumont.keepId,
        active: false,
        rosterKept: false,
        detail: "Keep id is missing",
      };
    }
  }

  const afterTotals = standingsByTeam(next);
  diff.standingsByTeamBefore = beforeTotals;
  diff.standingsByTeamAfter = afterTotals;
  diff.standingsPointsBefore = totalPoints(beforeTotals);
  diff.standingsPointsAfter = totalPoints(afterTotals);
  diff.standingsUnchanged = sameTotals(beforeTotals, afterTotals);
  return { next, diff };
}

function findCompatibleName(state: PoolSnapshot, plan: PoolPlan, name: string, incomingFull: string | null): PoolFighterState | undefined {
  const hits = state.fighters.filter((fighter) => fighterMatchesName(fighter, name));
  const compatible = hits.filter((fighter) => {
    const rowFull = tapologyFullSlug(fighter.tapologyUrl) ?? tapologyFullSlug(fighter.id);
    if (!incomingFull || !rowFull || incomingFull === rowFull) return true;
    const reserved = plan.reactivations.some((reactivation) => {
      if (reactivation.id !== fighter.id) return false;
      const reservedFull = tapologyFullSlug(reactivation.tapologyUrl) ?? tapologyFullSlug(reactivation.id);
      return reservedFull !== incomingFull;
    });
    // Luis Hernandez (MW, slug-only) and Luis Hernandez (LHW, numeric) share a trailing slug.
    return !reserved;
  });
  return compatible[0];
}

function unusedId(state: PoolSnapshot, base: string): string {
  if (!state.fighters.some((fighter) => fighter.id === base)) return base;
  let suffix = 2;
  while (state.fighters.some((fighter) => fighter.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function sameAliasSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].map((alias) => normalizeFighterName(alias)).sort();
  const sortedRight = [...right].map((alias) => normalizeFighterName(alias)).sort();
  return sortedLeft.every((alias, index) => alias === sortedRight[index]);
}
