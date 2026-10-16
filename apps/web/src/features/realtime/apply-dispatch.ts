import { replySnippetText } from '@chinchi/shared'

import { authKeys } from '../auth/queries'
import {
  bumpThreadCount,
  removeRole,
  setMemberNickname,
  setMemberRoles,
  setMemberTimeout,
  updateChannels,
  updateGuild,
  upsertChannel,
  upsertRoles,
} from '../guilds/guild-cache'
import { bumpPrivateChannel, removePrivateChannel, upsertPrivateChannel } from '../dms/dm-cache'
import { dmKeys } from '../dms/queries'
import { removeRelationship, upsertRelationship } from '../friends/queries'
import { guildKeys } from '../guilds/queries'
import { flattenPages, messageKeys } from '../messages/queries'
import { withReaction } from '../messages/reaction-cache'
import { countDeletion, countEdit, countNewMessage, setMentionCount } from './mention-counts'
import { applyUserUpdate } from './user-update'
import { profileKeys } from '../profile/queries'
import { applyVoiceState, dropVoiceChannel, seedVoiceStates } from '../voice/queries'

import { notificationKeys, setNotificationSetting } from '../notifications/queries'
import { customStatusKeys, setCustomStatusOf } from '../presence/queries'
import { applyPoll } from '../messages/use-polls'
import type { CustomStatuses } from '../presence/queries'
import type { MessageItem, MessagePages, Presences, ReadStates } from '../messages/queries'
import type { TypingStore } from './typing-store'
import type { QueryClient } from '@tanstack/react-query'
import type {
  Channel,
  CurrentUser,
  DispatchPayload,
  DispatchType,
  Guild,
  GuildDetail,
  Member,
  MentionCounts,
  Message,
  PrivateChannel,
  ReplySnippet,
  NotificationSetting,
} from '@chinchi/shared'

/** Replaces each loaded page through `change`; untouched when the channel was never opened. */
const updatePages = (
  queryClient: QueryClient,
  channelId: string,
  change: (page: MessageItem[], index: number) => MessageItem[],
) =>
  queryClient.setQueryData<MessagePages>(messageKeys.channel(channelId), (data) =>
    data ? { ...data, pages: data.pages.map(change) } : data,
  )

const summaryOf = ({ channels: _channels, ...guild }: GuildDetail): Guild => guild

const onMessageCreate = (queryClient: QueryClient, typing: TypingStore, message: Message) => {
  updatePages(queryClient, message.channelId, (page, index) => {
    if (index !== 0) return page
    if (page.some((m) => m.id === message.id)) return page
    // The server echoes our nonce: swap the optimistic copy for the real message.
    const withoutOptimistic = message.nonce
      ? page.filter((m) => !(m.pending && m.nonce === message.nonce))
      : page
    return [...withoutOptimistic, message]
  })
  if (message.guildId) {
    updateChannels(queryClient, message.guildId, (channels) =>
      channels.map((c) => (c.id === message.channelId ? { ...c, lastMessageId: message.id } : c)),
    )
  } else {
    bumpPrivateChannel(queryClient, message.channelId, message.id)
  }
  if (message.author) typing.stop(message.channelId, message.author.id)

  const me = queryClient.getQueryData<CurrentUser | null>(authKeys.me)
  if (me && message.author?.id === me.id) {
    // Sending reads the channel, mentions included.
    queryClient.setQueryData<ReadStates>(messageKeys.readStates, (states) => ({
      ...states,
      [message.channelId]: message.id,
    }))
    setMentionCount(queryClient, message.channelId, () => 0)
    return
  }
  countNewMessage(queryClient, message)
}

