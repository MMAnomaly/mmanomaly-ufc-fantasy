import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteLink } from "@/components/invite-link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function LeagueLobbyPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      memberships: { include: { user: true }, orderBy: { draftPosition: "asc" } },
      invites: { where: { revoked: false }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!league) notFound();
  const isCommissioner = league.commissionerId === user.id;
  const invite = league.invites[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-md border border-line bg-panel p-5">
        <h2 className="font-display text-2xl tracking-wide">Locker room</h2>
        <p className="mt-1 text-sm text-mist">
          {league.memberships.length}/{league.maxTeams} teams · pick clock {league.pickClockSeconds}s
        </p>
        <ol className="mt-4 divide-y divide-line">
          {league.memberships.map((m) => (
            <li className="flex items-center justify-between py-3" key={m.id}>
              <div>
                <div className="font-medium">{m.teamName}</div>
                <div className="text-xs text-mist">
                  {m.user.displayName}
                  {m.userId === league.commissionerId ? " · commissioner" : ""}
                </div>
              </div>
              <span className="font-display text-amber">#{m.draftPosition || "—"}</span>
            </li>
          ))}
        </ol>
      </section>
      <aside className="space-y-4">
        <section className="rounded-md border border-line bg-panel p-5">
          <h2 className="font-display text-xl tracking-wide">Invite</h2>
          {isCommissioner && invite ? (
            <div className="mt-3">
              <InviteLink token={invite.token} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-mist">
              {isCommissioner ? "Create an invite from Admin." : "Ask your commissioner for a link."}
            </p>
          )}
        </section>
        <section className="rounded-md border border-line bg-panel p-5 text-sm text-mist">
          Draft is snake order, 13 rounds. On your turn pick any open slot — more like fantasy football than a forced
          queue. Fighters are unique league-wide.
          <div className="mt-4">
            <Link className="text-amber" href={`/leagues/${leagueId}/draft`}>
              Open draft room →
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
