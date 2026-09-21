"use client";

import { useState } from "react";
import { teamInitials } from "@/lib/team-profile";

const SIZE = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-14 w-14 text-base",
} as const;

export function TeamAvatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZE;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const frame = `${SIZE[size]} shrink-0 rounded-full border border-line`;
  if (avatarUrl && failedUrl !== avatarUrl) {
    return (
      // Browser loads the picture. next/image would proxy arbitrary pasted hosts.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className={`${frame} object-cover`}
        referrerPolicy="no-referrer"
        src={avatarUrl}
        onError={() => setFailedUrl(avatarUrl)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${frame} inline-flex items-center justify-center bg-raised font-display tracking-wide text-amber`}
    >
      {teamInitials(name)}
    </span>
  );
}
