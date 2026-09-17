import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer, SiteHeader } from "@/components/site-chrome";
import { StatusPill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TABS = [
  { href: "", label: "Lobby" },
  { href: "/draft", label: "Draft" },
  { href: "/roster", label: "My Team" },
  { href: "/standings", label: "Standings" },
  { href: "/scoring", label: "Scoring" },
];

export default async function LeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ leagueId: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { memberships: { where: { userId: user.id } } },
  });
  if (!league) notFound();
  const isMember = league.memberships.length > 0 || league.commissionerId === user.id;
  if (!isMember) notFound();
  const isCommissioner = league.commissionerId === user.id;
  const base = `/leagues/${leagueId}`;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={user} />
      <div className="border-b border-line bg-panel/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-mist">League</p>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl tracking-wide">{league.name}</h1>
              <StatusPill status={league.status} />
            </div>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm">
            {TABS.map((tab) => (
              <Link
                className="rounded-sm px-3 py-1.5 text-mist hover:bg-raised hover:text-paper"
                href={`${base}${tab.href}`}
                key={tab.href}
              >
                {tab.label}
              </Link>
            ))}
            {isCommissioner ? (
              <Link className="rounded-sm px-3 py-1.5 text-amber hover:bg-raised" href={`${base}/admin`}>
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <Footer />
    </div>
  );
}
