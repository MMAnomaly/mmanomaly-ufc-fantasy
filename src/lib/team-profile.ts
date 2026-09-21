export const TEAM_NAME_MIN = 2;
export const TEAM_NAME_MAX = 32;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_AVATAR_URL_LENGTH = 500;
export const LOCAL_AVATAR_PREFIX = "/uploads/avatars/";

export type AvatarImageKind = "jpeg" | "png" | "webp";

const CONTENT: Record<AvatarImageKind, { contentType: string; ext: string }> = {
  jpeg: { contentType: "image/jpeg", ext: "jpg" },
  png: { contentType: "image/png", ext: "png" },
  webp: { contentType: "image/webp", ext: "webp" },
};

export function sameTeamName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function validateTeamName(input: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = input.trim();
  if (name.length < TEAM_NAME_MIN || name.length > TEAM_NAME_MAX) {
    return { ok: false, error: `Team name must be ${TEAM_NAME_MIN}–${TEAM_NAME_MAX} characters.` };
  }
  return { ok: true, name };
}

export function teamInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function sniffImage(bytes: Uint8Array): AvatarImageKind | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function validateAvatarBytes(
  bytes: Uint8Array,
): { ok: true; kind: AvatarImageKind; contentType: string; ext: string } | { ok: false; error: string } {
  if (bytes.byteLength === 0) return { ok: false, error: "Choose an image file." };
  if (bytes.byteLength > MAX_AVATAR_BYTES) return { ok: false, error: "Image must be 2MB or smaller." };
  const kind = sniffImage(bytes);
  if (!kind) return { ok: false, error: "Use a JPEG, PNG, or WebP image." };
  return { ok: true, kind, ...CONTENT[kind] };
}

export function validateAvatarUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const url = raw.trim();
  if (!url) return { ok: false, error: "Enter an image URL." };
  if (url.length > MAX_AVATAR_URL_LENGTH) return { ok: false, error: "Image URL is too long." };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Enter a valid http(s) image URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Image URL must start with http:// or https://." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Image URL cannot include a username or password." };
  }
  return { ok: true, url: parsed.toString() };
}

/** Only files this membership uploaded. Pasted URLs and other teams' blobs are left alone. */
export function isOwnedAvatarUrl(url: string, membershipId: string) {
  if (!/^[\w-]+$/.test(membershipId)) return false;
  if (url.startsWith(LOCAL_AVATAR_PREFIX)) {
    const file = url.slice(LOCAL_AVATAR_PREFIX.length);
    return file.startsWith(`${membershipId}-`) && /^[\w.-]+$/.test(file);
  }
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) return false;
    return parsed.pathname.includes(`/avatars/${membershipId}`);
  } catch {
    return false;
  }
}
