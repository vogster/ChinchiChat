import { useQuery } from '@tanstack/react-query'
import { Lock, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { BetaBadge } from './beta-badge'
import { DeviceCodeText } from './device-code'
import { useThisDeviceId } from './e2ee-context'
import { EncryptionGuideButton } from './encryption-guide'
import { myDevicesQueryOptions } from './my-devices'
import { EnterRecoveryKeyDialog } from './recovery-dialogs'
import { useThisDeviceCode } from './use-device-code'
import { useMissingHistoryHint } from './use-missing-history-hint'
import { useRecovery } from './use-recovery'

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
 * Whether I have another device that could let this one in: false when every other one is gone
 * (signed out, keys deleted), null while the list loads.
 */
const useOtherDevices = (): boolean | null => {
  const { data } = useQuery(myDevicesQueryOptions(useApi()))
  const thisDevice = useThisDeviceId()
  if (!data || !thisDevice) return null
  return data.some((device) => device.id !== thisDevice && device.revokedAt === null)
}

/**
 * In place of the composer while no one has let this device in: how it gets in, and its code
 * for the other person to compare before letting it in. With no other device of mine, only the
 * other people can do it: the notice says so rather than send me to a device I don't have.
 */
const WaitingToBeLetIn = ({ group }: { group: boolean }) => {
  const { t } = useTranslation()
  const code = useThisDeviceCode()
  const recovery = useRecovery()
  const missingHint = useMissingHistoryHint()
  const alone = useOtherDevices() === false
  const [entering, setEntering] = useState(false)
  return (
    <div
      role="status"
      aria-label={t('e2ee.waitingTitle')}
      className="mx-4 mb-4 flex items-start gap-3 rounded-[22px] bg-field px-4 py-3 text-[13px] text-muted"
    >
      <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-secure-text" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-body">{t('e2ee.waitingTitle')}</p>
        {alone ? (
          <>
            <p>{t(group ? 'e2ee.waitingAloneGroup' : 'e2ee.waitingAlone')}</p>
            <p>{t('e2ee.waitingAloneRecovery')}</p>
          </>
        ) : (
          <>
            <p>{t('e2ee.waiting')}</p>
            <ul className="list-disc pl-5">
              <li>{t('e2ee.waitingWays.device')}</li>
              <li>{t('e2ee.waitingWays.recovery')}</li>
              <li>{t(group ? 'e2ee.waitingWays.codeGroup' : 'e2ee.waitingWays.code')}</li>
            </ul>
          </>
        )}
        {code ? (
          <p>
            {t('e2ee.device.code')} <DeviceCodeText code={code} className="text-body" />
          </p>
        ) : null}
        {/* While the notice about old messages is up, its button is the one to use. */}
        {recovery.loaded && !recovery.key && missingHint.hidden ? (
          <Button
            variant="secure"
            fullWidth={false}
            className="mt-1 self-start"
            onClick={() => setEntering(true)}
          >
            {t('e2ee.recovery.enter')}
          </Button>
        ) : null}
        {entering ? (
          <EnterRecoveryKeyDialog recovery={recovery} onOpenChange={setEntering} />
        ) : null}
      </div>
    </div>
  )
}

/**
 * In place of the composer when the server calls a conversation unencrypted that this device
 * saw encrypted: sending would put the text on the server in the clear.
 */
export const DowngradeNotice = ({ onRemove }: { onRemove: () => void }) => {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      aria-label={t('e2ee.downgrade.title')}
      className="mx-4 mb-4 flex items-start gap-3 rounded-card bg-danger-soft px-4 py-3 text-sm"
    >
      <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
      <div>
        <p className="font-semibold text-danger">{t('e2ee.downgrade.title')}</p>
        <p className="mt-1 text-muted">{t('e2ee.downgrade.text')}</p>
        {/* Nothing can be written here any more: the conversation need not stay. */}
        <Button variant="danger" fullWidth={false} className="mt-3" onClick={onRemove}>
          {t('e2ee.downgrade.remove')}
        </Button>
      </div>
    </div>
  )
}

/** In place of the composer while this device can't write yet. */
export const EncryptionStatus = ({
  state,
  group = false,
}: {
  state: Exclude<EncryptedState, 'ready'>
  /** A group: any member, not just the other person, can let this device in. */
  group?: boolean
}) => {
  const { t } = useTranslation()
  if (state === 'waiting') return <WaitingToBeLetIn group={group} />
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
