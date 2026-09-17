import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Footer, SiteHeader } from "@/components/site-chrome";
import { StatusPill } from "@/components/ui";

export default async function HomePage() {
  const user = await getSession();
  const leagues = user
    ? await prisma.membership.findMany({
        where: { userId: user.id },
        include: { league: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={user} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10">
        <section className="max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.28em] text-amber">Fight week is a lifestyle</p>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-wide sm:text-6xl">
            Private UFC fantasy.
            <span className="block text-blood">Snake draft. Classic scoring.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-mist">
            MMAnomaly runs invite-only season leagues: 13-man rosters, unique fighters, and scoring based on
            DraftKings Classic MMA.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {user ? (
              <Link
                className="rounded-sm bg-blood px-4 py-2 font-semibold text-white hover:bg-blood-dim"
                href="/leagues/new"
              >
                Create a league
              </Link>
            ) : (
              <>
                <Link
                  className="rounded-sm bg-blood px-4 py-2 font-semibold text-white hover:bg-blood-dim"
                  href="/register"
                >
                  Register to commissioner
                </Link>
                <Link className="rounded-sm border border-line px-4 py-2 hover:border-amber" href="/login">
                  Log in
                </Link>
              </>
            )}
            <Link className="rounded-sm border border-line px-4 py-2 hover:border-amber" href="/rules">
              Scoring rules
            </Link>
          </div>
        </section>

        {user && (
          <section>
            <h2 className="font-display text-2xl tracking-wide">Your leagues</h2>
            {leagues.length === 0 ? (
              <p className="mt-3 text-sm text-mist">No memberships yet. Create a league or use an invite link.</p>
            ) : (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {leagues.map((m) => (
                  <li key={m.id}>
                    <Link
                      className="flex items-center justify-between rounded-md border border-line bg-panel px-4 py-4 hover:border-amber"
                      href={`/leagues/${m.leagueId}`}
                    >
                      <div>
                        <div className="font-display text-xl tracking-wide">{m.league.name}</div>
                        <div className="text-xs text-mist">{m.teamName}</div>
                      </div>
                      <StatusPill status={m.league.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
