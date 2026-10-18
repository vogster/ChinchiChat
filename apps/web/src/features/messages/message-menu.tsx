import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  Copy,
  Flag,
  Forward,
  Megaphone,
  MessagesSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Reply,
  Trash2,
} from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { QUICK_REACTIONS } from './reaction-cache'

import type { MessageItem as Item } from './queries'
import type { MouseEvent, ReactElement, ReactNode } from 'react'

const itemClass =
  'flex h-9 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-[13.5px] outline-none select-none data-[highlighted]:bg-field'

const Entry = ({
  icon,
  danger = false,
  onSelect,
  onClick,
  children,
}: {
  icon: ReactNode
  danger?: boolean
  onSelect: () => void
  onClick?: (event: MouseEvent) => void
  children: ReactNode
}) => (
  <ContextMenu.Item
    onSelect={onSelect}
    onClick={onClick}
    className={`${itemClass} ${danger ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-text'}`}
  >
    <span aria-hidden className={`shrink-0 ${danger ? '' : 'text-muted'}`}>
      {icon}
    </span>
    {children}
  </ContextMenu.Item>
)

/**
 * A right click on a link, an attached picture or video (`data-native-menu`) or on selected text
 * keeps the browser's own menu: copying a link or saving a picture is what it is for.
 */
const wantsBrowserMenu = (target: EventTarget, row: Element) => {
  if (target instanceof Element && target.closest('a[href], video, [data-native-menu]')) {
    return true
  }
  const selection = window.getSelection()
  return (
    selection !== null &&
    !selection.isCollapsed &&
    selection.anchorNode !== null &&
    row.contains(selection.anchorNode)
  )
}

export interface MessageMenuProps {
  readonly message: Item
  /** No actions here (a message still sending, or being edited): the browser's menu stays. */
  readonly disabled: boolean
  readonly canReact: boolean
  readonly onToggleReaction: (emoji: string) => void
  /** Opens the full emoji picker (the "+" after the quick reactions). */
  readonly onMoreReactions: () => void
  readonly onReply?: (() => void) | undefined
  readonly onForward?: (() => void) | undefined
  readonly onTogglePin?: (() => void) | undefined
  readonly onStartEdit?: (() => void) | undefined
  readonly onPublish?: (() => void) | undefined
  readonly onStartThread?: (() => void) | undefined
  readonly onReport?: (() => void) | undefined
  /** `skipConfirm` when Shift is held, as in Discord. */
  readonly onDelete?: ((skipConfirm: boolean) => void) | undefined
  /** The message's row: a right click or a long press on it opens the menu. */
  readonly children: ReactElement
}

/**
 * A message's actions, as in a messenger: right click (long press on a phone, the menu key on a
 * keyboard) opens quick reactions on top and the rest with their names below.
 */
export const MessageMenu = ({
  message,
  disabled,
  canReact,
  onToggleReaction,
  onMoreReactions,
  onReply,
  onForward,
  onTogglePin,
  onStartEdit,
  onPublish,
  onStartThread,
  onReport,
  onDelete,
  children,
}: MessageMenuProps) => {
  const { t } = useTranslation()
  // Shift on the click that picks "delete": onSelect itself does not carry the keys.
  const shift = useRef(false)
  const text = message.content.trim()

  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger
        asChild
        disabled={disabled}
        onContextMenuCapture={(event) => {
          if (wantsBrowserMenu(event.target, event.currentTarget)) event.stopPropagation()
        }}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={t('messages.actions')}
          collisionPadding={8}
          className="z-50 flex w-60 flex-col gap-px rounded-card bg-side p-1.5 text-text shadow-popover"
        >
          {canReact ? (
            <>
              <div className="flex items-center justify-between px-0.5 pb-1">
                {QUICK_REACTIONS.map((emoji) => (
                  <ContextMenu.Item
                    key={emoji}
                    aria-label={t(
                      message.reactions.some((r) => r.emoji === emoji && r.me)
                        ? 'messages.unreactWith'
                        : 'messages.reactWith',
                      { emoji },
                    )}
                    onSelect={() => onToggleReaction(emoji)}
                    className="grid size-9 cursor-pointer place-items-center rounded-full text-lg outline-none transition-transform select-none data-[highlighted]:scale-110 data-[highlighted]:bg-field"
                  >
                    {emoji}
                  </ContextMenu.Item>
                ))}
                <ContextMenu.Item
                  aria-label={t('messages.addReaction')}
                  onSelect={onMoreReactions}
                  className="grid size-9 cursor-pointer place-items-center rounded-full bg-field text-muted outline-none select-none data-[highlighted]:bg-chip data-[highlighted]:text-text"
                >
                  <Plus aria-hidden className="size-4" />
                </ContextMenu.Item>
              </div>
              <ContextMenu.Separator className="mx-1.5 mb-1 h-px bg-line" />
            </>
          ) : null}
          {onReply ? (
            <Entry icon={<Reply className="size-4" />} onSelect={onReply}>
              {t('messages.reply')}
            </Entry>
          ) : null}
          {onForward ? (
            <Entry icon={<Forward className="size-4" />} onSelect={onForward}>
              {t('forward.action')}
            </Entry>
          ) : null}
          {text ? (
            <Entry
              icon={<Copy className="size-4" />}
              onSelect={() => void navigator.clipboard?.writeText(message.content)}
            >
              {t('messages.copyText')}
            </Entry>
          ) : null}
          {onTogglePin ? (
            <Entry
              icon={message.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              onSelect={onTogglePin}
            >
              {t(message.pinned ? 'messages.unpin' : 'messages.pin')}
            </Entry>
          ) : null}
          {onStartEdit ? (
            <Entry icon={<Pencil className="size-4" />} onSelect={onStartEdit}>
              {t('messages.edit')}
            </Entry>
          ) : null}
          {onPublish ? (
            <Entry icon={<Megaphone className="size-4" />} onSelect={onPublish}>
              {t('announcements.publish')}
            </Entry>
          ) : null}
          {onStartThread ? (
            <Entry icon={<MessagesSquare className="size-4" />} onSelect={onStartThread}>
              {t('threads.start')}
            </Entry>
          ) : null}
          {onReport ? (
            <Entry icon={<Flag className="size-4" />} onSelect={onReport}>
              {t('reports.action')}
            </Entry>
          ) : null}
          {onDelete ? (
            <>
              <ContextMenu.Separator className="mx-1.5 my-1 h-px bg-line" />
              <Entry
                icon={<Trash2 className="size-4" />}
                danger
                onClick={(event) => {
                  shift.current = event.shiftKey
                }}
                onSelect={() => {
                  onDelete(shift.current)
                  shift.current = false
                }}
              >
                {t('messages.delete')}
              </Entry>
            </>
          ) : null}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
