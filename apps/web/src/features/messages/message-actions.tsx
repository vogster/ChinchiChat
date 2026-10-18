import {
  Flag,
  Forward,
  Megaphone,
  MessagesSquare,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmojiPicker } from '../emoji/emoji-picker'
import { QUICK_REACTIONS } from './reaction-cache'

import type { EmojiPickerProps } from '../emoji/emoji-picker'
import type { MessageItem as Item } from './queries'
import type { MouseEvent, ReactNode } from 'react'

const actionClass =
  'grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-field hover:text-text'

const Action = ({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string
  onClick: (event: MouseEvent) => void
  danger?: boolean
  children: ReactNode
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`${actionClass} ${danger ? 'text-danger hover:bg-danger-soft hover:text-danger' : ''}`}
  >
    {children}
  </button>
)

export interface MessageActionsProps {
  readonly message: Item
  /** Own messages sit on the right, so their toolbar opens on the left. */
  readonly mine: boolean
  readonly open: boolean
  readonly onPickingChange: (picking: boolean) => void
  readonly canReact: boolean
  readonly onToggleReaction: (emoji: string) => void
  readonly customEmojis?: EmojiPickerProps['custom']
  readonly onReply?: (() => void) | undefined
  readonly onForward?: (() => void) | undefined
  readonly onTogglePin?: (() => void) | undefined
  readonly onStartEdit?: (() => void) | undefined
  readonly onPublish?: (() => void) | undefined
  readonly onStartThread?: (() => void) | undefined
  readonly onReport?: (() => void) | undefined
  /** `skipConfirm` when Shift is held, as in Discord. */
  readonly onDelete?: ((skipConfirm: boolean) => void) | undefined
}

/** The floating toolbar over a hovered message. */
export const MessageActions = ({
  message,
  mine,
  open,
  onPickingChange,
  canReact,
  onToggleReaction,
  customEmojis,
  onReply,
  onForward,
  onTogglePin,
  onStartEdit,
  onPublish,
  onStartThread,
  onReport,
  onDelete,
}: MessageActionsProps) => {
  const { t } = useTranslation()
  return (
    <div
      role="toolbar"
      aria-label={t('messages.actions')}
      data-open={open ? '' : undefined}
      className={`absolute -top-4 z-10 hidden gap-0.5 rounded-full bg-side p-1 shadow-popover group-focus-within:flex group-hover:flex data-open:flex ${mine ? 'left-4' : 'right-4'}`}
    >
      {canReact ? (
        <EmojiPicker
          label={t('messages.addReaction')}
          trigger={<SmilePlus aria-hidden className="size-4" />}
          triggerClassName={actionClass}
          onSelect={onToggleReaction}
          onOpenChange={onPickingChange}
          custom={customEmojis ?? null}
          quick={QUICK_REACTIONS.map((emoji) => ({
            emoji,
            label: t(
              message.reactions.some((r) => r.emoji === emoji && r.me)
                ? 'messages.unreactWith'
                : 'messages.reactWith',
              { emoji },
            ),
          }))}
        />
      ) : null}
      {onReply ? (
        <Action label={t('messages.reply')} onClick={onReply}>
          <Reply aria-hidden className="size-4" />
        </Action>
      ) : null}
      {onForward ? (
        <Action label={t('forward.action')} onClick={onForward}>
          <Forward aria-hidden className="size-4" />
        </Action>
      ) : null}
      {onTogglePin ? (
        <Action label={t(message.pinned ? 'messages.unpin' : 'messages.pin')} onClick={onTogglePin}>
          {message.pinned ? (
            <PinOff aria-hidden className="size-4" />
          ) : (
            <Pin aria-hidden className="size-4" />
          )}
        </Action>
      ) : null}
      {onStartEdit ? (
        <Action label={t('messages.edit')} onClick={onStartEdit}>
          <Pencil aria-hidden className="size-4" />
        </Action>
      ) : null}
      {onPublish ? (
        <Action label={t('announcements.publish')} onClick={onPublish}>
          <Megaphone aria-hidden className="size-4" />
        </Action>
      ) : null}
      {onStartThread ? (
        <Action label={t('threads.start')} onClick={onStartThread}>
          <MessagesSquare aria-hidden className="size-4" />
        </Action>
      ) : null}
      {onReport ? (
        <Action label={t('reports.action')} onClick={onReport}>
          <Flag aria-hidden className="size-4" />
        </Action>
      ) : null}
      {onDelete ? (
        <Action label={t('messages.delete')} danger onClick={(event) => onDelete(event.shiftKey)}>
          <Trash2 aria-hidden className="size-4" />
        </Action>
      ) : null}
    </div>
  )
}
