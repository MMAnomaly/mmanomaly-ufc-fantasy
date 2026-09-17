"use client";

import { useActionState } from "react";
import { loginAction, registerAction } from "@/app/actions/auth";
import { Field, PrimaryButton } from "./ui";

type AuthState = { error?: string } | null;

export function LoginForm({
  next,
  inviteToken,
}: {
  next?: string;
  inviteToken?: string;
}) {
  const [state, action] = useActionState(loginAction, null as AuthState);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email" name="email" type="email" required />
      <Field label="Password" name="password" type="password" required />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}
      {state?.error ? <p className="text-sm text-blood">{state.error}</p> : null}
      <PrimaryButton>Enter the pit</PrimaryButton>
    </form>
  );
}

export function RegisterForm({
  next,
  inviteToken,
  showTeamName,
}: {
  next?: string;
  inviteToken?: string;
  showTeamName?: boolean;
}) {
  const [state, action] = useActionState(registerAction, null as AuthState);
  return (
    <form action={action} className="space-y-4">
      <Field label="Display name" name="displayName" required placeholder="How you show up on the board" />
      <Field label="Email" name="email" type="email" required />
      <Field label="Password" name="password" type="password" required placeholder="At least 8 characters" />
      {showTeamName ? <Field label="Team name" name="teamName" placeholder="Your squad" /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}
      {state?.error ? <p className="text-sm text-blood">{state.error}</p> : null}
      <PrimaryButton>Create account</PrimaryButton>
    </form>
  );
}