const onReady = (queryClient: QueryClient, ready: DispatchPayload<'READY'>) => {
  queryClient.setQueryData<Guild[]>(guildKeys.all, ready.guilds.map(summaryOf))
  for (const guild of ready.guilds) queryClient.setQueryData(guildKeys.detail(guild.id), guild)
  queryClient.setQueryData<PrivateChannel[]>(dmKeys.all, ready.privateChannels)
  seedVoiceStates(queryClient, ready.voiceStates)
  queryClient.setQueryData<Presences>(
    messageKeys.presences,
    Object.fromEntries(ready.presences.map((p) => [p.userId, p.status])),
  )
  queryClient.setQueryData<ReadStates>(
    messageKeys.readStates,
    Object.fromEntries(ready.readStates.map((s) => [s.channelId, s.lastReadMessageId])),
  )
  queryClient.setQueryData<MentionCounts>(messageKeys.mentionCounts, ready.mentionCounts)
  queryClient.setQueryData<NotificationSetting[]>(notificationKeys.all, ready.notificationSettings)
  queryClient.setQueryData<CustomStatuses>(customStatusKeys.all, {
    ...Object.fromEntries(
      ready.presences.flatMap((p) => (p.customStatus ? [[p.userId, p.customStatus]] : [])),
    ),
    // Mine, also while I am invisible.
    ...(ready.customStatus ? { [ready.user.id]: ready.customStatus } : {}),
  })
}

/** Replies to `originalId` show its new snippet (or that it was deleted). */
const withReplyTo = (
  message: MessageItem,
  originalId: string,
  snippet: ReplySnippet | null,
): MessageItem =>
  message.reply?.messageId === originalId
    ? { ...message, reply: { ...message.reply, message: snippet } }
    : message

/** A pin, unpin or edit of a pinned message: the channel's pins list (if loaded) is stale. */
const refreshPinsIfChanged = (queryClient: QueryClient, message: Message) => {
  const previous = flattenPages(
    queryClient.getQueryData<MessagePages>(messageKeys.channel(message.channelId)),
  ).find((m) => m.id === message.id)
  if (message.pinned || previous?.pinned) refreshPins(queryClient, message.channelId)
}

const refreshPins = (queryClient: QueryClient, channelId: string) =>
  void queryClient.invalidateQueries({ queryKey: messageKeys.pins(channelId) })

