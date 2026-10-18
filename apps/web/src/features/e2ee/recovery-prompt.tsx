import { KeyRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { ApprovalEmoji } from './approval-dialog'
import { EnterRecoveryKeyDialog, SaveRecoveryKeyDialog } from './recovery-dialogs'
import { useApprovals } from './use-approvals'
import { useMissingHistoryHint } from './use-missing-history-hint'
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
  const hint = useMissingHistoryHint()
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
  if (hint.hidden && !asking) {
    return entering ? (
      <EnterRecoveryKeyDialog recovery={recovery} onOpenChange={setEntering} />
    ) : null
  }
  return (
    <>
      <div
        role="status"
        aria-label={t('e2ee.recovery.missingLabel')}
        className="mx-4 mt-2 flex items-start gap-3.5 rounded-[24px] bg-stage p-4 text-sm"
      >
        <span
          aria-hidden
          className="grid size-[42px] shrink-0 place-items-center rounded-[15px] bg-warning-soft text-warning-text"
        >
          <KeyRound className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3 pt-0.5 text-body">
          {approval ? <ApprovalProgress view={approval} /> : <p>{t('e2ee.recovery.missing')}</p>}
          <div className="flex flex-wrap gap-2">
            {asking || !approvals ? null : (
              <Button variant="secure" fullWidth={false} onClick={() => void approvals.request()}>
                {t('e2ee.approval.request')}
              </Button>
            )}
            <Button variant="secondary" fullWidth={false} onClick={() => setEntering(true)}>
              {t('e2ee.recovery.enter')}
            </Button>
          </div>
        </div>
        {asking ? null : (
          // Lost key: no point repeating it. The chat header keeps a way back.
          <button
            type="button"
            aria-label={t('e2ee.recovery.hideMissing')}
            title={t('e2ee.recovery.hideMissing')}
            onClick={() => {
              if (approval) approvals?.dismiss(approval.approvalId)
              hint.hide()
            }}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-field hover:text-text"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {entering ? <EnterRecoveryKeyDialog recovery={recovery} onOpenChange={setEntering} /> : null}
    </>
  )
}

/**
 * In the chat header, once the notice above was hidden: the same explanation and actions come
 * back from here.
 */
export const MissingHistoryButton = ({
  ready,
  className,
}: {
  ready: boolean
  className: string
}) => {
  const { t } = useTranslation()
  const recovery = useRecovery(ready)
  const hint = useMissingHistoryHint()
  const { views } = useApprovals()
  const asking = views.some((view) => view.role === 'new' && view.state !== 'declined')
  if (!recovery.loaded || recovery.key || !hint.hidden || asking) return null
  return (
    <button
      type="button"
      aria-label={t('e2ee.recovery.showMissing')}
      title={t('e2ee.recovery.showMissing')}
      onClick={hint.show}
      className={className}
    >
      <KeyRound aria-hidden className="size-5" />
    </button>
  )
}
