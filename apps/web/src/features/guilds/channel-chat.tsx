import { Permission } from '@chinchi/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'
import { useGuildCommands } from '../commands/use-guild-commands'
import { expandCustomEmoji } from '../emoji/expand-custom-emoji'
import { useGuildMentions } from '../mentions/mention-candidates'
import { Composer } from '../messages/composer'
import { DeleteMessageDialog } from '../messages/delete-message-dialog'
import { MessageList } from '../messages/message-list'
import { PendingFilesList } from '../messages/pending-files'
import { flattenPages, messageKeys } from '../messages/queries'
import { TypingIndicator } from '../messages/typing-indicator'
import {
  toReply,
  useDeleteMessage,
  useDiscardFailed,
  useEditMessage,
  usePinMessage,
  useSendMessage,
  useToggleReaction,
  useTypingNotifier,
} from '../messages/use-messages'
import { usePendingFiles } from '../messages/use-pending-files'
import { useSlowmode } from '../messages/use-slowmode'
import { can } from '../permissions/permissions'
import { useGuildPermissions } from '../permissions/use-guild-permissions'
import { useMemberColors } from '../permissions/use-member-colors'
import { RulesDialog } from './rules-dialog'

import type { MessageItem, MessagePages } from '../messages/queries'
import type { Channel, GuildDetail } from '@chinchi/shared'

const newNonce = () => crypto.randomUUID()

const formatTimeoutEnd = (iso: string, language: string) =>
  new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )

/**
 * A channel's conversation: history, composer and typing. Used for the open channel and for a
 * thread opened beside it, each with its own drafts, replies and edits.
 */
