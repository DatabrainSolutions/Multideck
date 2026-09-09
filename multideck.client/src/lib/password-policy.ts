export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export const PASSWORD_POLICY_DESCRIPTION =
  "Use 8–128 characters with at least one lowercase letter, one uppercase letter and one number. Symbols are optional."

export function getPasswordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "Use at least 8 characters."
  if (password.length > PASSWORD_MAX_LENGTH) return "Use no more than 128 characters."
  if (!/[a-z]/.test(password)) return "Add at least one lowercase letter."
  if (!/[A-Z]/.test(password)) return "Add at least one uppercase letter."
  if (!/[0-9]/.test(password)) return "Add at least one number."
  return null
}

export function passwordMeetsPolicy(password: string) {
  return getPasswordPolicyError(password) === null
}
