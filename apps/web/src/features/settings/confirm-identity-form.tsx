import { ApiError } from '@chinchi/sdk'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { PasswordField } from '../../components/ui/password-field'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'

import type { ReactNode } from 'react'

export interface ConfirmIdentityFormProps {
  /** With 2FA on, the first step only checks the password ("Next"). */
  readonly mfaEnabled: boolean
  readonly passwordLabel: string
  readonly codeLabel: string
  /** What the last step does ("Delete account", "Download"). */
  readonly submitLabel: string
  readonly variant?: 'primary' | 'danger'
  /** Fields before the password (a new email), whether they are filled, and their check. */
  readonly before?: ReactNode
  readonly beforeReady?: boolean
  readonly validate?: () => boolean
  /** A "Cancel" next to the first step's button, in dialogs. */
  readonly onCancel?: () => void
  /** Does the dangerous thing; rejects as the server does (MFA_CODE_REQUIRED, …). */
  readonly confirm: (password: string, code: string | undefined) => Promise<unknown>
}

type Step = 'password' | 'code'

const needsCode = (error: unknown) =>
  error instanceof ApiError && error.code === 'MFA_CODE_REQUIRED'

/**
 * The password, then (with 2FA on) a code, in two steps as when signing in. The first step sends
 * the password alone: the server checks it first and answers MFA_CODE_REQUIRED, so a code is
 * asked for only once the password is right. The steps slide: forward from the right, back from
 * the left (none with reduced motion); the focus goes to the step's field.
 */
export const ConfirmIdentityForm = ({
  mfaEnabled,
  passwordLabel,
  codeLabel,
  submitLabel,
  variant = 'primary',
  before,
  beforeReady = true,
  validate = () => true,
  onCancel,
  confirm,
}: ConfirmIdentityFormProps) => {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('password')
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  // After a step change (not on open: the dialog places the first focus itself).
  useEffect(() => {
    if (!direction) return
    ;(step === 'code' ? codeRef : passwordRef).current?.focus()
  }, [step, direction])

  const go = (next: Step) => {
    setError(null)
    setDirection(next === 'code' ? 'forward' : 'back')
    setStep(next)
  }

  const run = async (withCode: string | undefined) => {
    setPending(true)
    setError(null)
    try {
      await confirm(password, withCode)
    } catch (failure) {
      if (!withCode && needsCode(failure)) go('code')
      else setError(failure)
    } finally {
      setPending(false)
    }
  }

  const ready = step === 'password' ? password !== '' && beforeReady : code.trim() !== ''
  const slide =
    direction === 'forward'
      ? 'animate-step-forward'
      : direction === 'back'
        ? 'animate-step-back'
        : ''

  return (
    <form
      noValidate
      // Clips the slide, with room for the fields' focus rings.
      className="-m-1 overflow-hidden p-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready || pending) return
        if (step === 'code') void run(code.trim())
        else if (validate()) void run(undefined)
      }}
    >
      <div key={step} className={`flex flex-col gap-3 motion-reduce:animate-none ${slide}`}>
        {step === 'password' ? (
          <>
            {before}
            <PasswordField
              ref={passwordRef}
              label={passwordLabel}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </>
        ) : (
          <TextField
            ref={codeRef}
            label={codeLabel}
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        )}
        {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
        <div className="flex gap-2">
          {step === 'code' ? (
            <Button type="button" variant="secondary" onClick={() => go('password')}>
              {t('common.back')}
            </Button>
          ) : onCancel ? (
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          ) : null}
          <Button
            type="submit"
            variant={step === 'password' && mfaEnabled ? 'primary' : variant}
            pending={pending}
            disabled={!ready}
          >
            {step === 'password' && mfaEnabled ? t('common.next') : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}
