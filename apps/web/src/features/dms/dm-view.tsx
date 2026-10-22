import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Lock,
  LogOut,
  Pencil,
  Phone,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../components/layout/main-card'
import { headerButtonClass, PageHeader, PageTitle } from '../../components/layout/page-header'
import { Alert } from '../../components/ui/alert'
import { useApi } from '../../lib/api-context'
import { useCurrentUser } from '../auth/use-auth-actions'
import { BetaBadge } from '../e2ee/beta-badge'
import { DowngradeNotice, EncryptionNotice, EncryptionStatus } from '../e2ee/encryption-notice'
import { GroupNotices } from '../e2ee/group-notices'
import { LocalSearchPanel } from '../e2ee/local-search-panel'
import { MissingHistoryButton, RecoveryPrompt } from '../e2ee/recovery-prompt'
import { SafetyDialog } from '../e2ee/safety-dialog'
import { SafetyWarning } from '../e2ee/safety-warning'
import { useEncryptedChannel, useEncryptedConversation } from '../e2ee/use-encrypted-conversation'
import { useEncryptionDowngrade } from '../e2ee/use-encryption-downgrade'
import { useSafety } from '../e2ee/use-safety'
import { relationshipsQueryOptions } from '../friends/queries'
import { dmMentions } from '../mentions/mention-candidates'
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
  useSendMessage,
  useToggleReaction,
  useTypingNotifier,
} from '../messages/use-messages'
import { usePendingFiles } from '../messages/use-pending-files'
import { usePresence } from '../messages/use-presence'
import { NotificationSettingsPopover } from '../notifications/notification-settings-dialog'
import { SearchBox } from '../search/search-box'
import { DmCall } from '../voice/dm-call'
import { statesInChannel, useVoiceStates } from '../voice/queries'
import { useVoiceEnabled } from '../voice/use-voice-people'
import { useVoice } from '../voice/voice-context'
import { AddToGroupDialog } from './dialogs/add-to-group-dialog'
import { DeleteEncryptedDialog } from './dialogs/delete-encrypted-dialog'
import { LeaveGroupDialog } from './dialogs/leave-group-dialog'
import { RenameGroupDialog } from './dialogs/rename-group-dialog'
import { privateChannelName, userName } from './dm-names'
import { GroupMembersPanel } from './group-members-panel'

import type { MessageItem, MessagePages } from '../messages/queries'
import type { PrivateChannel } from '@chinchi/shared'

const newNonce = () => crypto.randomUUID()

type OpenDialog = 'rename' | 'add' | 'leave' | 'delete' | null

const headerButton = headerButtonClass

