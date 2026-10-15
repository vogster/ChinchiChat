import { isApiError } from '@chinchi/sdk'

import type { TFunction } from 'i18next'

/** A client-side failure with a stable code, translated like API errors. */
export class CodedError extends Error {
  override readonly name = 'CodedError'
  constructor(readonly code: string) {
    super(code)
  }
}

/** Translates an API or client error by its stable code, falling back to a generic message. */
export const errorMessage = (t: TFunction, error: unknown): string => {
  const code = isApiError(error) || error instanceof CodedError ? error.code : 'UNKNOWN'
  const key = `errors.${code}`
  return t(key as 'errors.UNKNOWN', { defaultValue: t('errors.UNKNOWN') })
}
