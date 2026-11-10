import { losAngelesDateKey } from "./upcoming-card";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const SEASON_5_START = "2026-07-01";
export const SEASON_5_END = "2026-12-31";

export type SeasonEvent = {
  date: Date;
  name?: string | null;
  source?: string | null;
  externalId?: string | null;
  /** Zero means a points-only seeded row, not a fight card. */
  fightCount?: number | null;
};

export type SeasonPhase =
  | { phase: "undated" }
  | { phase: "before"; label: string }
  | { phase: "during"; label: string }
  | { phase: "after"; label: string };

/** Noon UTC keeps the Los Angeles calendar day equal to the YYYY-MM-DD the commissioner picked. */
export function seasonInstant(isoDate: string): Date | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    losAngelesDateKey(date) !== isoDate
  ) {
    return null;
  }
  return date;
}

export function validateSeasonRange(
  startText: string,
  endText: string,
): { ok: true; start: Date; end: Date } | { ok: false; error: string } {
  const start = seasonInstant(startText.trim());
  const end = seasonInstant(endText.trim());
  if (!start || !end) return { ok: false, error: "Season dates must be real calendar dates." };
  if (end.getTime() <= start.getTime()) return { ok: false, error: "Season end must be after season start." };
  return { ok: true, start, end };
}

/**
 * Seeded baseline points are not a fight night. They stay in the season total
 * even when the event date is outside the window. A baseline is named that way,
 * or it is a score row with no bouts.
 */
export function isSeededBaseline(event: Pick<SeasonEvent, "name" | "source" | "externalId" | "fightCount">): boolean {
  if (event.fightCount === 0) return true;
  const haystack = `${event.name ?? ""} ${event.source ?? ""} ${event.externalId ?? ""}`.toLowerCase();
  return haystack.includes("baseline");
}

/**
 * Null season dates count every event. Otherwise the event's Los Angeles calendar
 * day must sit inside the inclusive window, or the event is the seeded baseline.
 */
export function eventCountsForSeason(
  event: SeasonEvent,
  seasonStart: Date | null | undefined,
  seasonEnd: Date | null | undefined,
): boolean {
  if (!seasonStart || !seasonEnd) return true;
  if (isSeededBaseline(event)) return true;
  const day = losAngelesDateKey(event.date);
  return day >= losAngelesDateKey(seasonStart) && day <= losAngelesDateKey(seasonEnd);
}

export function formatSeasonDate(isoDate: string): string {
  const instant = seasonInstant(isoDate);
  if (!instant) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(instant);
}

export function seasonPhase(now: Date, seasonStart: Date | null | undefined, seasonEnd: Date | null | undefined): SeasonPhase {
  if (!seasonStart || !seasonEnd) return { phase: "undated" };
  const today = losAngelesDateKey(now);
  const startKey = losAngelesDateKey(seasonStart);
  const endKey = losAngelesDateKey(seasonEnd);
  const startLabel = formatSeasonDate(startKey);
  const endLabel = formatSeasonDate(endKey);
  if (today < startKey) return { phase: "before", label: `Season starts ${startLabel}` };
  const label = `Season runs ${startLabel} – ${endLabel}`;
  if (today > endKey) return { phase: "after", label };
  return { phase: "during", label };
}

export type PodiumSpot<T> = { place: number; row: T };

/**
 * Competition ranking for the final podium. Ties share a place and the next
 * place skips (two teams tied for 1st, the next team is 3rd). Every team whose
 * place is 1, 2, or 3 is included, so a tie for 3rd lists every team on 3rd.
 */
export function seasonPodium<T extends { total: number }>(rows: T[]): PodiumSpot<T>[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const podium: PodiumSpot<T>[] = [];
  let index = 0;
  while (index < sorted.length) {
    const place = index + 1;
    if (place > 3) break;
    const total = sorted[index]?.total;
    while (index < sorted.length && sorted[index]?.total === total) {
      const row = sorted[index];
      if (row) podium.push({ place, row });
      index += 1;
    }
  }
  return podium;
}

export function placeLabel(place: number): string {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return `${place}th`;
}

export function seasonDateInputValue(value: Date | null | undefined): string {
  if (!value) return "";
  return losAngelesDateKey(value);
}
