import { Footer, SiteHeader } from "@/components/site-chrome";
import { ScoringRules } from "@/components/scoring-rules";
import { getSession } from "@/lib/auth";

export default async function RulesPage() {
  const user = await getSession();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <ScoringRules />
      </main>
      <Footer />
    </div>
  );
}
