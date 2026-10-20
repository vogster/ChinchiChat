/**
 * A recovery key handed over by another device while signing in (QR), waiting for the
 * encryption client of that user to start and take it, like a typed one. In memory only.
 */
const handed = new Map<string, string>()

export const handRecoveryKey = (userId: string, recoveryKey: string): void => {
  handed.set(userId, recoveryKey)
}

export const takeHandedRecoveryKey = (userId: string): string | null => {
  const recoveryKey = handed.get(userId) ?? null
  handed.delete(userId)
  return recoveryKey
}
