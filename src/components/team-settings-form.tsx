"use client";

import { useActionState, useRef, useState } from "react";
import { updateTeamAvatarAction, updateTeamNameAction, type TeamSettingsState } from "@/app/actions/team";
import { TeamAvatar } from "./team-avatar";
import { Field, PrimaryButton } from "./ui";

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const OUTPUT = 256;

async function squareAvatarFile(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.floor((bitmap.width - side) / 2);
    const sy = Math.floor((bitmap.height - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT, OUTPUT);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.86);
    });
    if (!blob) return file;
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

export function TeamNameForm({ leagueId, teamName }: { leagueId: string; teamName: string }) {
  const [state, action, pending] = useActionState(
    updateTeamNameAction.bind(null, leagueId),
    null as TeamSettingsState,
  );
  return (
    <form action={action} className="space-y-4">
      <Field
        label="Team name"
        name="teamName"
        required
        defaultValue={teamName}
        minLength={2}
        maxLength={32}
        placeholder="House Account"
      />
      {state?.error ? <p className="text-sm text-blood">{state.error}</p> : null}
      {state?.message ? <p className="text-sm text-amber">{state.message}</p> : null}
      <PrimaryButton disabled={pending}>Save name</PrimaryButton>
    </form>
  );
}

export function TeamAvatarForm({
  leagueId,
  teamName,
  avatarUrl,
  uploadEnabled,
}: {
  leagueId: string;
  teamName: string;
  avatarUrl: string | null;
  uploadEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateTeamAvatarAction.bind(null, leagueId),
    null as TeamSettingsState,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function clearPreview() {
    setPendingFile(null);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  async function onFile(file: File | null) {
    setLocalError(null);
    clearPreview();
    if (!file) return;
    if (file.type && !ACCEPTED.has(file.type)) {
      setLocalError("Use a JPEG, PNG, or WebP image.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setLocalError("Image must be 2MB or smaller.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setCropping(true);
    try {
      const cropped = await squareAvatarFile(file);
      if (cropped.size > 2 * 1024 * 1024) {
        setLocalError("Image must be 2MB or smaller.");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      setPendingFile(cropped);
      setPreview(URL.createObjectURL(cropped));
    } catch {
      if (file.size > 2 * 1024 * 1024) {
        setLocalError("Image must be 2MB or smaller.");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      setPendingFile(file);
      setPreview(URL.createObjectURL(file));
    } finally {
      setCropping(false);
    }
  }

  return (
    <form
      className="space-y-4"
      action={async (formData) => {
        if (formData.get("remove") === "1") {
          formData.delete("avatar");
          formData.delete("avatarUrl");
          clearPreview();
        } else if (localError) {
          formData.delete("avatar");
        } else if (pendingFile) {
          formData.set("avatar", pendingFile);
        }
        await action(formData);
      }}
    >
      <div className="flex items-center gap-3">
        <TeamAvatar avatarUrl={preview ?? avatarUrl} name={teamName} size="lg" />
        <p className="text-sm text-mist">Circle crop. Initials show until a picture is set.</p>
      </div>
      {uploadEnabled ? (
        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-[0.18em] text-mist">Upload</span>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm text-mist file:mr-3 file:rounded-sm file:border-0 file:bg-blood file:px-3 file:py-2 file:font-semibold file:text-white"
            name="avatar"
            ref={fileRef}
            type="file"
            onChange={(event) => {
              void onFile(event.target.files?.[0] ?? null);
            }}
          />
          <span className="block text-xs text-mist">JPEG, PNG, or WebP. 2MB max. Squared before upload.</span>
        </label>
      ) : (
        <p className="text-sm text-mist">
          Uploads need <span className="text-paper">BLOB_READ_WRITE_TOKEN</span>. Paste a public image URL instead.
        </p>
      )}
      <Field label="Or image URL" name="avatarUrl" placeholder="https://…" type="url" />
      {localError ? <p className="text-sm text-blood">{localError}</p> : null}
      {state?.error ? <p className="text-sm text-blood">{state.error}</p> : null}
      {state?.message ? <p className="text-sm text-amber">{state.message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton disabled={pending || cropping}>Save picture</PrimaryButton>
        <button
          className="rounded-sm border border-line px-4 py-2 text-paper hover:border-amber hover:text-amber disabled:opacity-50"
          disabled={pending || cropping || !avatarUrl}
          name="remove"
          type="submit"
          value="1"
        >
          Remove picture
        </button>
      </div>
    </form>
  );
}
