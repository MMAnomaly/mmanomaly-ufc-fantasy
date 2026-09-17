import Link from "next/link";
import { LoginForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";
import { Footer, SiteHeader } from "@/components/site-chrome";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
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
          <h1 className="font-display text-3xl tracking-wide">Log in</h1>
          <p className="mt-1 mb-6 text-sm text-mist">Email + password. Invite links still work if you have one.</p>
          <LoginForm next={next} inviteToken={invite} />
          <p className="mt-4 text-sm text-mist">
            Need an account?{" "}
            <Link className="text-amber" href={invite ? `/register?invite=${invite}` : "/register"}>
              Register
            </Link>
          </p>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
