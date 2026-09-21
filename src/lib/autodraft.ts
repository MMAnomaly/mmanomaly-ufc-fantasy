import {
  deadlineFrom,
  isPickExpired,
  openSlotsForTeam,
  snakeDraftPosition,
  totalPicks,
} from "./draft";
import { fighterFitsSlot, isFlexSlot, isRosterSlot } from "./slots";

/**
 * Best-available autodraft.
 *
 * Quality signal is the Tapology division rank already stored on Fighter.rankingJson
 * (`{ rank: "C" | "1" | "2" | ... | null }`). Nothing new is written to the database.
 *
 * Order (best first):
 * 1. Division rank — champion ("C") = 0, then 1, 2, 3… Missing / null ranks are last.
 *    Ranks are compared across divisions as stored.
 * 2. More recent Fighter.lastFightDate (nulls last).
 * 3. Name A→Z, then fighter id.
 *
 * Slot:
 * The best active, undrafted fighter who fits an open slot is chosen. If their
 * weight-class slot is still open, they fill that slot. Flex is used only when
 * that fighter does not match a remaining dedicated slot (or only Flex is open).
 */
export type PickFighter = {
  id: string;
  name: string;
  slotKey: string;
  active: boolean;
  rankingJson?: string | null;
  lastFightDate?: Date | null;
};

export type DraftSnapshot = {
  status: string;
  currentPickIndex: number;
  pickDeadline: Date | null;
  pickClockSeconds: number;
  teamCount: number;
  onTheClockMembershipId: string | null;
  onTheClockDraftPosition: number | null;
  /** Slots already filled by the team on the clock, not the whole league. */
  filledSlots: string[];
  takenFighterIds: string[];
};

const UNRANKED = Number.POSITIVE_INFINITY;

export function rankValue(rankingJson?: string | null): number {
  if (!rankingJson) return UNRANKED;
  try {
    const parsed = JSON.parse(rankingJson) as { rank?: unknown };
    const rank = parsed.rank;
    if (typeof rank === "number" && Number.isFinite(rank) && rank > 0) return rank;
    if (typeof rank === "string") {
      const trimmed = rank.trim();
      if (trimmed.toUpperCase() === "C") return 0;
      if (/^[0-9]+$/.test(trimmed)) {
        const value = Number(trimmed);
        return value > 0 ? value : UNRANKED;
      }
    }
  } catch {
    return UNRANKED;
  }
  return UNRANKED;
}

