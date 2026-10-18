import { Mail } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { errorMessage } from '../../lib/errors'
import { useNow } from '../../lib/use-now'
import { useCurrentUser, useResendVerification } from './use-auth-actions'

/** After sending, the button rests this long so the next email is not one click away. */
const RESEND_COOLDOWN_MS = 30_000

const secondsLeft = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / 1000))

const ResendButton = ({ onResend, sentAt }: { onResend: () => void; sentAt: number | null }) => {
  const { t } = useTranslation()
  // Remounted on every send (see `key` below), so the clock starts no earlier than `sentAt`.
  const now = useNow(1_000)
  const left = sentAt === null ? 0 : secondsLeft(sentAt + RESEND_COOLDOWN_MS, now)
  const cooling = left > 0

  return (
    <button
      type="button"
      disabled={cooling}
      onClick={onResend}
      className="h-8 shrink-0 rounded-full bg-accent px-3.5 text-[12.5px] font-semibold whitespace-nowrap text-accent-contrast transition hover:brightness-110 disabled:cursor-default disabled:bg-field disabled:text-muted disabled:hover:brightness-100"
    >
      {cooling ? t('auth.verify.resentCooldown', { seconds: left }) : t('auth.verify.resend')}
    </button>
  )
}

/** Spans the top of the window until the address is confirmed. */
export const VerifyEmailBanner = () => {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const resend = useResendVerification()
  const [sentAt, setSentAt] = useState<number | null>(null)

  if (!user || user.emailVerified) return null

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-[20px] bg-accent-soft py-[7px] pr-[7px] pl-2.5 text-text"
    >
      <span
        aria-hidden
        className="grid size-[30px] shrink-0 place-items-center rounded-[11px] bg-accent text-accent-contrast"
      >
        <Mail className="size-4" />
      </span>
      <span className="min-w-[min(260px,100%)] flex-1 text-[13.5px] leading-snug text-pretty">
        <Trans
          i18nKey="auth.verify.banner"
          values={{ email: user.email }}
          components={{ strong: <span className="font-semibold" /> }}
        />
        {resend.isError ? (
          <span className="ml-1.5 text-danger">{errorMessage(t, resend.error)}</span>
        ) : null}
      </span>
      <ResendButton
        key={sentAt ?? 'never'}
        sentAt={sentAt}
        onResend={() =>
          resend.mutate(undefined, {
            onSuccess: () => setSentAt(Date.now()),
          })
        }
      />
    </div>
  )
}
