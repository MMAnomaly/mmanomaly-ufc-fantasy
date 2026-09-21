import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOwnedAvatarUrl,
  sameTeamName,
  sniffImage,
  teamInitials,
  validateAvatarBytes,
  validateAvatarUrl,
  validateTeamName,
  MAX_AVATAR_BYTES,
} from "./team-profile";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

describe("team names", () => {
  it("trims and accepts 2–32 characters", () => {
    assert.deepEqual(validateTeamName("  House Account  "), { ok: true, name: "House Account" });
    assert.equal(validateTeamName("A").ok, false);
    assert.equal(validateTeamName("  x ").ok, false);
    assert.equal(validateTeamName("a".repeat(33)).ok, false);
    assert.equal(validateTeamName("a".repeat(32)).ok, true);
  });

  it("compares names case-insensitively", () => {
    assert.equal(sameTeamName("The Pit", " the pit "), true);
    assert.equal(sameTeamName("The Pit", "The Pits"), false);
  });

  it("builds initials from the team name", () => {
    assert.equal(teamInitials("House Account"), "HA");
    assert.equal(teamInitials("The Pit"), "TP");
    assert.equal(teamInitials("ace"), "AC");
    assert.equal(teamInitials("A"), "A");
    assert.equal(teamInitials("   "), "?");
  });
});

describe("avatar bytes", () => {
  it("accepts jpeg, png, and webp signatures", () => {
    assert.equal(sniffImage(JPEG), "jpeg");
    assert.equal(sniffImage(PNG), "png");
    assert.equal(sniffImage(WEBP), "webp");
    assert.equal(sniffImage(GIF), null);
    assert.equal(validateAvatarBytes(JPEG).ok, true);
    assert.equal(validateAvatarBytes(GIF).ok, false);
  });

  it("rejects empty and oversized files", () => {
    assert.equal(validateAvatarBytes(new Uint8Array()).ok, false);
    const huge = new Uint8Array(MAX_AVATAR_BYTES + 1);
    huge.set(JPEG);
    const result = validateAvatarBytes(huge);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /2MB/);
  });
});

describe("avatar urls", () => {
  it("accepts http(s) and rejects other schemes", () => {
    assert.deepEqual(validateAvatarUrl(" https://cdn.example.com/a.png "), {
      ok: true,
      url: "https://cdn.example.com/a.png",
    });
    assert.equal(validateAvatarUrl("http://example.com/a.jpg").ok, true);
    assert.equal(validateAvatarUrl("javascript:alert(1)").ok, false);
    assert.equal(validateAvatarUrl("https://user:secret@example.com/a.png").ok, false);
    assert.equal(validateAvatarUrl("data:image/png;base64,aaaa").ok, false);
    assert.equal(validateAvatarUrl("/uploads/avatars/x.jpg").ok, false);
    assert.equal(validateAvatarUrl("").ok, false);
    assert.equal(validateAvatarUrl(`https://example.com/${"a".repeat(500)}`).ok, false);
  });

  it("only treats this membership's stored files as owned", () => {
    const id = "cmember1";
    assert.equal(isOwnedAvatarUrl(`/uploads/avatars/${id}-abc.jpg`, id), true);
    assert.equal(isOwnedAvatarUrl("/uploads/avatars/other-abc.jpg", id), false);
    assert.equal(isOwnedAvatarUrl("/uploads/avatars/../secret.jpg", id), false);
    assert.equal(
      isOwnedAvatarUrl(`https://store.public.blob.vercel-storage.com/avatars/${id}-x.jpg`, id),
      true,
    );
    assert.equal(
      isOwnedAvatarUrl("https://store.public.blob.vercel-storage.com/avatars/someone-else.jpg", id),
      false,
    );
    assert.equal(isOwnedAvatarUrl("https://cdn.example.com/me.png", id), false);
  });
});
