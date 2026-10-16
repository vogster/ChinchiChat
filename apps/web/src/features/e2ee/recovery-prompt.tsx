import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { EnterRecoveryKeyDialog, SaveRecoveryKeyDialog } from './recovery-dialogs'
import { recoveryReminderSnoozed, snoozeRecoveryReminder, useRecovery } from './use-recovery'

/**
 * In an encrypted conversation: on a device that holds the recovery key, a one-time request to
 * save it; on one without it, an offer to type it and get the old messages back.
 */
export const RecoveryPrompt = ({ ready }: { ready: boolean }) => {
  const { t } = useTranslation()
  const recovery = useRecovery(ready)
  const [snoozed, setSnoozed] = useState(recoveryReminderSnoozed)
  const [entering, setEntering] = useState(false)
  if (!recovery.loaded) return null

  if (recovery.key) {
    if (recovery.saved || snoozed) return null
    return (
      <SaveRecoveryKeyDialog
        recoveryKey={recovery.key}
        onSaved={() => void recovery.markSaved()}
        onLater={() => {
          snoozeRecoveryReminder()
          setSnoozed(true)
        }}
      />
    )
  }

  return (
    <>
      <div
        role="status"
        aria-label={t('e2ee.recovery.missingLabel')}
        className="mx-4 mt-2 flex items-center gap-3 rounded-md border border-border bg-elevated px-3 py-2 text-sm"
      >
        <KeyRound aria-hidden className="size-4 shrink-0 text-muted" />
        <p className="min-w-0 flex-1">{t('e2ee.recovery.missing')}</p>
        <Button variant="secondary" onClick={() => setEntering(true)}>
          {t('e2ee.recovery.enter')}
        </Button>
      </div>
      {entering ? <EnterRecoveryKeyDialog recovery={recovery} onOpenChange={setEntering} /> : null}
    </>
  )
}