/** A 1:1 or group DM: the server channel view without roles, pins or moderation. */
export const DmView = ({ channel }: { channel: PrivateChannel }) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const me = useCurrentUser()
  const { data: relationships = [] } = useQuery(relationshipsQueryOptions(useApi()))
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [showMembers, setShowMembers] = useState(true)
  const [notifications, setNotifications] = useState(false)
  const [checking, setChecking] = useState(false)
  const [search, setSearch] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MessageItem | null>(null)
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null)
  const [replyMention, setReplyMention] = useState(true)

  const edit = useEditMessage(channel.id)
  const remove = useDeleteMessage(channel.id)
  const discard = useDiscardFailed(channel.id)
  const typing = useTypingNotifier(channel.id)
  const react = useToggleReaction(channel.id)
  const pending = usePendingFiles()
  const encryption = useEncryptedChannel(channel, me?.id)
  const encrypted = useEncryptedConversation(encryption)
  // Encrypted: the same optimistic message and upload progress, sent through encryption.
  const send = useSendMessage(
    channel.id,
    null,
    encryption
      ? ({ content, nonce, files, reply }, onProgress) =>
          encrypted.send(content, {
            nonce,
            ...(files ? { files } : {}),
            ...(reply
              ? { reply: { messageId: reply.messageId, mention: reply.mentionsAuthor } }
              : {}),
            onProgress,
          })
      : undefined,
  )
  const safety = useSafety(encryption, encrypted.state === 'ready')
  const allVerified =
    (safety.status?.people.length ?? 0) > 0 &&
    (safety.status?.people.every((person) => person.verified) ?? false)
  const keysReady = encrypted.state === 'ready' || encrypted.state === 'waiting'
  const canAttach = pending.enabled

  const isGroup = channel.type === 'group_dm'
  // An encrypted conversation is deleted for everyone: by either person, in a group by its owner.
  const canDelete = channel.encrypted && (!isGroup || channel.ownerId === me?.id)
  const name = privateChannelName(t, channel)
  const [other] = channel.recipients
  const otherStatus = usePresence(other?.id)
  // Only a block you made is known here; the server answers anything else.
  const blocked =
    !isGroup &&
    other !== undefined &&
    relationships.some((r) => r.user.id === other.id && r.type === 'blocked')
  const downgraded = useEncryptionDowngrade(channel)
  const canTalk = !blocked && !downgraded
  const voice = useVoice()
  const voiceEnabled = useVoiceEnabled()
  const inCall = voice.channelId === channel.id && voice.status !== 'idle'
  const callStates = statesInChannel(useVoiceStates(), channel.id)
  const everyone = me ? [me, ...channel.recipients] : channel.recipients
  const callPerson = (userId: string) => {
    const user = everyone.find((u) => u.id === userId) ?? null
    return { name: user ? userName(user) : userId, user }
  }

  const sendContent = (content: string) => {
    typing.sent()
    send.mutate({
      content,
      nonce: newNonce(),
      ...(replyingTo ? { reply: toReply(replyingTo, replyMention) } : {}),
      ...(pending.files.length > 0 ? { files: pending.files.map(({ file }) => file) } : {}),
    })
    setReplyingTo(null)
    pending.clear()
  }

  /** A recorded voice message goes out at once, as a message with just that file. */
  const sendVoice = (file: File) => {
    send.mutate({
      content: '',
      nonce: newNonce(),
      ...(replyingTo ? { reply: toReply(replyingTo, replyMention) } : {}),
      files: [file],
    })
    setReplyingTo(null)
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
      <MainCard>
        <PageHeader>
          <PageTitle
            glyph={
              encryption ? (
                <Lock className="size-5" />
              ) : isGroup ? (
                <Users className="size-5" />
              ) : (
                '@'
              )
            }
            tone={encryption ? 'secure' : 'accent'}
            title={name}
            subtitle={
              encryption ? (
                // Green: at a glance, this conversation is end-to-end encrypted.
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="flex h-5 items-center gap-1 rounded-full bg-secure-soft px-2 text-[11.5px] font-medium text-secure-text">
                    <Lock aria-hidden className="size-3" />
                    {t('e2ee.badge')}
                  </span>
                  <BetaBadge />
                </span>
              ) : isGroup ? (
                t('dm.groupSize', { count: channel.recipients.length + 1 })
              ) : (
                t(`presence.${otherStatus}`)
              )
            }
          />
          {encryption ? (
            <>
              {/* Narrow screens: the field opens from this button, as in server channels. */}
              <button
                type="button"
                aria-label={t('search.open')}
                aria-pressed={searchOpen}
                onClick={() => setSearchOpen((value) => !value)}
                className={`${headerButton} lg:hidden`}
              >
                <Search aria-hidden className="size-5" />
              </button>
              <SearchBox onSearch={setSearch} open={searchOpen} />
            </>
          ) : null}
          <span className="flex shrink-0 gap-0.5">
            {encryption ? (
              <MissingHistoryButton ready={keysReady} className={headerButton} />
            ) : null}
            {encryption ? (
              <button
                type="button"
                aria-label={t('e2ee.safety.title')}
                title={t('e2ee.safety.title')}
                onClick={() => setChecking(true)}
                data-verified={allVerified}
                className={`${headerButton} data-[verified=true]:text-secure-text`}
              >
                <ShieldCheck aria-hidden className="size-5" />
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t('notifications.dmButton')}
              title={t('notifications.dmButton')}
              aria-pressed={notifications}
              onClick={() => setNotifications((value) => !value)}
              className={headerButton}
            >
              <Bell aria-hidden className="size-5" />
            </button>
            {canDelete ? (
              <button
                type="button"
                aria-label={t('dm.delete')}
                title={t('dm.delete')}
                onClick={() => setDialog('delete')}
                className={`${headerButton} hover:bg-danger-soft hover:text-danger`}
              >
                <Trash2 aria-hidden className="size-5" />
              </button>
            ) : null}
            {voiceEnabled && canTalk && !inCall ? (
              <button
                type="button"
                aria-label={t('voice.call')}
                title={t('voice.call')}
                onClick={() => void voice.join(null, channel.id)}
                className={headerButton}
              >
                <Phone aria-hidden className="size-5" />
              </button>
            ) : null}
          </span>
          {isGroup ? (
            <span className="flex shrink-0 gap-0.5">
              <button
                type="button"
                aria-label={t('dm.rename')}
                title={t('dm.rename')}
                onClick={() => setDialog('rename')}
                className={headerButton}
              >
                <Pencil aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                aria-label={t('dm.add')}
                title={t('dm.add')}
                onClick={() => setDialog('add')}
                className={headerButton}
              >
                <UserPlus aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                aria-pressed={showMembers}
                aria-label={showMembers ? t('dm.hideMembers') : t('dm.showMembers')}
                onClick={() => setShowMembers((value) => !value)}
                className={`${headerButton} hidden xl:grid`}
              >
                <Users aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                aria-label={t('dm.leave')}
                title={t('dm.leave')}
                onClick={() => setDialog('leave')}
                className={`${headerButton} hover:bg-danger-soft hover:text-danger`}
              >
                <LogOut aria-hidden className="size-5" />
              </button>
            </span>
          ) : null}
        </PageHeader>

        {inCall || callStates.length > 0 ? (
          <DmCall
            channelId={channel.id}
            myId={me?.id}
            states={callStates}
            person={callPerson}
            encrypted={encryption !== undefined}
            canJoin={canTalk}
          />
        ) : null}

        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onDragOver={(event) => {
            if (canTalk && canAttach && event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
            }
          }}
          onDrop={(event) => {
            if (!canTalk || !canAttach || event.dataTransfer.files.length === 0) return
            event.preventDefault()
            pending.add([...event.dataTransfer.files])
          }}
        >
          <MessageList
            channel={{ id: channel.id, name, guildId: null }}
            people={me ? [me, ...channel.recipients] : channel.recipients}
            label={t('dm.listLabel', { name })}
            start={
              encryption ? (
                <EncryptionNotice />
              ) : (
                <p className="px-4 pt-8 pb-4 text-muted">
                  {isGroup ? t('dm.startGroup', { name }) : t('dm.start', { name })}
                </p>
              )
            }
            encryption={encryption}
            canEditOwn
            myId={me?.id}
            myRoleIds={[]}
            canModerate={false}
            canReply={canTalk}
            onReply={(message) => {
              setReplyingTo(message)
              setReplyMention(true)
            }}
            canReact={canTalk}
            canPin={false}
            onTogglePin={() => undefined}
            onToggleReaction={(message, emoji) => {
              if (encryption) {
                // The whole set goes, encrypted: the server never learns which emoji.
                const own = message.reactions.filter((r) => r.me).map((r) => r.emoji)
                const next = own.includes(emoji) ? own.filter((e) => e !== emoji) : [...own, emoji]
                void encrypted.react(message.id, next).catch(() => undefined)
                return
              }
              const mine = message.reactions.find((r) => r.emoji === emoji)?.me ?? false
              react.mutate({ messageId: message.id, emoji, add: !mine })
            }}
            editingId={editingId}
            onStartEdit={(message) => setEditingId(message.id)}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={(message, content) => {
              setEditingId(null)
              if (encryption) void encrypted.edit(message.id, content).catch(() => undefined)
              else edit.mutate({ messageId: message.id, content })
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
          {canTalk && canAttach ? (
            <PendingFilesList files={pending.files} onRemove={pending.remove} />
          ) : null}
          {pending.error ? (
            <div className="mx-4 mt-2">
              <Alert tone="error">{pending.error}</Alert>
            </div>
          ) : null}
          {encryption ? <RecoveryPrompt ready={keysReady} /> : null}
          {encryption?.group ? (
            <GroupNotices
              channel={encryption}
              nameOf={(userId) => callPerson(userId).name}
              onCheck={() => setChecking(true)}
            />
          ) : null}
          {encryption && me ? (
            <SafetyWarning
              safety={safety}
              myId={me.id}
              nameOf={(userId) => callPerson(userId).name}
              onCheck={() => setChecking(true)}
            />
          ) : null}
          <TypingIndicator guildId={null} channelId={channel.id} people={channel.recipients} />
          {downgraded ? (
            <DowngradeNotice />
          ) : encryption && encrypted.state !== 'ready' ? (
            <EncryptionStatus state={encrypted.state} />
          ) : canTalk ? (
            <Composer
              channelName={name}
              mentions={dmMentions(channel)}
              placeholder={
                isGroup ? t('dm.groupPlaceholder', { name }) : t('dm.placeholder', { name })
              }
              onSend={sendContent}
              onTyping={typing.typed}
              onEditLast={editLast}
              attach={canAttach ? { count: pending.files.length, onAdd: pending.add } : null}
              voice={canAttach ? { onSend: sendVoice } : null}
              pollChannelId={encryption ? null : channel.id}
              reply={
                replyingTo
                  ? {
                      authorName: replyingTo.author
                        ? userName(replyingTo.author)
                        : t('messages.deletedUser'),
                      messageId: replyingTo.id,
                      mention: replyMention,
                      onToggleMention: () => setReplyMention((value) => !value),
                      onCancel: () => setReplyingTo(null),
                    }
                  : null
              }
            />
          ) : (
            <p className="mx-4 mb-4 rounded-card bg-stage px-4 py-3 text-sm text-muted">
              {t('dm.blocked')}
            </p>
          )}
        </section>
        {notifications ? (
          <NotificationSettingsPopover
            targetId={channel.id}
            kind="dm"
            name={name}
            onClose={() => setNotifications(false)}
          />
        ) : null}
      </MainCard>
      {encryption && search ? (
        <LocalSearchPanel
          channel={encryption}
          query={search}
          nameOf={(userId) => callPerson(userId).name}
          onClose={() => setSearch(null)}
        />
      ) : isGroup && showMembers && me ? (
        <GroupMembersPanel channel={channel} me={me} />
      ) : null}

      {checking ? (
        <SafetyDialog
          safety={safety}
          nameOf={(userId) => callPerson(userId).name}
          onOpenChange={setChecking}
        />
      ) : null}
      {dialog === 'rename' ? (
        <RenameGroupDialog channel={channel} onOpenChange={(open) => !open && setDialog(null)} />
      ) : null}
      {dialog === 'add' ? (
        <AddToGroupDialog channel={channel} onOpenChange={(open) => !open && setDialog(null)} />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteEncryptedDialog
          channel={channel}
          onOpenChange={(open) => !open && setDialog(null)}
        />
      ) : null}
      {dialog === 'leave' ? (
        <LeaveGroupDialog channel={channel} onOpenChange={(open) => !open && setDialog(null)} />
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
