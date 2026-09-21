import { ALL_SLOTS, fighterFitsSlot, ROSTER_SIZE, type RosterSlotKey } from "./slots";

export const MIN_TEAMS = 4;
export const MAX_TEAMS = 12;
export const DEFAULT_TEAMS = 8;
/** Default on-the-clock window. Leagues may override between 15 and 300 seconds. */
export const DEFAULT_PICK_CLOCK = 120;
export const MIN_START_TEAMS = 2;

/** True when the server clock has reached the stored deadline (client clocks are display-only). */
export function isPickExpired(deadline: Date | null | undefined, now: Date): boolean {
  if (!deadline) return false;
  return now.getTime() >= deadline.getTime();
}

export function deadlineFrom(now: Date, pickClockSeconds: number): Date {
  return new Date(now.getTime() + pickClockSeconds * 1000);
}

/** 0-based overall pick index → 1-based snake draft position. */
export function snakeDraftPosition(pickIndex: number, teamCount: number): number {
  if (teamCount < 1) throw new Error("teamCount must be >= 1");
  const round = Math.floor(pickIndex / teamCount);
  const posInRound = pickIndex % teamCount;
  return round % 2 === 0 ? posInRound + 1 : teamCount - posInRound;
}

export function totalPicks(teamCount: number): number {
  return teamCount * ROSTER_SIZE;
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function openSlotsForTeam(filled: string[]): RosterSlotKey[] {
  const taken = new Set(filled);
  return ALL_SLOTS.filter((slot) => !taken.has(slot));
}

export function eligibleSlotsForFighter(slotKey: string, openSlots: string[]): RosterSlotKey[] {
  return openSlots.filter((slot) => fighterFitsSlot(slotKey, slot)) as RosterSlotKey[];
}

export function firstEligibleSlot(slotKey: string, openSlots: string[]): RosterSlotKey | null {
  const match = eligibleSlotsForFighter(slotKey, openSlots);
  return match[0] ?? null;
}

export function neededClassKeys(openSlots: string[]): string[] | "all" {
  const positional = openSlots.filter((s) => !s.startsWith("FLEX"));
  const hasFlex = openSlots.some((s) => s.startsWith("FLEX"));
  if (hasFlex) return "all";
  return positional;
}
