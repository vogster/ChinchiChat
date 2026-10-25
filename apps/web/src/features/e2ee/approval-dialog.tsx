import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { useApprovals } from './use-approvals'

/** The six emoji both devices show, large enough to compare at a glance. */
export const ApprovalEmoji = ({
  emoji,
  align = 'center',
}: {
  emoji: readonly string[]
  /** `start` beside left-aligned text (the new device's notice). */
  align?: 'center' | 'start'
}) => {
  const { t } = useTranslation()
  return (
    <div
      role="group"
      aria-label={t('e2ee.approval.emojiLabel')}
      // All six must show to be compared: on a phone the row wraps rather than run off the edge.
      className={`flex flex-wrap gap-3 py-2 text-4xl sm:gap-4 ${align === 'center' ? 'justify-center' : 'justify-start'}`}
    >
      {emoji.map((item, index) => (
        // Emoji may repeat; their place is what tells them apart.
        <span key={index}>{item}</span>
      ))}
    </div>
  )
}

/** Before anything is sent: is this you, and is this the device to compare emoji on? */
const Asked = ({ onCompare, onDecline }: { onCompare: () => void; onDecline: () => void }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('e2ee.approval.askedHint')}</p>
      <div className="flex flex-col-reverse gap-2">
        <Button variant="secondary" onClick={onDecline}>
          {t('e2ee.approval.no')}
        </Button>
        <Button onClick={onCompare}>{t('e2ee.approval.compareHereButton')}</Button>
      </div>
    </div>
  )
}

/**
 * On every approved device, anywhere in the app: "New sign-in: Phone. Is this you?". The person
 * picks the device in front of them to compare emoji on; only that one answers the new device,
 * and the others close. Yes hands the new device its keys; no stops it.
 */
export const ApprovalDialog = () => {
  const { t } = useTranslation()
  const { views, approvals } = useApprovals()
  const view = views.find((v) => v.role === 'approver')

  // Over (approved or turned down): the dialog closes on its own.
  useEffect(() => {
    if (view && (view.state === 'done' || view.state === 'declined')) {
      approvals?.dismiss(view.approvalId)
    }
  }, [view, approvals])

  if (!view || !approvals || view.state === 'done' || view.state === 'declined') return null
  const { approvalId, state } = view
  // Until this device is picked (or once another one was), closing only hides it here.
  const local = state === 'asked' || state === 'elsewhere'
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return
        if (local) approvals.dismiss(approvalId)
        else void approvals.decline(approvalId)
      }}
      title={t('e2ee.approval.title')}
      description={t('e2ee.approval.question', {
        device: view.deviceName ?? t('settings.sessions.unknownDevice'),
      })}
    >
      {state === 'asked' ? (
        <Asked
          onCompare={() => void approvals.compareHere(approvalId)}
          onDecline={() => void approvals.decline(approvalId)}
        />
      ) : state === 'elsewhere' ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t('e2ee.approval.elsewhere')}</p>
          <Button variant="secondary" onClick={() => approvals.dismiss(approvalId)}>
            {t('e2ee.approval.elsewhereOk')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {view.emoji ? (
            <>
              <ApprovalEmoji emoji={view.emoji} />
              <p className="text-sm text-muted">{t('e2ee.approval.compareHint')}</p>
            </>
          ) : (
            <p className="text-sm text-muted">{t('e2ee.approval.preparing')}</p>
          )}
          {/* One under the other: side by side, the longer label wraps. Yes on top. */}
          <div className="flex flex-col-reverse gap-2">
            <Button variant="secondary" onClick={() => void approvals.decline(approvalId)}>
              {t('e2ee.approval.no')}
            </Button>
            <Button
              disabled={state !== 'compare'}
              onClick={() => void approvals.confirm(approvalId)}
            >
              {t('e2ee.approval.yes')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
