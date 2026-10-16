import { Link } from '@tanstack/react-router'
import {
  Flag,
  Forward,
  Megaphone,
  Paperclip,
  MessagesSquare,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { formatMessageTime, formatShortTime } from './format-time'
import { Avatar } from '../../components/ui/avatar'
import { ProfileTrigger } from '../profile/profile-trigger'
import { EmojiPicker } from '../emoji/emoji-picker'
import { MessageContent } from '../markdown/message-content'
import { QUICK_REACTIONS } from './reaction-cache'
import { EncryptedAttachments } from '../e2ee/encrypted-attachments'
import { AttachmentList } from './attachment-list'
import { ForwardDialog } from './forward-dialog'
import { ForwardedBlock } from './forwarded-block'
import { PollCard } from './poll-card'
import { EmbedCard } from './embed-card'
import { ReactionsBar } from './reactions-bar'
import { InteractionHeader } from '../commands/interaction-header'
import { ReplyHeader } from './reply-header'

import type { MessageItem as Item } from './queries'
import type { EmojiPickerProps } from '../emoji/emoji-picker'
import type { Channel } from '@chinchi/shared'
import type { KeyboardEvent, MouseEvent } from 'react'

export interface MessageItemProps {
  readonly message: Item
  readonly compact: boolean
  /** Mentions the viewer: highlighted. */
  readonly mentioned?: boolean
  readonly canEdit: boolean
  readonly canDelete: boolean
  /** The viewer may send messages here, so may reply. */
  readonly canReply: boolean
  /** Name color from the author's highest colored role. */
  readonly authorColor?: string | undefined
  /** The author's nickname on this server, shown instead of their name. */
  readonly authorNickname?: string | null | undefined
  /** The server the message is in (for the author's profile card); null in DMs. */
  readonly guildId: string | null
  readonly editing: boolean
  readonly onReply: () => void
  /** May add new reactions (joining existing ones only needs to see the message). */
  readonly canReact: boolean
  /** May pin and unpin (MANAGE_MESSAGES). */
  readonly canPin: boolean
  readonly onTogglePin: () => void
  readonly onToggleReaction: (emoji: string) => void
  readonly onStartEdit: () => void
  readonly onCancelEdit: () => void
  readonly onSaveEdit: (content: string) => void
  /** `skipConfirm` when Shift is held, as in Discord. */
  readonly onDelete: (skipConfirm: boolean) => void
  readonly onRetry: () => void
  readonly onDiscard: () => void
  /** Reporting someone else's message; absent for your own. */
  readonly onReport?: (() => void) | undefined
  /** The thread started from this message, if any. */
  readonly thread?: Channel | undefined
  /** Starting a thread from it; absent where that isn't possible. */
  readonly onStartThread?: (() => void) | undefined
  /** Announcement channels: sends the message to the following channels. */
  readonly onPublish?: (() => void) | undefined
  /** The server's own emoji for the reaction picker. */
  readonly customEmojis?: EmojiPickerProps['custom']
}

const EditBox = ({
  initial,
  onSave,
  onCancel,
}: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
}) => {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') onCancel()
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (value.trim() === '') return
      if (value.trim() === initial.trim()) onCancel()
      else onSave(value)
    }
  }

  return (
    <div className="mt-1">
      <textarea
        aria-label={t('messages.editLabel')}
        autoFocus
        value={value}
        rows={Math.min(8, value.split('\n').length)}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(event) =>
          event.target.setSelectionRange(event.target.value.length, event.target.value.length)
        }
        className="w-full resize-none rounded-md bg-elevated px-3 py-2 outline-none"
      />
      <p className="text-xs text-muted">{t('messages.editHint')}</p>
    </div>
  )
}

