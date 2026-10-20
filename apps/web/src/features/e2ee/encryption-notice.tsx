import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { BetaBadge } from './beta-badge'
import { DeviceCodeText } from './device-code'
import { EncryptionGuideButton } from './encryption-guide'
import { useThisDeviceCode } from './use-device-code'

import type { EncryptedState } from './use-encrypted-conversation'

/** The start of an encrypted conversation: what encryption means here, and what is off. */
export const EncryptionNotice = () => {
  const { t } = useTranslation()
  return (
    <div className="mx-5 mt-4 mb-5 flex items-start gap-4 rounded-card bg-stage p-5">
      <span
        aria-hidden
        className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-secure-soft text-secure-text"
      >
        <Lock className="size-6" />
      </span>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em]">
          {t('e2ee.noticeTitle')}
          <BetaBadge />
        </h2>
        <p className="mt-0.5 max-w-prose text-pretty text-muted">{t('e2ee.notice')}</p>
        <p className="mt-2 max-w-prose text-sm text-faint">{t('e2ee.betaNotice')}</p>
        <EncryptionGuideButton />
      </div>
    </div>
  )
}

/**
 * In place of the composer while no one has let this device in: how it gets in, and its code
 * for the other person to compare before letting it in.
 */
const WaitingToBeLetIn = () => {
  const { t } = useTranslation()
  const code = useThisDeviceCode()
  return (
    <div
      role="status"
      aria-label={t('e2ee.waitingTitle')}
      className="mx-4 mb-4 flex items-start gap-3 rounded-[22px] bg-field px-4 py-3 text-[13px] text-muted"
    >
      <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-secure-text" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-body">{t('e2ee.waitingTitle')}</p>
        <p>{t('e2ee.waiting')}</p>
        {code ? (
          <p>
            {t('e2ee.device.code')} <DeviceCodeText code={code} className="text-body" />
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** In place of the composer while this device can't write yet. */
export const EncryptionStatus = ({ state }: { state: Exclude<EncryptedState, 'ready'> }) => {
  const { t } = useTranslation()
  if (state === 'waiting') return <WaitingToBeLetIn />
  return (
    <p
      role="status"
      className="mx-4 mb-4 flex items-center gap-3 rounded-full bg-field py-2.5 pr-4 pl-3 text-[13px] text-muted"
    >
      <Lock aria-hidden className="size-4 shrink-0 text-secure-text" />
      {t(`e2ee.${state}`)}
    </p>
  )
}
