import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'

import type { MessageItem } from './queries'

export interface DeleteMessageDialogProps {
  readonly message: MessageItem
  readonly onConfirm: () => void
  readonly onOpenChange: (open: boolean) => void
}

export const DeleteMessageDialog = ({
  message,
  onConfirm,
  onOpenChange,
}: DeleteMessageDialogProps) => {
  const { t } = useTranslation()
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('messages.deleteTitle')}
      description={t('messages.deleteText')}
    >
      <div className="flex flex-col gap-4">
        <blockquote className="line-clamp-4 rounded-md bg-sidebar p-3 text-sm whitespace-pre-wrap">
          {message.content}
        </blockquote>
        <p className="text-xs text-muted">{t('messages.deleteHint')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t('messages.delete')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
