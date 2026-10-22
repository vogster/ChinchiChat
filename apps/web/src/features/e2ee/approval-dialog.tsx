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

/**
 * On an approved device, anywhere in the app: "New sign-in: Phone. Is this you?" with the emoji
 * to compare. Yes hands the new device its keys; no stops it.
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
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && void approvals.decline(view.approvalId)}
      title={t('e2ee.approval.title')}
      description={t('e2ee.approval.question', {
        device: view.deviceName ?? t('settings.sessions.unknownDevice'),
      })}
    >
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
          <Button variant="secondary" onClick={() => void approvals.decline(view.approvalId)}>
            {t('e2ee.approval.no')}
          </Button>
          <Button
            disabled={view.state !== 'compare'}
            onClick={() => void approvals.confirm(view.approvalId)}
          >
            {t('e2ee.approval.yes')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