function fightTime(value: Date | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** Negative when `a` should be drafted before `b`. */
export function compareBestAvailable(a: PickFighter, b: PickFighter): number {
  const aRank = rankValue(a.rankingJson);
  const bRank = rankValue(b.rankingJson);
  if (aRank !== bRank) {
    if (aRank === UNRANKED) return 1;
    if (bRank === UNRANKED) return -1;
    return aRank - bRank;
  }
  const timeDiff = fightTime(b.lastFightDate) - fightTime(a.lastFightDate);
  if (timeDiff !== 0) return timeDiff;
  const name = a.name.localeCompare(b.name, "en");
  if (name !== 0) return name;
  return a.id.localeCompare(b.id, "en");
}

export function chooseAutoPick(args: {
  fighters: PickFighter[];
  takenIds: Iterable<string>;
  openSlots: string[];
}): { fighterId: string; slot: string } | null {
  const taken = new Set(args.takenIds);
  const positional = new Set(args.openSlots.filter((slot) => !isFlexSlot(slot)));
  const flexSlot = args.openSlots.find((slot) => isFlexSlot(slot)) ?? null;
  const eligible = args.fighters.filter((fighter) => {
    if (!fighter.active || taken.has(fighter.id)) return false;
    if (positional.has(fighter.slotKey)) return true;
    return flexSlot != null;
  });
  if (eligible.length === 0) return null;
  const best = [...eligible].sort(compareBestAvailable)[0];
  if (!best) return null;
  if (positional.has(best.slotKey)) return { fighterId: best.id, slot: best.slotKey };
  if (!flexSlot) return null;
  return { fighterId: best.id, slot: flexSlot };
}

export function evaluateCommittedPick(
  draft: DraftSnapshot,
  args: {
    now: Date;
    expectedIndex: number;
    membershipId: string;
    membershipDraftPosition: number;
    fighter: PickFighter | null;
    slot: string;
    autoPick: boolean;
    requireExpired: boolean;
  },
):
  | {
      ok: true;
      pickNumber: number;
      nextIndex: number;
      nextStatus: "DRAFTING" | "IN_SEASON";
      nextDeadline: Date | null;
    }
  | { ok: false; reason: string } {
  if (!isRosterSlot(args.slot)) return { ok: false, reason: "Invalid roster slot." };
  if (draft.status !== "DRAFTING") return { ok: false, reason: "Draft is not live." };
  if (draft.teamCount < 1 || args.expectedIndex >= totalPicks(draft.teamCount)) {
    return { ok: false, reason: "Draft is complete." };
  }
  if (args.expectedIndex !== draft.currentPickIndex) {
    return { ok: false, reason: "Pick already processed." };
  }
  if (args.requireExpired && !isPickExpired(draft.pickDeadline, args.now)) {
    return { ok: false, reason: "Pick clock has not expired." };
  }

  let expectedPosition: number;
  try {
    expectedPosition = snakeDraftPosition(args.expectedIndex, draft.teamCount);
  } catch {
    return { ok: false, reason: "It is not this team's turn." };
  }
  if (
    args.membershipDraftPosition !== expectedPosition ||
    args.membershipId !== draft.onTheClockMembershipId
  ) {
    return { ok: false, reason: "It is not this team's turn." };
  }
  if (draft.filledSlots.includes(args.slot)) {
    return { ok: false, reason: "That roster slot is already filled." };
  }
  if (!args.fighter || !args.fighter.active) return { ok: false, reason: "Fighter not available." };
  if (!fighterFitsSlot(args.fighter.slotKey, args.slot)) {
    return { ok: false, reason: "Fighter does not fit that roster slot." };
  }
  if (draft.takenFighterIds.includes(args.fighter.id)) {
    return { ok: false, reason: "That fighter is already drafted." };
  }

  const nextIndex = args.expectedIndex + 1;
  const done = nextIndex >= totalPicks(draft.teamCount);
  return {
    ok: true,
    pickNumber: args.expectedIndex + 1,
    nextIndex,
    nextStatus: done ? "IN_SEASON" : "DRAFTING",
    nextDeadline: done ? null : deadlineFrom(args.now, draft.pickClockSeconds),
  };
}

export type PreparedAutoPick =
  | { action: "idle" }
  | { action: "error"; reason: string }
  | {
      action: "pick";
      fighterId: string;
      slot: string;
      membershipId: string;
      pickNumber: number;
      nextIndex: number;
      nextStatus: "DRAFTING" | "IN_SEASON";
      nextDeadline: Date | null;
    };

/** What the server should write when the stored deadline has passed. */
export function prepareAutoPick(draft: DraftSnapshot, fighters: PickFighter[], now: Date): PreparedAutoPick {
  if (draft.status !== "DRAFTING") return { action: "idle" };
  if (!isPickExpired(draft.pickDeadline, now)) return { action: "idle" };
  if (!draft.onTheClockMembershipId || draft.onTheClockDraftPosition == null) return { action: "idle" };

  const choice = chooseAutoPick({
    fighters,
    takenIds: draft.takenFighterIds,
    openSlots: openSlotsForTeam(draft.filledSlots),
  });
  if (!choice) return { action: "error", reason: "No eligible fighters remain for auto-pick." };

  const fighter = fighters.find((candidate) => candidate.id === choice.fighterId) ?? null;
  const decision = evaluateCommittedPick(draft, {
    now,
    expectedIndex: draft.currentPickIndex,
    membershipId: draft.onTheClockMembershipId,
    membershipDraftPosition: draft.onTheClockDraftPosition,
    fighter,
    slot: choice.slot,
    autoPick: true,
    requireExpired: true,
  });
  if (!decision.ok) return { action: "error", reason: decision.reason };
  return {
    action: "pick",
    fighterId: choice.fighterId,
    slot: choice.slot,
    membershipId: draft.onTheClockMembershipId,
    pickNumber: decision.pickNumber,
    nextIndex: decision.nextIndex,
    nextStatus: decision.nextStatus,
    nextDeadline: decision.nextDeadline,
  };
}

/** Applies evaluateCommittedPick to a snapshot. Tests use this under a lock to model the DB transaction. */
export function commitEvaluatedPick(
  draft: DraftSnapshot,
  args: {
    now: Date;
    expectedIndex: number;
    membershipId: string;
    membershipDraftPosition: number;
    fighter: PickFighter | null;
    slot: string;
    autoPick: boolean;
    requireExpired: boolean;
  },
): { ok: true; draft: DraftSnapshot; pickNumber: number } | { ok: false; reason: string } {
  const decision = evaluateCommittedPick(draft, args);
  if (!decision.ok) return decision;
  if (!args.fighter) return { ok: false, reason: "Fighter not available." };
  return {
    ok: true,
    pickNumber: decision.pickNumber,
    draft: {
      ...draft,
      currentPickIndex: decision.nextIndex,
      status: decision.nextStatus,
      pickDeadline: decision.nextDeadline,
      filledSlots: [...draft.filledSlots, args.slot],
      takenFighterIds: [...draft.takenFighterIds, args.fighter.id],
    },
  };
}
