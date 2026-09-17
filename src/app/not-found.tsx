import Link from "next/link";
import { Footer, SiteHeader } from "@/components/site-chrome";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={null} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 text-center">
        <h1 className="font-display text-4xl tracking-wide">Not on this card</h1>
        <p className="mt-2 text-mist">That page (or league) is not available.</p>
        <Link className="mt-6 text-amber" href="/">
          Back to MMAnomaly
        </Link>
      </main>
      <Footer />
    </div>
  );
}
