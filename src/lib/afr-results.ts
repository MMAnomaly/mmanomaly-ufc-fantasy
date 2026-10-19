import type { ParsedEvent, ParsedFight, ParsedStatLine } from "./ufcstats";

export class AfrImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AfrImportError";
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Event calendar date at 12:00 UTC. Invalid calendar days are rejected. */
export function eventDateAtNoonUtc(isoDate: string): Date {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new AfrImportError("Results event.date must be YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== 12
  ) {
    throw new AfrImportError("Results event.date must be YYYY-MM-DD");
  }
  return date;
}

/**
 * Map an Active Fighter Repository results file into the ingest `ParsedEvent`.
 * Bout corners come from `fighters` (red, then blue). `fighters_listed_on_card`
 * is ignored because that list is sometimes mislabeled.
 */
export function parseAfrResults(data: unknown): ParsedEvent {
  if (!isRecord(data)) throw new AfrImportError("Results file must be an object");
  if (!isRecord(data.event)) throw new AfrImportError("Results file is missing event");

  const name = readString(data.event.short_name);
  if (!name) throw new AfrImportError("Results event.short_name is required");
  const dateText = readString(data.event.date);
  if (!dateText) throw new AfrImportError("Results event.date must be YYYY-MM-DD");
  const date = eventDateAtNoonUtc(dateText);
  const externalId = readString(data.event.ufcstats_url) ?? readString(data.event.ufc_url);
  if (!externalId) throw new AfrImportError("Results event needs ufcstats_url or ufc_url");
  if (!Array.isArray(data.bouts)) throw new AfrImportError("Results file is missing bouts");

  const ordered = data.bouts.map((bout, index) => ({ bout, index }));
  ordered.sort((a, b) => {
    const byOrder = boutOrder(a.bout, a.index) - boutOrder(b.bout, b.index);
    return byOrder !== 0 ? byOrder : a.index - b.index;
  });

  const fights: ParsedFight[] = ordered.map(({ bout }) => parseBout(bout));

  return {
    externalId,
    url: externalId,
    name,
    date,
    source: "afr-ufcstats",
    fights,
  };
}

function boutOrder(bout: unknown, index: number): number {
  if (!isRecord(bout) || typeof bout.bout_order !== "number" || !Number.isFinite(bout.bout_order)) {
    return index;
  }
  return bout.bout_order;
}

function parseBout(bout: unknown): ParsedFight {
  if (!isRecord(bout)) throw new AfrImportError("Each bout must be an object");
  if (!Array.isArray(bout.fighters) || bout.fighters.length === 0) {
    throw new AfrImportError("Each bout needs a fighters array");
  }

  const fighters = bout.fighters.map((fighter) => {
    if (!isRecord(fighter)) throw new AfrImportError("Each bout fighter must be an object");
    const fighterName = readString(fighter.name);
    if (!fighterName) throw new AfrImportError("Each bout fighter needs a name");
    return { fighter, fighterName };
  });

  const winner = fighters.find((entry) => entry.fighter.result === "W");
  const stats: ParsedStatLine[] = fighters.map(({ fighter, fighterName }) => ({
    fighterName,
    knockdowns: readNumber(fighter.knockdowns),
    strikes: readNumber(fighter.total_strikes_landed),
    sigStrikes: readNumber(fighter.sig_strikes_landed),
    takedowns: readNumber(fighter.takedowns_landed),
    reversals: readNumber(fighter.reversals),
    controlTimeSeconds: readNumber(fighter.control_time_seconds),
    isWinner: fighter.result === "W",
  }));

  const round =
    typeof bout.end_round === "number" && Number.isFinite(bout.end_round) ? bout.end_round : null;

  return {
    fighter1Name: fighters[0]?.fighterName ?? "Unknown",
    fighter2Name: fighters[1]?.fighterName ?? "Unknown",
    winnerName: winner?.fighterName ?? null,
    method: readString(bout.method),
    round,
    time: readString(bout.end_time),
    weightClass: readString(bout.weight_class),
    stats,
  };
}