/** Applies one gateway dispatch to the client cache. */
export const applyDispatch = (
  queryClient: QueryClient,
  typing: TypingStore,
  type: DispatchType,
  data: unknown,
): void => {
  switch (type) {
    case 'READY':
      return onReady(queryClient, data as DispatchPayload<'READY'>)

    case 'MESSAGE_CREATE': {
      const message = data as Message
      bumpThreadCount(queryClient, message.guildId, message.channelId, 1)
      return onMessageCreate(queryClient, typing, message)
    }

    case 'MESSAGE_UPDATE': {
      const message = data as Message
      countEdit(queryClient, message)
      refreshPinsIfChanged(queryClient, message)
      const snippet = {
        author: message.author,
        content: replySnippetText(message.content),
        attachmentCount: message.attachments.length,
      }
      updatePages(queryClient, message.channelId, (page) =>
        page.map((m) =>
          // Broadcast copies carry no per-viewer reactions: keep the ones we know.
          m.id === message.id
            ? { ...message, reactions: m.reactions }
            : withReplyTo(m, message.id, snippet),
        ),
      )
      return
    }

    case 'MESSAGE_DELETE': {
      const { id, channelId, guildId } = data as DispatchPayload<'MESSAGE_DELETE'>
      bumpThreadCount(queryClient, guildId, channelId, -1)
      countDeletion(queryClient, channelId, id)
      refreshPins(queryClient, channelId)
      updatePages(queryClient, channelId, (page) =>
        page.filter((m) => m.id !== id).map((m) => withReplyTo(m, id, null)),
      )
      return
    }

    case 'MESSAGE_REACTION_ADD':
    case 'MESSAGE_REACTION_REMOVE': {
      const event = data as DispatchPayload<'MESSAGE_REACTION_ADD'>
      const me = queryClient.getQueryData<CurrentUser | null>(authKeys.me)
      const change = {
        emoji: event.emoji,
        add: type === 'MESSAGE_REACTION_ADD',
        mine: event.userId === me?.id,
      }
      updatePages(queryClient, event.channelId, (page) =>
        page.map((m) =>
          m.id === event.messageId ? { ...m, reactions: withReaction(m.reactions, change) } : m,
        ),
      )
      return
    }

    case 'POLL_UPDATE': {
      const { channelId, messageId, poll } = data as DispatchPayload<'POLL_UPDATE'>
      applyPoll(queryClient, channelId, messageId, poll, { keepMine: true })
      return
    }

    case 'E2EE_REACTION_UPDATE': {
      // Someone's encrypted set of reactions changed: the screen decrypts the new one.
      const { channelId, messageId, userId, reaction } =
        data as DispatchPayload<'E2EE_REACTION_UPDATE'>
      updatePages(queryClient, channelId, (page) =>
        page.map((m) =>
          m.id === messageId
            ? {
                ...m,
                encryptedReactions: [
                  ...(m.encryptedReactions ?? []).filter((r) => r.userId !== userId),
                  ...(reaction ? [{ userId, ...reaction }] : []),
                ],
              }
            : m,
        ),
      )
      return
    }

    case 'TYPING_START': {
      const { channelId, userId } = data as DispatchPayload<'TYPING_START'>
      typing.start(channelId, userId)
      return
    }

    case 'PRESENCE_UPDATE': {
      const presence = data as DispatchPayload<'PRESENCE_UPDATE'>
      const { userId, status } = presence
      queryClient.setQueryData<Presences>(messageKeys.presences, (presences = {}) => {
        const { [userId]: _previous, ...rest } = presences
        return status === 'offline' ? rest : { ...rest, [userId]: status }
      })
      const isMe = queryClient.getQueryData<CurrentUser | null>(authKeys.me)?.id === userId
      // Offline people show no custom status (my own stays: I may just be invisible).
      if (presence.customStatus !== undefined) {
        setCustomStatusOf(queryClient, userId, presence.customStatus)
      } else if (status === 'offline' && !isMe) {
        setCustomStatusOf(queryClient, userId, null)
      }
      return
    }

    case 'NOTIFICATION_SETTINGS_UPDATE': {
      const { targetId, setting } = data as DispatchPayload<'NOTIFICATION_SETTINGS_UPDATE'>
      setNotificationSetting(queryClient, targetId, setting)
      return
    }

    case 'CHANNEL_ACK': {
      const { channelId, lastReadMessageId, mentionCount } = data as DispatchPayload<'CHANNEL_ACK'>
      queryClient.setQueryData<ReadStates>(messageKeys.readStates, (states) => ({
        ...states,
        [channelId]: lastReadMessageId,
      }))
      setMentionCount(queryClient, channelId, () => mentionCount)
      return
    }

    case 'GUILD_CREATE': {
      const { presences = [], ...guild } = data as DispatchPayload<'GUILD_CREATE'>
      queryClient.setQueryData(guildKeys.detail(guild.id), guild)
      queryClient.setQueryData<Presences>(messageKeys.presences, (current = {}) => ({
        ...current,
        ...Object.fromEntries(presences.map((p) => [p.userId, p.status])),
      }))
      for (const p of presences) {
        if (p.customStatus) setCustomStatusOf(queryClient, p.userId, p.customStatus)
      }
      queryClient.setQueryData<Guild[]>(guildKeys.all, (guilds = []) =>
        guilds.some((g) => g.id === guild.id) ? guilds : [...guilds, summaryOf(guild)],
      )
      return
    }

    case 'GUILD_UPDATE': {
      const guild = data as Guild
      updateGuild(queryClient, guild.id, (current) => ({ ...current, ...guild }))
      queryClient.setQueryData<Guild[]>(guildKeys.all, (guilds) =>
        guilds?.map((g) => (g.id === guild.id ? guild : g)),
      )
      return
    }

    case 'GUILD_DELETE': {
      const { id } = data as DispatchPayload<'GUILD_DELETE'>
      queryClient.setQueryData<Guild[]>(guildKeys.all, (guilds) =>
        guilds?.filter((g) => g.id !== id),
      )
      queryClient.removeQueries({ queryKey: guildKeys.detail(id) })
      return
    }

    case 'CHANNEL_CREATE':
    case 'CHANNEL_UPDATE':
      upsertChannel(queryClient, data as Channel)
      return

    case 'CHANNEL_DELETE': {
      const { id, guildId } = data as DispatchPayload<'CHANNEL_DELETE'>
      updateChannels(queryClient, guildId, (channels) => channels.filter((c) => c.id !== id))
      queryClient.removeQueries({ queryKey: messageKeys.channel(id) })
      dropVoiceChannel(queryClient, id)
      return
    }

    case 'GUILD_MEMBER_ADD': {
      const { guildId, member } = data as DispatchPayload<'GUILD_MEMBER_ADD'>
      void queryClient.invalidateQueries({ queryKey: profileKeys.user(member.user.id) })
      queryClient.setQueryData<Member[]>(guildKeys.members(guildId), (members) =>
        !members || members.some((m) => m.user.id === member.user.id)
          ? members
          : [...members, member],
      )
      return
    }

    case 'GUILD_MEMBER_REMOVE': {
      const { guildId, userId } = data as DispatchPayload<'GUILD_MEMBER_REMOVE'>
      void queryClient.invalidateQueries({ queryKey: profileKeys.user(userId) })
      queryClient.setQueryData<Member[]>(guildKeys.members(guildId), (members) =>
        members?.filter((m) => m.user.id !== userId),
      )
      return
    }

    case 'GUILD_ROLE_CREATE':
    case 'GUILD_ROLE_UPDATE': {
      const { guildId, role } = data as DispatchPayload<'GUILD_ROLE_UPDATE'>
      upsertRoles(queryClient, guildId, [role])
      return
    }

    case 'GUILD_ROLE_DELETE': {
      const { guildId, roleId } = data as DispatchPayload<'GUILD_ROLE_DELETE'>
      removeRole(queryClient, guildId, roleId)
      return
    }

    case 'GUILD_EMOJIS_UPDATE': {
      const { guildId, emojis } = data as DispatchPayload<'GUILD_EMOJIS_UPDATE'>
      updateGuild(queryClient, guildId, (guild) => ({ ...guild, emojis }))
      return
    }

    case 'GUILD_MEMBER_UPDATE': {
      const { guildId, userId, roleIds, nickname, timeoutUntil } =
        data as DispatchPayload<'GUILD_MEMBER_UPDATE'>
      setMemberRoles(queryClient, guildId, userId, () => roleIds)
      setMemberNickname(queryClient, guildId, userId, nickname)
      setMemberTimeout(queryClient, guildId, userId, timeoutUntil)
      const member = data as DispatchPayload<'GUILD_MEMBER_UPDATE'>
      // I accepted the rules (maybe on another device): I may talk now.
      if (
        member.pending === false &&
        queryClient.getQueryData<CurrentUser | null>(authKeys.me)?.id === userId
      ) {
        updateGuild(queryClient, guildId, (guild) => ({ ...guild, myPending: false }))
      }
      void queryClient.invalidateQueries({ queryKey: profileKeys.user(userId) })
      return
    }

    case 'PRIVATE_CHANNEL_CREATE':
    case 'PRIVATE_CHANNEL_UPDATE':
      return void upsertPrivateChannel(queryClient, data as PrivateChannel)

    case 'PRIVATE_CHANNEL_DELETE': {
      // Left or removed: nothing of the conversation stays behind.
      const { id } = data as DispatchPayload<'PRIVATE_CHANNEL_DELETE'>
      removePrivateChannel(queryClient, id)
      setMentionCount(queryClient, id, () => 0)
      queryClient.removeQueries({ queryKey: messageKeys.channel(id) })
      return
    }

    case 'RELATIONSHIP_ADD': {
      const relationship = data as DispatchPayload<'RELATIONSHIP_ADD'>
      upsertRelationship(queryClient, relationship)
      void queryClient.invalidateQueries({ queryKey: profileKeys.user(relationship.user.id) })
      return
    }

    case 'RELATIONSHIP_REMOVE':
      removeRelationship(queryClient, (data as DispatchPayload<'RELATIONSHIP_REMOVE'>).userId)
      void queryClient.invalidateQueries({
        queryKey: profileKeys.user((data as DispatchPayload<'RELATIONSHIP_REMOVE'>).userId),
      })
      return

    case 'VOICE_STATE_UPDATE':
      return void applyVoiceState(queryClient, data as DispatchPayload<'VOICE_STATE_UPDATE'>)

    case 'USER_UPDATE':
      return applyUserUpdate(queryClient, data as DispatchPayload<'USER_UPDATE'>)

    case 'RESUMED':
      return
  }
}