export const ChannelChat = ({
  guild,
  channel,
  autoOpenRules = false,
}: {
  guild: GuildDetail
  channel: Channel
  /** Greets a newcomer with the server's rules (the main chat does; a thread panel doesn't). */
  autoOpenRules?: boolean
}) => {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const me = useCurrentUser()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MessageItem | null>(null)
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null)
  const [replyMention, setReplyMention] = useState(true)
  const mustAcceptRules = guild.myPending && guild.rules !== null
  const [rulesOpen, setRulesOpen] = useState(autoOpenRules && mustAcceptRules)
  // A thread opens with a word about where it came from.
  const parent =
    channel.type === 'thread' ? guild.channels.find((c) => c.id === channel.parentId) : undefined
  const guildPermissions = useGuildPermissions(guild)
  const permissions = guildPermissions.inChannel(channel)
  const mentions = useGuildMentions(guild, can(permissions, Permission.MentionEveryone))
  const authorColor = useMemberColors(guild)

  const send = useSendMessage(channel.id, guild.id)
  const edit = useEditMessage(channel.id)
  const remove = useDeleteMessage(channel.id)
  const discard = useDiscardFailed(channel.id)
  const typing = useTypingNotifier(channel.id)
  const react = useToggleReaction(channel.id)
  const pin = usePinMessage(channel.id)
  const { commands, invoke, refresh } = useGuildCommands(guild.id, channel.id)
  const pending = usePendingFiles()
  const slowmode = useSlowmode(channel, permissions)
  const canAttach = pending.enabled && can(permissions, Permission.AttachFiles)

  const sendContent = (typed: string) => {
    slowmode.sent()
    typing.sent()
    // `:cat:` becomes the server's emoji, as if picked from the picker.
    const content = expandCustomEmoji(typed, guild.emojis)
    send.mutate({
      content,
      nonce: newNonce(),
      ...(replyingTo ? { reply: toReply(replyingTo, replyMention) } : {}),
      ...(pending.files.length > 0 ? { files: pending.files.map(({ file }) => file) } : {}),
    })
    setReplyingTo(null)
    pending.clear()
  }

  const startReply = (message: MessageItem) => {
    setReplyingTo(message)
    setReplyMention(true)
  }

  const editLast = () => {
    const loaded = flattenPages(
      queryClient.getQueryData<MessagePages>(messageKeys.channel(channel.id)),
    )
    const mine = loaded.findLast((m) => m.author?.id === me?.id && !m.pending)
    if (mine) setEditingId(mine.id)
  }

  return (
    <>
      <section
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        // Files dropped anywhere on the channel join the next message.
        onDragOver={(event) => {
          if (canAttach && event.dataTransfer.types.includes('Files')) event.preventDefault()
        }}
        onDrop={(event) => {
          if (!canAttach || event.dataTransfer.files.length === 0) return
          event.preventDefault()
          pending.add([...event.dataTransfer.files])
        }}
      >
        <MessageList
          {...(parent
            ? {
                start: (
                  <div className="px-4 pt-8 pb-4">
                    <h2 className="text-2xl font-bold">
                      {t('threads.welcomeTitle', { name: channel.name })}
                    </h2>
                    <p className="text-muted">
                      {t('threads.welcomeText', { parent: parent.name })}
                    </p>
                  </div>
                ),
              }
            : {})}
          channel={channel}
          myId={me?.id}
          myRoleIds={guild.myRoleIds}
          canModerate={can(permissions, Permission.ManageMessages)}
          canReply={can(permissions, Permission.SendMessages)}
          onReply={startReply}
          canReact={can(permissions, Permission.AddReactions)}
          canPin={can(permissions, Permission.ManageMessages)}
          onTogglePin={(message) => pin.mutate({ messageId: message.id, pinned: !message.pinned })}
          onToggleReaction={(message, emoji) => {
            const mine = message.reactions.find((r) => r.emoji === emoji)?.me ?? false
            react.mutate({ messageId: message.id, emoji, add: !mine })
          }}
          authorColor={authorColor}
          editingId={editingId}
          onStartEdit={(message) => setEditingId(message.id)}
          onCancelEdit={() => setEditingId(null)}
          onSaveEdit={(message, content) => {
            setEditingId(null)
            edit.mutate({ messageId: message.id, content })
          }}
          onDelete={(message, skipConfirm) =>
            skipConfirm ? remove.mutate(message.id) : setConfirmDelete(message)
          }
          onRetry={(message) => {
            if (!message.nonce) return
            discard(message.nonce)
            send.mutate({
              content: message.content,
              nonce: newNonce(),
              ...(message.reply ? { reply: message.reply } : {}),
              ...(message.files ? { files: message.files } : {}),
            })
          }}
          onDiscard={(message) => message.nonce && discard(message.nonce)}
        />
        {canAttach ? <PendingFilesList files={pending.files} onRemove={pending.remove} /> : null}
        {pending.error ? (
          <div className="mx-4 mt-2">
            <Alert tone="error">{pending.error}</Alert>
          </div>
        ) : null}
        {invoke.isError ? (
          <div className="mx-4 mb-2">
            <Alert tone="error">{errorMessage(t, invoke.error)}</Alert>
          </div>
        ) : null}
        {pin.isError ? (
          <div className="mx-4 mb-2">
            <Alert tone="error">{errorMessage(t, pin.error)}</Alert>
          </div>
        ) : null}
        <TypingIndicator guildId={guild.id} channelId={channel.id} />
        {can(permissions, Permission.SendMessages) ? (
          <Composer
            channelName={channel.name}
            mentions={mentions}
            onSend={sendContent}
            onTyping={typing.typed}
            onEditLast={editLast}
            slowmode={slowmode}
            commands={{
              list: commands,
              onRun: (commandId, options) => invoke.mutate({ commandId, options }),
              refresh,
            }}
            customEmojis={
              guild.emojis.length > 0 ? { title: guild.name, emojis: guild.emojis } : null
            }
            attach={canAttach ? { count: pending.files.length, onAdd: pending.add } : null}
            pollChannelId={channel.id}
            reply={
              replyingTo
                ? {
                    authorName: replyingTo.author
                      ? (replyingTo.author.displayName ?? replyingTo.author.username)
                      : t('messages.deletedUser'),
                    messageId: replyingTo.id,
                    mention: replyMention,
                    onToggleMention: () => setReplyMention((value) => !value),
                    onCancel: () => setReplyingTo(null),
                  }
                : null
            }
          />
        ) : mustAcceptRules ? (
          <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-stage px-4 py-3 text-sm">
            <span className="text-muted">{t('rules.mustAccept')}</span>
            <Button fullWidth={false} onClick={() => setRulesOpen(true)}>
              {t('rules.open')}
            </Button>
          </div>
        ) : (
          <p className="mx-4 mb-4 rounded-card bg-stage px-4 py-3 text-sm text-muted">
            {guildPermissions.timeoutUntil
              ? t('moderation.timedOutUntil', {
                  time: formatTimeoutEnd(guildPermissions.timeoutUntil, i18n.language),
                })
              : t('messages.noSendPermission')}
          </p>
        )}
      </section>

      {rulesOpen && mustAcceptRules ? (
        <RulesDialog guild={guild} onClose={() => setRulesOpen(false)} />
      ) : null}
      {confirmDelete ? (
        <DeleteMessageDialog
          message={confirmDelete}
          onOpenChange={(open) => !open && setConfirmDelete(null)}
          onConfirm={() => {
            remove.mutate(confirmDelete.id)
            setConfirmDelete(null)
          }}
        />
      ) : null}
    </>
  )
}
