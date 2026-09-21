import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamAvatar } from "@/components/team-avatar";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALL_SLOTS, SLOT_LABELS, type RosterSlotKey } from "@/lib/slots";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  const membership = await prisma.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
    include: {
      roster: { include: { fighter: true } },
      league: true,
    },
  });
  if (!membership) notFound();

  const bySlot = new Map(membership.roster.map((r) => [r.slot, r]));
  const fighterIds = membership.roster.map((r) => r.fighterId);
  const scores = fighterIds.length
    ? await prisma.fantasyScore.findMany({ where: { fighterId: { in: fighterIds } } })
    : [];
  const pointsFor = (fighterId: string) =>
    Math.round(scores.filter((s) => s.fighterId === fighterId).reduce((sum, s) => sum + s.points, 0) * 100) /
    100;

  return (
    <div className="rounded-md border border-line bg-panel p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <TeamAvatar avatarUrl={membership.avatarUrl} name={membership.teamName} size="lg" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-mist">Roster</p>
            <h2 className="font-display text-3xl tracking-wide">{membership.teamName}</h2>
            <Link className="text-sm text-amber" href={`/leagues/${leagueId}/settings`}>
              Team settings
            </Link>
          </div>
        </div>
        <p className="text-sm text-mist">{membership.roster.length}/13 filled</p>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-[11px] uppercase tracking-[0.16em] text-mist">
          <tr>
            <th className="py-2">Slot</th>
            <th>Fighter</th>
            <th>Class</th>
            <th className="text-right">Season pts</th>
          </tr>
        </thead>
        <tbody>
          {ALL_SLOTS.map((slot) => {
            const row = bySlot.get(slot);
            return (
              <tr className="border-t border-line/70" key={slot}>
                <td className="py-2 text-amber">{SLOT_LABELS[slot as RosterSlotKey]}</td>
                <td>{row?.fighter.name ?? <span className="text-mist">Empty</span>}</td>
                <td className="text-mist">{row?.fighter.weightClass ?? "—"}</td>
                <td className="text-right tabular-nums">{row ? pointsFor(row.fighterId) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
