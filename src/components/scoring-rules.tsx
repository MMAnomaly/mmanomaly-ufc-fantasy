import { DK_CLASSIC } from "@/lib/scoring";
import { SLOT_LABELS, ALL_SLOTS } from "@/lib/slots";

export function ScoringRules() {
  return (
    <div className="space-y-8">
      <section className="rounded-md border border-line bg-panel p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-amber">Scoring based on DraftKings Classic MMA</p>
        <h1 className="mt-1 font-display text-3xl tracking-wide">How points land</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist">
          MMAnomaly is not affiliated with DraftKings or UFC. Values below follow the post-2021 DraftKings Classic MMA
          consensus used by this league.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="font-display text-xl">Moves (both fighters)</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Strike</span>
                <span className="text-amber">+{DK_CLASSIC.strike}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Significant strike (additional)</span>
                <span className="text-amber">+{DK_CLASSIC.significantStrikeAdditional}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Control time (per second)</span>
                <span className="text-amber">+{DK_CLASSIC.controlTimePerSecond}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Takedown</span>
                <span className="text-amber">+{DK_CLASSIC.takedown}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Reversal / sweep</span>
                <span className="text-amber">+{DK_CLASSIC.reversal}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Knockdown</span>
                <span className="text-amber">+{DK_CLASSIC.knockdown}</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-mist">
              A significant strike counts as a strike plus the SS bonus (0.4 total). Losers still earn move points.
            </p>
          </div>
          <div>
            <h2 className="font-display text-xl">Win bonuses (winner only)</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Round 1 finish</span>
                <span className="text-amber">+{DK_CLASSIC.round1Finish}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Round 2 finish</span>
                <span className="text-amber">+{DK_CLASSIC.round2Finish}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Round 3 finish</span>
                <span className="text-amber">+{DK_CLASSIC.round3Finish}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Round 4 / 5 finish</span>
                <span className="text-amber">+{DK_CLASSIC.round4Finish}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Decision win</span>
                <span className="text-amber">+{DK_CLASSIC.decisionWin}</span>
              </li>
              <li className="flex justify-between border-b border-line/70 py-1">
                <span>Quick win (R1 finish ≤ 60s)</span>
                <span className="text-amber">+{DK_CLASSIC.quickWin}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
      <section className="rounded-md border border-line bg-panel p-5">
        <h2 className="font-display text-xl">Roster (13 slots)</h2>
        <ul className="mt-3 columns-1 gap-x-8 text-sm sm:columns-2">
          {ALL_SLOTS.map((slot) => (
            <li className="border-b border-line/60 py-1" key={slot}>
              {SLOT_LABELS[slot]}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mist">
          Flex can be any weight class. Every fighter is unique in the league — no duplicate IDs.
        </p>
      </section>
    </div>
  );
}
