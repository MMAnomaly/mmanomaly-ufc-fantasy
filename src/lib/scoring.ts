/** DraftKings Classic MMA (post-2021) point values. */
export const DK_CLASSIC = {
  strike: 0.2,
  significantStrikeAdditional: 0.2,
  controlTimePerSecond: 0.03,
  takedown: 5,
  reversal: 5,
  knockdown: 10,
  round1Finish: 90,
  round2Finish: 70,
  round3Finish: 45,
  round4Finish: 40,
  round5Finish: 40,
  decisionWin: 30,
  quickWin: 25,
} as const;

export type ScoreInput = {
  strikes: number;
  sigStrikes: number;
  controlTimeSeconds: number;
  takedowns: number;
  reversals: number;
  knockdowns: number;
  isWinner: boolean;
  method?: string | null;
  round?: number | null;
  timeSecondsInRound?: number | null;
};

export type ScoreBreakdown = {
  strikes: number;
  significantStrikes: number;
  controlTime: number;
  takedowns: number;
  reversals: number;
  knockdowns: number;
  winBonus: number;
  quickWinBonus: number;
  total: number;
};

export function parseClockToSeconds(clock: string | null | undefined): number | null {
  if (!clock) return null;
  const trimmed = clock.trim();
  const match = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isDecisionMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  const n = method.toLowerCase();
  return (
    n.includes("decision") ||
    n.includes("u-dec") ||
    n.includes("s-dec") ||
    n.includes("m-dec") ||
    n.includes("unanimous") ||
    n.includes("split") ||
    n.includes("majority")
  );
}

export function isFinishMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  if (isDecisionMethod(method)) return false;
  const n = method.toLowerCase();
  if (n.includes("no contest") || n.includes("nc") || n.includes("draw") || n.includes("overturned")) {
    return false;
  }
  return true;
}

export function winBonusFor(input: ScoreInput): { winBonus: number; quickWinBonus: number } {
  if (!input.isWinner) return { winBonus: 0, quickWinBonus: 0 };
  if (isDecisionMethod(input.method)) {
    return { winBonus: DK_CLASSIC.decisionWin, quickWinBonus: 0 };
  }
  if (!isFinishMethod(input.method)) {
    return { winBonus: 0, quickWinBonus: 0 };
  }
  const round = input.round ?? 3;
  let winBonus = 0;
  if (round <= 1) winBonus = DK_CLASSIC.round1Finish;
  else if (round === 2) winBonus = DK_CLASSIC.round2Finish;
  else if (round === 3) winBonus = DK_CLASSIC.round3Finish;
  else winBonus = DK_CLASSIC.round4Finish;

  const quick =
    round <= 1 &&
    input.timeSecondsInRound != null &&
    input.timeSecondsInRound <= 60
      ? DK_CLASSIC.quickWin
      : 0;
  return { winBonus, quickWinBonus: quick };
}

export function computeDkClassicPoints(input: ScoreInput): ScoreBreakdown {
  const strikes = round2(input.strikes * DK_CLASSIC.strike);
  const significantStrikes = round2(input.sigStrikes * DK_CLASSIC.significantStrikeAdditional);
  const controlTime = round2(input.controlTimeSeconds * DK_CLASSIC.controlTimePerSecond);
  const takedowns = round2(input.takedowns * DK_CLASSIC.takedown);
  const reversals = round2(input.reversals * DK_CLASSIC.reversal);
  const knockdowns = round2(input.knockdowns * DK_CLASSIC.knockdown);
  const { winBonus, quickWinBonus } = winBonusFor(input);
  const total = round2(
    strikes +
      significantStrikes +
      controlTime +
      takedowns +
      reversals +
      knockdowns +
      winBonus +
      quickWinBonus,
  );
  return {
    strikes,
    significantStrikes,
    controlTime,
    takedowns,
    reversals,
    knockdowns,
    winBonus,
    quickWinBonus,
    total,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
