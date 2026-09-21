import { notFound } from "next/navigation";
import { AdminPanel } from "@/components/admin-panel";
import { requireCommissioner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const { league } = await requireCommissioner(leagueId);
  const full = await prisma.league.findUnique({
    where: { id: league.id },
    include: {
      invites: { orderBy: { createdAt: "desc" } },
      memberships: { include: { user: true }, orderBy: { draftPosition: "asc" } },
    },
  });
  if (!full) notFound();

  return (
    <AdminPanel
      leagueId={full.id}
      leagueName={full.name}
      status={full.status}
      maxTeams={full.maxTeams}
      pickClockSeconds={full.pickClockSeconds}
      invites={full.invites.map((i) => ({
        id: i.id,
        token: i.token,
        revoked: i.revoked,
        createdAt: i.createdAt.toISOString(),
      }))}
      teams={full.memberships.map((m) => ({
        id: m.id,
        teamName: m.teamName,
        avatarUrl: m.avatarUrl,
        displayName: m.user.displayName,
        draftPosition: m.draftPosition,
      }))}
    />
  );
}
