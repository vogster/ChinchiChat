import { HttpError } from '../../http/http-error'
import { loginThrottleKey } from './login-throttle'
import { verifyPassword } from './password'

import type { LoginThrottle } from './login-throttle'

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
