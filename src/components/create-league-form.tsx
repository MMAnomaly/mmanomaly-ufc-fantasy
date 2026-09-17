"use client";

import { useActionState } from "react";
import { createLeagueAction } from "@/app/actions/leagues";
import { DEFAULT_PICK_CLOCK, DEFAULT_TEAMS, MAX_TEAMS, MIN_TEAMS } from "@/lib/draft";
import { Field, PrimaryButton } from "./ui";

type State = { error?: string } | null;

export function CreateLeagueForm() {
  const [state, action] = useActionState(createLeagueAction, null as State);
  return (
    <form action={action} className="space-y-4">
      <Field label="League name" name="name" required placeholder="Fight Week Invitational" />
      <Field label="Your team name" name="teamName" required placeholder="House Account" />
      <Field
        label="Max teams (4–12)"
        name="maxTeams"
        type="number"
        min={MIN_TEAMS}
        max={MAX_TEAMS}
        defaultValue={DEFAULT_TEAMS}
        required
      />
      <Field
        label="Pick clock (seconds)"
        name="pickClockSeconds"
        type="number"
        min={15}
        max={300}
        defaultValue={DEFAULT_PICK_CLOCK}
        required
      />
      {state?.error ? <p className="text-sm text-blood">{state.error}</p> : null}
      <PrimaryButton>Open the books</PrimaryButton>
    </form>
  );
}
