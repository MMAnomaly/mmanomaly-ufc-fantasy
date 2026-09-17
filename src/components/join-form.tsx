"use client";

import { useState, useTransition } from "react";
import { joinLeagueAction } from "@/app/actions/leagues";
import { Field, PrimaryButton } from "./ui";

export function JoinForm({ token, defaultTeamName }: { token: string; defaultTeamName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const teamName = String(form.get("teamName") ?? defaultTeamName);
        startTransition(async () => {
          const result = await joinLeagueAction(token, teamName);
          if (result?.error) setError(result.error);
        });
      }}
    >
      <Field label="Team name" name="teamName" defaultValue={defaultTeamName} required />
      {error ? <p className="text-sm text-blood">{error}</p> : null}
      <PrimaryButton disabled={pending}>Join league</PrimaryButton>
    </form>
  );
}
