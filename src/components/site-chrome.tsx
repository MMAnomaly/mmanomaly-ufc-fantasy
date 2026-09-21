import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 group">
      <Image
        alt="MMAnomaly"
        className="h-10 w-10 rounded-full object-cover"
        height={40}
        priority
        src="/mmanomaly-logo.png"
        width={40}
      />
      <span className="leading-none">
        <span className="block font-display text-xl tracking-[0.18em] text-paper group-hover:text-amber">
          MMAnomaly
        </span>
        {!compact && (
          <span className="block text-[10px] uppercase tracking-[0.32em] text-mist">UFC season fantasy</span>
        )}
      </span>
    </Link>
  );
}

export function SiteHeader({
  user,
  right,
}: {
  user: { displayName: string } | null;
  right?: ReactNode;
}) {
  return (
    <header className="border-b border-line/80 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <BrandMark />
        <div className="flex items-center gap-3 text-sm">
          {right}
          {user ? (
            <>
              <span className="hidden text-mist sm:inline">{user.displayName}</span>
              <form action={logoutAction}>
                <button className="text-mist hover:text-paper" type="submit">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="text-mist hover:text-paper" href="/login">
                Log in
              </Link>
              <Link
                className="rounded-sm bg-blood px-3 py-1.5 font-semibold tracking-wide text-white hover:bg-blood-dim"
                href="/register"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line/80 px-4 py-6 text-center text-xs text-mist">
      MMAnomaly is not affiliated with, endorsed by, or sponsored by UFC or DraftKings.
      Scoring based on DraftKings Classic MMA.
    </footer>
  );
}
