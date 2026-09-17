"use client";

import { useState } from "react";

export function InviteLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const href = `${origin}/join/${token}`;

  async function copy() {
    await navigator.clipboard.writeText(href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="flex-1 truncate rounded-sm border border-line bg-ink px-3 py-2 text-xs text-amber">
        {href || `/join/${token}`}
      </code>
      <button
        className="rounded-sm border border-line px-3 py-2 text-sm hover:border-amber hover:text-amber"
        onClick={copy}
        type="button"
      >
        {copied ? "Copied" : "Copy invite"}
      </button>
    </div>
  );
}
