import { Megaphone, Paperclip, Pin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { InteractionHeader } from '../commands/interaction-header'
import { EncryptedAttachments } from '../e2ee/encrypted-attachments'
import { EmojiPicker } from '../emoji/emoji-picker'
import { MessageContent } from '../markdown/message-content'
import { ProfileTrigger } from '../profile/profile-trigger'
import { AttachmentList } from './attachment-list'
import { bubbleShape } from './bubble-shape'
import { EditBox } from './edit-box'
import { EmbedCard } from './embed-card'
import { formatMessageTime, formatShortTime } from './format-time'
import { ForwardDialog } from './forward-dialog'
import { ForwardedBlock } from './forwarded-block'
import { MessageHeader } from './message-header'
import { MessageMenu } from './message-menu'
import { PollCard } from './poll-card'
import { QUICK_REACTIONS } from './reaction-cache'
import { ReactionsBar } from './reactions-bar'
import { ReplyHeader } from './reply-header'
import { ThreadCard } from './thread-card'
import { UploadBar } from './upload-bar'

import type { EmojiPickerProps } from '../emoji/emoji-picker'
import type { GroupPosition } from './bubble-shape'
import type { MessageItem as Item } from './queries'
import type { Channel } from '@chinchi/shared'

export interface MessageItemProps {
  readonly message: Item
  /** Continues the author's run: no header. */
  readonly compact: boolean
  /** Where it sits in the run, for the bubble's corners and the avatar at the run's foot. */
  readonly position?: GroupPosition
  /** Written by the viewer: on the right, in the accent. */
  readonly mine?: boolean
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

export const MessageItem = ({
  message,
  compact,
  position = compact ? 'last' : 'single',
  mine = false,
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
  // The full emoji picker, opened from the menu's "+".
  const [picking, setPicking] = useState(false)
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
  const endsRun = position === 'single' || position === 'last'
  const hasText = message.content.trim() !== ''

  const suffix = (
    <>
      {message.pinned ? (
        <Pin
          role="img"
          aria-label={t('messages.pinned')}
          className="ml-1 inline size-3.5 align-[-2px] opacity-70"
        />
      ) : null}
      {message.editedAt ? (
        <span
          className="ml-1 text-[11px] opacity-70"
          title={t('messages.editedAt', {
            time: formatMessageTime(message.editedAt, i18n.language),
          })}
        >
          {t('messages.edited')}
        </span>
      ) : null}
    </>
  )
  const bubble = editing ? (
    <EditBox initial={message.content} onSave={onSaveEdit} onCancel={onCancelEdit} />
  ) : hasText || message.pinned || message.editedAt ? (
    <div
      className={`px-3.5 py-[9px] leading-[1.45] text-pretty ${bubbleShape(mine, position)} ${mine ? 'max-w-[min(560px,100%)] bg-accent text-accent-contrast [&_a]:text-current [&_a]:underline' : 'max-w-full bg-field text-body'} ${message.pending ? 'opacity-60' : ''}`}
    >
      <MessageContent content={message.content} className="whitespace-pre-wrap" suffix={suffix} />
    </div>
  ) : null

  return (
    <MessageMenu
      message={message}
      disabled={!showActions}
      canReact={canReact}
      onToggleReaction={onToggleReaction}
      onMoreReactions={() => setPicking(true)}
      onReply={canReply ? onReply : undefined}
      onForward={canForward ? () => setForwarding(true) : undefined}
      onTogglePin={canPin ? onTogglePin : undefined}
      onStartEdit={canEdit ? onStartEdit : undefined}
      onPublish={onPublish}
      onStartThread={onStartThread}
      onReport={onReport}
      onDelete={canDelete ? onDelete : undefined}
    >
      <li
        data-message-id={message.id}
        data-side={mine ? 'mine' : 'other'}
        data-group={position}
        // Focusable from code only (jump to a pinned or replied-to message).
        tabIndex={-1}
        data-mentioned={mentioned || undefined}
        className={`group relative mx-2 flex items-end gap-2.5 rounded-[20px] px-3 py-px transition-colors duration-300 data-flash:bg-accent-soft ${mine ? 'flex-row-reverse' : ''} ${compact ? '' : 'mt-(--zl-message-group-gap) pt-1.5'} ${endsRun ? 'pb-1.5' : ''}`}
      >
        {mentioned ? (
          // A separate layer, so the highlight never fights the row's own background.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[20px] bg-mention/12 shadow-[inset_3px_0_0_var(--zl-mention)]"
          />
        ) : null}
        {mine ? null : (
          <div className="w-[38px] shrink-0">
            {endsRun ? (
              message.author ? (
                <ProfileTrigger
                  userId={message.author.id}
                  guildId={guildId}
                  name={name}
                  className="block rounded-[14px] hover:no-underline hover:brightness-105"
                >
                  <Avatar
                    name={name}
                    src={message.author.avatarUrl}
                    id={message.author.id}
                    rounded="rounded-[14px]"
                    className="size-[38px] text-[13px]"
                  />
                </ProfileTrigger>
              ) : (
                <Avatar name={name} src={null} rounded="rounded-[14px]" className="size-[38px]" />
              )
            ) : null}
          </div>
        )}

        <div
          className={`flex min-w-0 flex-1 flex-col gap-[3px] ${mine ? 'items-end' : 'max-w-[640px] items-start'}`}
        >
          {compact ? null : (
            <MessageHeader
              message={message}
              name={name}
              mine={mine}
              authorColor={authorColor}
              guildId={guildId}
            />
          )}
          {message.reply ? <ReplyHeader reply={message.reply} guildId={guildId} /> : null}
          {message.interaction ? (
            <InteractionHeader interaction={message.interaction} guildId={guildId} />
          ) : null}
          <div className={`flex max-w-full items-center gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
            {bubble}
            {compact && !editing ? (
              <time
                dateTime={message.createdAt}
                className="invisible shrink-0 text-[11px] text-faint group-hover:visible"
              >
                {formatShortTime(message.createdAt, i18n.language)}
              </time>
            ) : null}
          </div>
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
          {/* While the files go up: one pill with them and how far; otherwise each file's name. */}
          {message.pending === 'sending' && message.upload ? (
            <UploadBar upload={message.upload} files={message.files ?? []} />
          ) : message.pending && message.files ? (
            <ul className="flex flex-wrap gap-1.5">
              {message.files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-1 rounded-full bg-field px-2.5 py-0.5 text-xs text-muted"
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
          {thread ? <ThreadCard thread={thread} /> : null}
          {message.pending ? null : (
            <ReactionsBar reactions={message.reactions} onToggle={onToggleReaction} />
          )}
          {onPublish && !editing ? (
            // In plain sight: without publishing, the followers never get the message.
            <Button
              variant="link"
              onClick={onPublish}
              title={t('announcements.publishAction')}
              className="inline-flex items-center gap-1 px-1"
            >
              <Megaphone aria-hidden className="size-3.5" />
              {t('announcements.publish')}
            </Button>
          ) : null}
          {message.pending === 'failed' ? (
            <div role="alert" className="flex items-center gap-3 px-1 text-sm text-danger">
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

        {canReact ? (
          // The full picker, opened by the menu's "+": it hangs from the row's top corner.
          <EmojiPicker
            label={t('messages.addReaction')}
            trigger={null}
            open={picking}
            onOpenChange={setPicking}
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
        {forwarding ? <ForwardDialog message={message} onOpenChange={setForwarding} /> : null}
      </li>
    </MessageMenu>
  )
}
