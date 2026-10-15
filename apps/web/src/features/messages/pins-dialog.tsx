import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { useApi } from '../../lib/api-context'
import { useMemberNames } from '../guilds/use-member-names'
import { errorMessage } from '../../lib/errors'
import { formatMessageTime } from './format-time'
import { jumpToMessage } from './jump-to-message'
import { pinsQueryOptions } from './queries'

import type { Channel } from '@chinchi/shared'

export interface PinsDialogProps {
  readonly channel: Channel
  readonly onOpenChange: (open: boolean) => void
}

/** The channel's pinned messages, most recently pinned first. */
export const PinsDialog = ({ channel, onOpenChange }: PinsDialogProps) => {
  const { t, i18n } = useTranslation()
  const pins = useQuery(pinsQueryOptions(useApi(), channel.id))
  const nameOf = useMemberNames(channel.guildId)
  const [notLoaded, setNotLoaded] = useState<string | null>(null)

  return (
    <Dialog open onOpenChange={onOpenChange} title={t('messages.pins')} size="lg">
      {pins.isError ? <p className="text-sm text-red-400">{errorMessage(t, pins.error)}</p> : null}
      {pins.data?.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('messages.pinsEmpty')}</p>
      ) : null}
      <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        {(pins.data ?? []).map((message) => (
          <li key={message.id} className="rounded-md bg-elevated p-3">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">
                {message.author ? nameOf(message.author) : t('messages.deletedUser')}
              </span>
              <time dateTime={message.createdAt} className="text-xs text-muted">
                {formatMessageTime(message.createdAt, i18n.language)}
              </time>
              <Button
                variant="secondary"
                fullWidth={false}
                className="ml-auto px-2 py-0.5 text-xs"
                onClick={() => {
                  // Close first so focus can move to the message once it is in view.
                  if (!document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)) {
                    setNotLoaded(message.id)
                    return
                  }
                  onOpenChange(false)
                  requestAnimationFrame(() => jumpToMessage(message.id))
                }}
              >
                {t('messages.jump')}
              </Button>
            </div>
            <p className="mt-1 line-clamp-3 text-sm break-words whitespace-pre-wrap">
              {message.content}
            </p>
            {notLoaded === message.id ? (
              <p role="status" className="mt-1 text-xs text-muted">
                {t('messages.notLoaded')}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
