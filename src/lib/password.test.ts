import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePasswordChange } from "./password";

describe("password change", () => {
  it("accepts a new password of at least 8 characters that matches the confirmation", () => {
    assert.deepEqual(
      validatePasswordChange({
        currentPassword: "draftready1",
        newPassword: "draftready2",
        confirmPassword: "draftready2",
      }),
      { ok: true, currentPassword: "draftready1", newPassword: "draftready2" },
    );
  });

  it("rejects a missing current password, a short new password, and a mismatch", () => {
    assert.equal(
      validatePasswordChange({ currentPassword: "", newPassword: "draftready2", confirmPassword: "draftready2" }).ok,
      false,
    );
    const short = validatePasswordChange({
      currentPassword: "draftready1",
      newPassword: "short",
      confirmPassword: "short",
    });
    assert.equal(short.ok, false);
    if (!short.ok) assert.match(short.error, /8 characters/);

    const mismatch = validatePasswordChange({
      currentPassword: "draftready1",
      newPassword: "draftready2",
      confirmPassword: "draftready3",
    });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.match(mismatch.error, /do not match/);
  });

  it("does not trim passwords", () => {
    const result = validatePasswordChange({
      currentPassword: "draftready1",
      newPassword: "draft ready",
      confirmPassword: "draft ready",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.newPassword, "draft ready");
  });
});
