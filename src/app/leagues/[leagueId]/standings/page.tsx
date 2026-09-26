import { notFound } from "next/navigation";
import { FightingThisWeekPanel } from "@/components/fighting-this-week";
import { TeamAvatar } from "@/components/team-avatar";
import { requireUser } from "@/lib/auth";
import { getFightingThisWeek } from "@/lib/fighting-this-week";
import { getStandings } from "@/lib/standings";
import { SLOT_SHORT, type RosterSlotKey } from "@/lib/slots";

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  await requireUser();
  const { leagueId } = await params;
  const data = await getStandings(leagueId);
  if (!data) notFound();
  const fighting = await getFightingThisWeek(
    data.rows.map((row) => ({
      membershipId: row.membershipId,
      teamName: row.teamName,
      avatarUrl: row.avatarUrl,
      fighters: row.roster.map((slot) => ({
        id: slot.fighter.id,
        name: slot.fighter.name,
        weightClass: slot.fighter.weightClass,
        nextBoutJson: slot.fighter.nextBoutJson,
      })),
    })),
  );

  return (
    <div className="space-y-6">
      <FightingThisWeekPanel data={fighting} />
      <section className="rounded-md border border-line bg-panel p-5">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-3xl tracking-wide">Standings</h2>
          <p className="text-xs text-mist">
            {data.latestEventDate
              ? `Last scored event ${new Date(data.latestEventDate).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}`
              : "No events scored yet — totals sit at 0 until the Sunday job or admin trigger."}
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-[0.16em] text-mist">
            <tr>
              <th className="py-2">Rank</th>
              <th>Team</th>
              <th className="text-right">Last event</th>
              <th className="text-right">Season</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr className="border-t border-line/70" key={row.membershipId}>
                <td className="py-3 font-display text-lg text-amber">{row.rank}</td>
                <td>
                  <div className="flex items-center gap-3">
                    <TeamAvatar avatarUrl={row.avatarUrl} name={row.teamName} />
                    <div>
                      <div className="font-medium">{row.teamName}</div>
                      <div className="text-xs text-mist">{row.displayName}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right tabular-nums text-mist">{row.lastEvent.toFixed(1)}</td>
                <td className="text-right font-display text-xl tabular-nums">{row.total.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {data.rows.map((row) => (
        <section className="rounded-md border border-line bg-panel p-5" key={`${row.membershipId}-roster`}>
          <h3 className="flex items-center gap-3 font-display text-xl tracking-wide">
            <TeamAvatar avatarUrl={row.avatarUrl} name={row.teamName} />
            <span>
              {row.teamName} <span className="text-mist">roster breakdown</span>
            </span>
          </h3>
          {row.roster.length === 0 ? (
            <p className="mt-2 text-sm text-mist">No fighters drafted yet.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {row.roster.map((slot) => (
                <li className="rounded-sm border border-line bg-ink px-3 py-2 text-sm" key={slot.slot}>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-amber">
                    {SLOT_SHORT[slot.slot as RosterSlotKey] ?? slot.slot}
                  </div>
                  <div>{slot.fighter.name}</div>
                  <div className="text-xs text-mist">
                    {slot.total.toFixed(1)} season · {slot.lastEvent.toFixed(1)} last event
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
