import { badRequest, HttpError } from '../../http/http-error'
import { loginThrottleKey } from './login-throttle'
import { verifyPassword } from './password'

import type { UserRow } from '../users/user.repository'
import type { LoginThrottle } from './login-throttle'
import type { MfaService } from './mfa.service'

/**
 * Checks the password someone types while already signed in (changing it, 2FA, deleting the
 * account). Counted per account like sign-in, so a stolen session can't be used to guess it.
 */
export const confirmPassword = async (
  throttle: LoginThrottle,
  user: { readonly id: string; readonly passwordHash: string },
  password: string,
): Promise<boolean> => {
  const key = loginThrottleKey.reauth(user.id)
  if (!(await throttle.take(key))) {
    throw new HttpError(429, 'LOGIN_LOCKED', 'Too many failed attempts, try again later')
  }
  if (!(await verifyPassword(user.passwordHash, password))) return false
  await throttle.reset(key)
  return true
}

/**
 * The password, and a code from the authenticator when two-factor sign-in is on: what it takes
 * to do something a stolen session must not (delete the account, move it to another email).
 */
export const confirmIdentity = async (
  { throttle, mfa }: { throttle: LoginThrottle; mfa?: Pick<MfaService, 'verify'> | undefined },
  user: UserRow,
  password: string,
  code: string | undefined,
): Promise<void> => {
  if (!(await confirmPassword(throttle, user, password))) {
    throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
  }
  if (!user.totpSecret) return
  if (!code) throw badRequest('MFA_CODE_REQUIRED', 'Enter a code from your authenticator')
  if (!mfa || !(await mfa.verify(user, code))) {
    throw badRequest('INVALID_MFA_CODE', 'The code is wrong or was already used')
  }
}