export const MessageItem = ({
  message,
  compact,
  mentioned = false,
  canEdit,
  canDelete,
  canReply,
  onReply,
  canReact,
  onToggleReaction,
  canPin,
  onTogglePin,
  authorColor,
  authorNickname,
  guildId,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onRetry,
  onDiscard,
  onReport,
  thread,
  onStartThread,
  onPublish,
  customEmojis,
}: MessageItemProps) => {
  const { t, i18n } = useTranslation()
  const name = message.webhook
    ? message.webhook.name
    : message.author
      ? (authorNickname ?? message.author.displayName ?? message.author.username)
      : t('messages.deletedUser')
  // Encrypted messages stay in their conversation: the server can't copy what it can't read.
  const canForward = !message.pending && !message.system && !message.ciphertext
  const [forwarding, setForwarding] = useState(false)
  const showActions =
    !message.pending &&
    !editing &&
    (canReact ||
      canReply ||
      canPin ||
      canEdit ||
      canDelete ||
      canForward ||
      onPublish !== undefined)

  const content = editing ? (
    <EditBox initial={message.content} onSave={onSaveEdit} onCancel={onCancelEdit} />
  ) : (
    <MessageContent
      content={message.content}
      className={`whitespace-pre-wrap ${message.pending ? 'text-muted' : ''}`}
      suffix={
        <>
          {message.pinned ? (
            <Pin
              role="img"
              aria-label={t('messages.pinned')}
              className="ml-1 inline size-3.5 align-[-2px] text-muted"
            />
          ) : null}
          {message.editedAt ? (
            <span
              className="ml-1 text-[11px] text-muted"
              title={t('messages.editedAt', {
                time: formatMessageTime(message.editedAt, i18n.language),
              })}
            >
              {t('messages.edited')}
            </span>
          ) : null}
        </>
      }
    />
  )

  return (
    <li
      data-message-id={message.id}
      // Focusable from code only (jump to a pinned or replied-to message).
      tabIndex={-1}
      data-mentioned={mentioned || undefined}
      className={`group relative flex gap-4 px-4 hover:bg-black/5 dark:hover:bg-white/[0.03] ${compact ? 'py-0.5' : 'mt-3 py-0.5'}`}
    >
      {mentioned ? (
        // A separate layer, so the highlight never fights the row's hover background.
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 border-l-2 border-mention bg-mention/10"
        />
      ) : null}
      <div className="w-10 shrink-0">
        {compact ? (
          <time
            dateTime={message.createdAt}
            className="invisible block pt-1 text-right text-[11px] text-muted group-hover:visible"
          >
            {formatShortTime(message.createdAt, i18n.language)}
          </time>
        ) : message.author ? (
          <ProfileTrigger
            userId={message.author.id}
            guildId={guildId}
            name={name}
            className="rounded-full hover:no-underline"
          >
            <Avatar name={name} src={message.author.avatarUrl} id={message.author.id} />
          </ProfileTrigger>
        ) : (
          <Avatar name={name} src={null} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {message.reply ? <ReplyHeader reply={message.reply} guildId={guildId} /> : null}
        {message.interaction ? (
          <InteractionHeader interaction={message.interaction} guildId={guildId} />
        ) : null}
        {compact ? null : (
          <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
            {/* A long name shrinks with an ellipsis; the badges and time always stay whole. */}
            {message.author ? (
              <ProfileTrigger
                userId={message.author.id}
                guildId={guildId}
                name={name}
                className="min-w-0 truncate font-medium"
              >
                <span style={authorColor ? { color: authorColor } : undefined}>{name}</span>
              </ProfileTrigger>
            ) : (
              <span className="min-w-0 truncate font-medium">{name}</span>
            )}
            {message.author?.bot ? (
              <span className="shrink-0 rounded bg-accent px-1 text-[10px] font-semibold text-accent-contrast uppercase">
                {t('bots.badge')}
              </span>
            ) : null}
            {message.webhook ? (
              <span className="shrink-0 rounded bg-accent px-1 text-[10px] font-semibold text-accent-contrast uppercase">
                {t('webhooks.badge')}
              </span>
            ) : null}
            <time dateTime={message.createdAt} className="shrink-0 text-xs text-muted">
              {formatMessageTime(message.createdAt, i18n.language)}
            </time>
            {message.published ? (
              <span className="text-xs text-muted">{t('announcements.published')}</span>
            ) : null}
          </div>
        )}
        {content}
        {message.forward ? <ForwardedBlock forward={message.forward} /> : null}
        <AttachmentList attachments={message.attachments} />
        {message.encryptedFiles ? <EncryptedAttachments files={message.encryptedFiles} /> : null}
        {message.poll && !message.pending ? (
          <PollCard
            poll={message.poll}
            channelId={message.channelId}
            messageId={message.id}
            authorId={message.author?.id ?? null}
          />
        ) : null}
        {message.pending && message.files ? (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {message.files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-1 rounded bg-elevated px-2 py-0.5 text-xs text-muted"
              >
                <Paperclip aria-hidden className="size-3" />
                {file.name}
              </li>
            ))}
          </ul>
        ) : null}
        {message.embeds.map((embed) => (
          <EmbedCard key={embed.url} embed={embed} />
        ))}
        {thread ? (
          <Link
            to="/channels/$guildId/$channelId"
            // Opens beside the channel it was started in.
            params={{ guildId: thread.guildId, channelId: thread.parentId ?? thread.id }}
            search={{ thread: thread.id }}
            aria-label={t('threads.chip', { name: thread.name, count: thread.messageCount })}
            className="mt-1 flex w-fit items-center gap-2 rounded-md bg-elevated px-2.5 py-1 text-sm hover:bg-hover"
          >
            <MessagesSquare aria-hidden className="size-4 text-muted" />
            <span className="font-medium">{thread.name}</span>
            <span className="text-muted">{t('threads.count', { count: thread.messageCount })}</span>
          </Link>
        ) : null}
        {message.pending ? null : (
          <ReactionsBar reactions={message.reactions} onToggle={onToggleReaction} />
        )}
        {message.pending === 'failed' ? (
          <div role="alert" className="flex items-center gap-3 text-sm text-red-400">
            {t('messages.failed')}
            <Button variant="link" onClick={onRetry}>
              {t('messages.retry')}
            </Button>
            <Button variant="link" onClick={onDiscard}>
              {t('messages.discard')}
            </Button>
          </div>
        ) : null}
      </div>

      {showActions ? (
        <div
          role="toolbar"
          aria-label={t('messages.actions')}
          className="absolute -top-3 right-4 hidden rounded-md border border-border bg-main shadow group-focus-within:flex group-hover:flex"
        >
          {canReact ? (
            <EmojiPicker
              label={t('messages.addReaction')}
              trigger={<SmilePlus aria-hidden className="size-4" />}
              triggerClassName="p-1.5 text-muted hover:text-text"
              onSelect={onToggleReaction}
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
          {canReply ? (
            <button
              type="button"
              aria-label={t('messages.reply')}
              title={t('messages.reply')}
              onClick={onReply}
              className="p-1.5 text-muted hover:text-text"
            >
              <Reply aria-hidden className="size-4" />
            </button>
          ) : null}
          {canForward ? (
            <button
              type="button"
              aria-label={t('forward.action')}
              title={t('forward.action')}
              onClick={() => setForwarding(true)}
              className="p-1.5 text-muted hover:text-text"
            >
              <Forward aria-hidden className="size-4" />
            </button>
          ) : null}
          {canPin ? (
            <button
              type="button"
              aria-label={t(message.pinned ? 'messages.unpin' : 'messages.pin')}
              title={t(message.pinned ? 'messages.unpin' : 'messages.pin')}
              onClick={onTogglePin}
              className="p-1.5 text-muted hover:text-text"
            >
              {message.pinned ? (
                <PinOff aria-hidden className="size-4" />
              ) : (
                <Pin aria-hidden className="size-4" />
              )}
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              aria-label={t('messages.edit')}
              title={t('messages.edit')}
              onClick={onStartEdit}
              className="p-1.5 text-muted hover:text-text"
            >
              <Pencil aria-hidden className="size-4" />
            </button>
          ) : null}
          {onPublish ? (
            <button
              type="button"
              aria-label={t('announcements.publish')}
              title={t('announcements.publish')}
              onClick={onPublish}
              className="p-1.5 text-muted hover:text-text"
            >
              <Megaphone aria-hidden className="size-4" />
            </button>
          ) : null}
          {onStartThread ? (
            <button
              type="button"
              aria-label={t('threads.start')}
              title={t('threads.start')}
              onClick={onStartThread}
              className="p-1.5 text-muted hover:text-text"
            >
              <MessagesSquare aria-hidden className="size-4" />
            </button>
          ) : null}
          {onReport ? (
            <button
              type="button"
              aria-label={t('reports.action')}
              title={t('reports.action')}
              onClick={onReport}
              className="p-1.5 text-muted hover:text-text"
            >
              <Flag aria-hidden className="size-4" />
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              aria-label={t('messages.delete')}
              title={t('messages.delete')}
              onClick={(event: MouseEvent) => onDelete(event.shiftKey)}
              className="p-1.5 text-red-400 hover:text-red-300"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>
      ) : null}
      {forwarding ? <ForwardDialog message={message} onOpenChange={setForwarding} /> : null}
    </li>
  )
}
