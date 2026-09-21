/** Same minimum as registration (`registerAction`). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function validatePasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): { ok: true; currentPassword: string; newPassword: string } | { ok: false; error: string } {
  const { currentPassword, newPassword, confirmPassword } = input;
  if (!currentPassword) return { ok: false, error: "Enter your current password." };
  if (newPassword.length < PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  }
  if (newPassword.length > PASSWORD_MAX) {
    return { ok: false, error: `Password must be ${PASSWORD_MAX} characters or fewer.` };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "New password and confirmation do not match." };
  }
  return { ok: true, currentPassword, newPassword };
}
