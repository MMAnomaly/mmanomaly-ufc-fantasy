import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import type { ParsedEvent, ParsedFight } from "./ufcstats";

export type SampleEventFile = {
  name: string;
  date: string;
  externalId: string;
  source?: string;
  fights: {
    fighter1: {
      name: string;
      knockdowns: number;
      strikes: number;
      sigStrikes: number;
      takedowns: number;
      reversals: number;
      controlTime: string;
      winner: boolean;
    };
    fighter2: {
      name: string;
      knockdowns: number;
      strikes: number;
      sigStrikes: number;
      takedowns: number;
      reversals: number;
      controlTime: string;
      winner: boolean;
    };
    method: string;
    round: number;
    time: string;
  }[];
};

function toLine(
  f: SampleEventFile["fights"][number]["fighter1"],
): ParsedFight["stats"][number] {
  const [mm, ss] = f.controlTime.split(":").map(Number);
  return {
    fighterName: f.name,
    knockdowns: f.knockdowns,
    strikes: f.strikes,
    sigStrikes: f.sigStrikes,
    takedowns: f.takedowns,
    reversals: f.reversals,
    controlTimeSeconds: (mm || 0) * 60 + (ss || 0),
    isWinner: f.winner,
  };
}

export function loadSampleEvent(): ParsedEvent {
  const file = path.join(process.cwd(), "data", "sample-event.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as SampleEventFile;
  return {
    externalId: raw.externalId,
    name: raw.name,
    date: new Date(raw.date),
    source: raw.source ?? "sample-fixture",
    fights: raw.fights.map((fight) => ({
      fighter1Name: fight.fighter1.name,
      fighter2Name: fight.fighter2.name,
      winnerName: fight.fighter1.winner
        ? fight.fighter1.name
        : fight.fighter2.winner
          ? fight.fighter2.name
          : null,
      method: fight.method,
      round: fight.round,
      time: fight.time,
      stats: [toLine(fight.fighter1), toLine(fight.fighter2)],
    })),
  };
}

export async function recentScoringJobs(limit = 8) {
  return prisma.scoringJob.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { event: true },
  });
}
