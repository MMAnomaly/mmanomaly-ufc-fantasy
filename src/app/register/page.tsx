import Link from "next/link";
import { RegisterForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";
import { Footer, SiteHeader } from "@/components/site-chrome";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; invite?: string }>;
}) {
  const session = await getSession();
  const { next, invite } = await searchParams;
  if (session && !invite) redirect(next && next.startsWith("/") ? next : "/");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={session} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Card>
          <h1 className="font-display text-3xl tracking-wide">Create credentials</h1>
          <p className="mt-1 mb-6 text-sm text-mist">
            {invite
              ? "You were invited. Register here and you will land in that league."
              : "Commissioners register here, then create a league and send invite links."}
          </p>
          <RegisterForm next={next} inviteToken={invite} showTeamName={Boolean(invite)} />
          <p className="mt-4 text-sm text-mist">
            Already in?{" "}
            <Link className="text-amber" href={invite ? `/login?invite=${invite}` : "/login"}>
              Log in
            </Link>
          </p>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
