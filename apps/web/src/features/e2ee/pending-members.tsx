import { Hourglass } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { errorMessage } from '../../lib/errors'

export interface PendingMembersProps {
  readonly userIds: readonly string[]
  readonly nameOf: (userId: string) => string
  /** Takes the person into the encryption from this device. */
  readonly onTakeIn: (userId: string) => Promise<void>
}

/**
 * People the server lists in an encrypted group whom no device here added. Usually the device
 * that invited them is gone (signed out, deleted); then any member who knows they were added
 * on purpose can take them in. A server could list someone of its own, too, so this is a
 * member's choice and never automatic.
 */
export const PendingMembers = ({ userIds, nameOf, onTakeIn }: PendingMembersProps) => {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  const takeIn = async (userId: string) => {
    setBusy(userId)
    setError(null)
    try {
      await onTakeIn(userId)
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      role="status"
      aria-label={t('e2ee.members.pendingTitle')}
      className="mx-4 mt-2 flex items-start gap-3 rounded-[24px] bg-stage p-3.5 text-[13px] text-muted"
    >
      <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p>{t('e2ee.members.pending', { names: userIds.map(nameOf).join(', ') })}</p>
        <p>{t('e2ee.members.takeInHint')}</p>
        <div className="flex flex-wrap gap-2">
          {userIds.map((userId) => (
            <Button
              key={userId}
              variant="secondary"
              fullWidth={false}
              pending={busy === userId}
              disabled={busy !== null}
              aria-label={t('e2ee.members.takeInOne', { name: nameOf(userId) })}
              onClick={() => void takeIn(userId)}
            >
              {userIds.length > 1
                ? t('e2ee.members.takeInOne', { name: nameOf(userId) })
                : t('e2ee.members.takeIn')}
            </Button>
          ))}
        </div>
        {error ? (
          <p role="alert" className="text-danger">
            {errorMessage(t, error)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
