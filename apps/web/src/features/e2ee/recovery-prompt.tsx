import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { ApprovalEmoji } from './approval-dialog'
import { EnterRecoveryKeyDialog, SaveRecoveryKeyDialog } from './recovery-dialogs'
import { useApprovals } from './use-approvals'
import { recoveryReminderSnoozed, snoozeRecoveryReminder, useRecovery } from './use-recovery'

import type { ApprovalView } from './device-approval'

/** What the banner says while another device is asked to approve this one. */
const ApprovalProgress = ({ view }: { view: ApprovalView }) => {
  const { t } = useTranslation()
  if (view.state === 'declined') return <p>{t('e2ee.approval.declined')}</p>
  return (
    <div className="flex flex-col gap-1">
      <p>{t('e2ee.approval.waiting')}</p>
      {view.emoji ? <ApprovalEmoji emoji={view.emoji} /> : null}
    </div>
  )
}

/**
 * In an encrypted conversation: on a device that holds the recovery key, a one-time request to
 * save it; on one without it (not approved yet), a way to get the old messages: approve it from
 * another device, or type the recovery key.
 */
export const RecoveryPrompt = ({ ready }: { ready: boolean }) => {
  const { t } = useTranslation()
  const recovery = useRecovery(ready)
  const { views, approvals } = useApprovals()
  const [snoozed, setSnoozed] = useState(recoveryReminderSnoozed)
  const [entering, setEntering] = useState(false)
  const approval = views.find((view) => view.role === 'new')
  const { refresh } = recovery

  // Approved from another device: the keys are here now.
  useEffect(() => {
    if (approval?.state === 'done') void refresh()
  }, [approval?.state, refresh])

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

  const asking = approval && approval.state !== 'declined'
  return (
    <>
      <div
        role="status"
        aria-label={t('e2ee.recovery.missingLabel')}
        className="mx-4 mt-2 flex items-start gap-3 rounded-md border border-border bg-elevated px-3 py-2 text-sm"
      >
        <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          {approval ? <ApprovalProgress view={approval} /> : <p>{t('e2ee.recovery.missing')}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {asking || !approvals ? null : (
            <Button variant="secondary" onClick={() => void approvals.request()}>
              {t('e2ee.approval.request')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setEntering(true)}>
            {t('e2ee.recovery.enter')}
          </Button>
        </div>
      </div>
      {entering ? <EnterRecoveryKeyDialog recovery={recovery} onOpenChange={setEntering} /> : null}
    </>
  )
}
