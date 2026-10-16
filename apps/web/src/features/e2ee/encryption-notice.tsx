import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { EncryptedState } from './use-encrypted-conversation'

/** The start of an encrypted conversation: what encryption means here, and what is off. */
export const EncryptionNotice = () => {
  const { t } = useTranslation()
  return (
    <div className="px-4 pt-8 pb-4">
      <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-secure/15 text-secure">
        <Lock aria-hidden className="size-6" />
      </div>
      <h2 className="text-lg font-bold">{t('e2ee.noticeTitle')}</h2>
      <p className="max-w-prose text-sm text-muted">{t('e2ee.notice')}</p>
    </div>
  )
}

/** In place of the composer while this device can't write yet. */
export const EncryptionStatus = ({ state }: { state: Exclude<EncryptedState, 'ready'> }) => {
  const { t } = useTranslation()
  return (
    <p
      role="status"
      className="mx-4 mb-6 flex items-center gap-2 rounded-lg bg-elevated px-4 py-3 text-sm text-muted"
    >
      <Lock aria-hidden className="size-4 shrink-0" />
      {t(`e2ee.${state}`)}
    </p>
  )
}
