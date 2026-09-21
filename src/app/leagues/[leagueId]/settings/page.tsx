import { notFound } from "next/navigation";
import { TeamAvatarForm, TeamNameForm } from "@/components/team-settings-form";
import { requireUser } from "@/lib/auth";
import { avatarUploadMode } from "@/lib/avatar-store";
import { prisma } from "@/lib/prisma";

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  const membership = await prisma.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl tracking-wide">Team settings</h2>
        <p className="mt-1 text-sm text-mist">Only you can change this team’s name and picture.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-md border border-line bg-panel p-5">
        <h2 className="font-display text-2xl tracking-wide">Team name</h2>
        <p className="mt-1 text-sm text-mist">2–32 characters. Unique in this league, ignoring case.</p>
        <div className="mt-4">
          <TeamNameForm leagueId={leagueId} teamName={membership.teamName} />
        </div>
      </section>
      <section className="rounded-md border border-line bg-panel p-5">
        <h2 className="font-display text-2xl tracking-wide">Display picture</h2>
        <p className="mt-1 text-sm text-mist">JPEG, PNG, or WebP up to 2MB, or a public image URL.</p>
        <div className="mt-4">
          <TeamAvatarForm
            avatarUrl={membership.avatarUrl}
            leagueId={leagueId}
            teamName={membership.teamName}
            uploadEnabled={avatarUploadMode() !== "url-only"}
          />
        </div>
      </section>
      </div>
    </div>
  );
}
