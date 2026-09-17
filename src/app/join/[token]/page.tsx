import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinForm } from "@/components/join-form";
import { Card } from "@/components/ui";
import { Footer, SiteHeader } from "@/components/site-chrome";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { league: { include: { memberships: true } } },
  });
  if (!invite || invite.revoked) notFound();
  const user = await getSession();
  const already = user ? invite.league.memberships.some((m) => m.userId === user.id) : false;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={user} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12">
        <Card>
          <p className="text-[11px] uppercase tracking-[0.22em] text-amber">Invite only</p>
          <h1 className="mt-2 font-display text-3xl tracking-wide">{invite.league.name}</h1>
          <p className="mt-2 text-sm text-mist">
            {invite.league.memberships.length}/{invite.league.maxTeams} teams · {invite.league.status}
          </p>
          {already ? (
            <Link className="mt-6 inline-block text-amber" href={`/leagues/${invite.leagueId}`}>
              You are already in — open lobby
            </Link>
          ) : user ? (
            <div className="mt-6">
              <JoinForm token={token} defaultTeamName={`${user.displayName}'s squad`} />
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              <Link
                className="rounded-sm bg-blood px-4 py-2 text-center font-semibold text-white hover:bg-blood-dim"
                href={`/register?invite=${token}`}
              >
                Register and join
              </Link>
              <Link className="rounded-sm border border-line px-4 py-2 text-center hover:border-amber" href={`/login?invite=${token}`}>
                I already have an account
              </Link>
            </div>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
