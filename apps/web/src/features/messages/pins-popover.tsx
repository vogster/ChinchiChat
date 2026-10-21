import { isInlineImage } from '@chinchi/shared'
import { useQuery } from '@tanstack/react-query'
import { Pin, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HeaderPopover } from '../../components/ui/header-popover'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { useMemberNames } from '../guilds/use-member-names'
import { useMediaUrl } from '../media/media-base'
import { formatMessageTime } from './format-time'
import { jumpToMessage } from './jump-to-message'
import { pinsQueryOptions } from './queries'
import { usePinMessage } from './use-messages'

import type { Channel } from '@chinchi/shared'

/** Server emoji as their `:name:`, not the raw `<:name:id>` they are stored as. */
const CUSTOM_EMOJI = /<a?:([A-Za-z0-9_]{2,32}):\d+>/g

export interface PinsPopoverProps {
  readonly channel: Channel
  /** May unpin (MANAGE_MESSAGES). */
  readonly canUnpin: boolean
  readonly onClose: () => void
}

/** The channel's pinned messages, most recently pinned first, dropped from the header. */
export const PinsPopover = ({ channel, canUnpin, onClose }: PinsPopoverProps) => {
  const { t, i18n } = useTranslation()
  const pins = useQuery(pinsQueryOptions(useApi(), channel.id))
  const unpin = usePinMessage(channel.id)
  const nameOf = useMemberNames(channel.guildId)
  const media = useMediaUrl()
  const [notLoaded, setNotLoaded] = useState<string | null>(null)

  return (
    <HeaderPopover
      label={t('messages.pins')}
      subtitle={`#${channel.name} · ${pins.data?.length ?? 0}`}
      icon={<Pin className="size-[18px]" />}
      onClose={onClose}
    >
      {pins.isError ? (
        <p className="px-3 py-2 text-sm text-danger">{errorMessage(t, pins.error)}</p>
      ) : null}
      {unpin.isError ? (
        <p className="px-3 py-2 text-sm text-danger">{errorMessage(t, unpin.error)}</p>
      ) : null}
      {pins.data?.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-faint">{t('messages.pinsEmpty')}</p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {(pins.data ?? []).map((message) => {
          const image = message.attachments.find((file) => isInlineImage(file.contentType))
          return (
            <li key={message.id} className="flex flex-col gap-2 rounded-[20px] bg-stage p-3.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate text-[13px] font-semibold">
                  {message.author ? nameOf(message.author) : t('messages.deletedUser')}
                </span>
                <time dateTime={message.createdAt} className="shrink-0 text-xs text-faint">
                  {formatMessageTime(message.createdAt, i18n.language)}
                </time>
                {canUnpin ? (
                  <button
                    type="button"
                    aria-label={t('messages.unpin')}
                    title={t('messages.unpin')}
                    onClick={() => unpin.mutate({ messageId: message.id, pinned: false })}
                    className="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-field hover:text-text"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                ) : null}
              </div>
              {message.content ? (
                <p className="line-clamp-3 text-sm break-words whitespace-pre-wrap text-body">
                  {message.content.replace(CUSTOM_EMOJI, ':$1:')}
                </p>
              ) : null}
              {image ? (
                <img
                  src={media(image.previewUrl ?? image.url)}
                  alt={image.filename}
                  loading="lazy"
                  className="max-h-40 w-full rounded-tile object-cover"
                />
              ) : null}
              <button
                type="button"
                onClick={() => {
                  // Closing first lets focus land on the message once it is in view.
                  if (!document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)) {
                    setNotLoaded(message.id)
                    return
                  }
                  onClose()
                  requestAnimationFrame(() => jumpToMessage(message.id))
                }}
                className="h-8 self-start rounded-full bg-field px-3 text-xs font-medium text-accent-text transition hover:brightness-110"
              >
                {t('messages.jumpToMessage')}
              </button>
              {notLoaded === message.id ? (
                <p role="status" className="text-xs text-faint">
                  {t('messages.notLoaded')}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </HeaderPopover>
  )
}
