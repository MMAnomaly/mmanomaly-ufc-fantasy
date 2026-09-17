import { CreateLeagueForm } from "@/components/create-league-form";
import { Card } from "@/components/ui";
import { Footer, SiteHeader } from "@/components/site-chrome";
import { requireUser } from "@/lib/auth";

export default async function NewLeaguePage() {
  const user = await requireUser("/leagues/new");
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={user} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12">
        <Card>
          <h1 className="font-display text-3xl tracking-wide">Open a league</h1>
          <p className="mt-1 mb-6 text-sm text-mist">
            You become commissioner. Send invite links, set snake order, start the draft.
          </p>
          <CreateLeagueForm />
        </Card>
      </main>
      <Footer />
    </div>
  );
}
