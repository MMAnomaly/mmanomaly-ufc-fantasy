import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";
import { isOwnedAvatarUrl, LOCAL_AVATAR_PREFIX } from "./team-profile";

export type AvatarUploadMode = "blob" | "local" | "url-only";

export function avatarUploadMode(): AvatarUploadMode {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.VERCEL) return "url-only";
  return "local";
}

export async function storeAvatarFile(
  membershipId: string,
  bytes: Buffer,
  ext: string,
  contentType: string,
) {
  const mode = avatarUploadMode();
  if (mode === "url-only") {
    throw new Error("File upload needs BLOB_READ_WRITE_TOKEN. Paste a public image URL instead.");
  }
  const safeId = membershipId.replace(/[^\w-]/g, "");
  const name = `${safeId}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`;
  if (mode === "blob") {
    const blob = await put(`avatars/${name}`, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }
  const dir = path.join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `${LOCAL_AVATAR_PREFIX}${name}`;
}

export async function deleteStoredAvatar(url: string | null | undefined, membershipId: string) {
  if (!url || !isOwnedAvatarUrl(url, membershipId)) return;
  if (url.startsWith(LOCAL_AVATAR_PREFIX)) {
    const file = url.slice(LOCAL_AVATAR_PREFIX.length);
    const full = path.join(process.cwd(), "public", "uploads", "avatars", file);
    await unlink(full).catch(() => undefined);
    return;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
}
