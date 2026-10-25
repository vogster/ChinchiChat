import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { ApprovalEmoji } from './approval-dialog'

import type { ApprovalView, DeviceApprovals } from './device-approval'

/**
 * On the new device, once the emoji are up: the same window as on the device approving it, to
 * compare the two side by side. Closing it before yes is a no; after yes it only hides, and the
 * banner keeps saying what is left.
 */
export const NewDeviceApprovalDialog = ({
  view,
  approvals,
}: {
  view: ApprovalView
  approvals: DeviceApprovals
}) => {
  const { t } = useTranslation()
  const [hidden, setHidden] = useState<string | null>(null)
  if (view.state !== 'compare' || !view.emoji || hidden === view.approvalId) return null

  const hide = () => setHidden(view.approvalId)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return
        if (view.confirmedHere) hide()
        else void approvals.decline(view.approvalId)
      }}
      title={t('e2ee.approval.newTitle')}
    >
      <div className="flex flex-col gap-4">
        <ApprovalEmoji emoji={view.emoji} />
        <p className="text-sm text-muted">
          {t(view.confirmedHere ? 'e2ee.approval.waitingThere' : 'e2ee.approval.compareHere')}
        </p>
        {view.approvedThere && !view.confirmedHere ? (
          <p className="text-sm text-muted">{t('e2ee.approval.approvedThere')}</p>
        ) : null}
        {view.confirmedHere ? (
          <Button variant="secondary" onClick={hide}>
            {t('e2ee.approval.ok')}
          </Button>
        ) : (
          // One under the other, as on the other device. Yes on top.
          <div className="flex flex-col-reverse gap-2">
            <Button variant="secondary" onClick={() => void approvals.decline(view.approvalId)}>
              {t('e2ee.approval.differ')}
            </Button>
            <Button onClick={() => void approvals.confirm(view.approvalId)}>
              {t('e2ee.approval.yes')}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  )
}
