import { KeyRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { ApprovalEmoji } from './approval-dialog'
import { EncryptionGuideOnce } from './encryption-guide'
import { useHasOtherDevices } from './my-devices'
import { EnterRecoveryKeyDialog, RecoveryKeyForm, SaveRecoveryKeyDialog } from './recovery-dialogs'
import { useApprovals } from './use-approvals'
import { useEncryptionGuideSeen } from './use-encryption-guide'
import { useMissingHistoryHint } from './use-missing-history-hint'
import { recoveryReminderSnoozed, snoozeRecoveryReminder, useRecovery } from './use-recovery'

import type { ApprovalView, DeviceApprovals } from './device-approval'

/**
 * What the banner says while another device is asked to approve this one. The person says here
 * too whether the emoji match: only then does this device take the keys it was sent.
 */
const ApprovalProgress = ({
  view,
  approvals,
}: {
  view: ApprovalView
  approvals: DeviceApprovals | null
}) => {
  const { t } = useTranslation()
  if (view.state === 'declined') return <p>{t('e2ee.approval.declined')}</p>
  if (view.state !== 'compare' || !view.emoji) return <p>{t('e2ee.approval.waiting')}</p>
  return (
    <div className="flex flex-col gap-2">
      {view.confirmedHere ? (
        <p>{t('e2ee.approval.waitingThere')}</p>
      ) : (
        <>
          <p>{t('e2ee.approval.compareHere')}</p>
          {view.approvedThere ? (
            <p className="text-muted">{t('e2ee.approval.approvedThere')}</p>
          ) : null}
        </>
      )}
      <ApprovalEmoji emoji={view.emoji} align="start" />
      {view.confirmedHere || !approvals ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secure"
            fullWidth={false}
            onClick={() => void approvals.confirm(view.approvalId)}
          >
            {t('e2ee.approval.yes')}
          </Button>
          <Button
            variant="secondary"
            fullWidth={false}
            onClick={() => void approvals.decline(view.approvalId)}
          >
            {t('e2ee.approval.differ')}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * In an encrypted conversation: on a device that holds the recovery key, a one-time request to
 * save it; on one without it (not approved yet), a way to get the old messages: approve it from
 * another device, or type the recovery key. The first time, the encryption guide comes before.
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
  const [guideSeen] = useEncryptionGuideSeen()
  // No other device of mine to approve this one from: only the recovery key is left.
  const alone = useHasOtherDevices() === false

  // Approved from another device: the keys are here now.
  useEffect(() => {
    if (approval?.state === 'done') void refresh()
  }, [approval?.state, refresh])

  // The guide first: it explains the recovery key this then asks to save.
  if (!guideSeen) return <EncryptionGuideOnce />
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
        {approval ? (
          <ApprovalProgress view={approval} approvals={approvals} />
        ) : (
          <p>{t('e2ee.recovery.missing')}</p>
        )}
        {entering ? (
          <RecoveryKeyForm
            recovery={recovery}
            onDone={() => setEntering(false)}
            onCancel={() => setEntering(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {asking || alone || !approvals ? null : (
              <Button variant="secure" fullWidth={false} onClick={() => void approvals.request()}>
                {t('e2ee.approval.request')}
              </Button>
            )}
            <Button variant="secondary" fullWidth={false} onClick={() => setEntering(true)}>
              {t('e2ee.recovery.enter')}
            </Button>
          </div>
        )}
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
