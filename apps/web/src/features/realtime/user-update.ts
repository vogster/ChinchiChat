import { authKeys } from '../auth/queries'
import { dmKeys } from '../dms/queries'
import { relationshipKeys } from '../friends/queries'
import { guildKeys } from '../guilds/queries'
import { profileKeys } from '../profile/queries'

import type { MessageItem, MessagePages } from '../messages/queries'
import type { QueryClient } from '@tanstack/react-query'
import type { CurrentUser, Member, PrivateChannel, PublicUser, Relationship } from '@chinchi/shared'

const swap = (user: PublicUser) => (other: PublicUser) => (other.id === user.id ? user : other)

const withAuthor = (message: MessageItem, user: PublicUser): MessageItem => {
  const author = message.author?.id === user.id ? user : message.author
  const repliedTo = message.reply?.message
  const reply =
    message.reply && repliedTo?.author?.id === user.id
      ? { ...message.reply, message: { ...repliedTo, author: user } }
      : message.reply
  return author === message.author && reply === message.reply
    ? message
    : { ...message, author, reply }
}

/** Someone's name or avatar changed: every cached copy of them follows. */
export const applyUserUpdate = (queryClient: QueryClient, user: PublicUser) => {
  queryClient.setQueryData<CurrentUser | null>(authKeys.me, (me) =>
    me && me.id === user.id ? { ...me, ...user } : me,
  )
  queryClient.setQueriesData<Member[]>(
    { queryKey: guildKeys.all, predicate: (query) => query.queryKey[2] === 'members' },
    (members) =>
      members?.map((member) => (member.user.id === user.id ? { ...member, user } : member)),
  )
  queryClient.setQueryData<PrivateChannel[]>(dmKeys.all, (channels) =>
    channels?.map((channel) => ({ ...channel, recipients: channel.recipients.map(swap(user)) })),
  )
  queryClient.setQueryData<Relationship[]>(relationshipKeys.all, (list) =>
    list?.map((r) => (r.user.id === user.id ? { ...r, user } : r)),
  )
  void queryClient.invalidateQueries({ queryKey: profileKeys.user(user.id) })
  queryClient.setQueriesData<MessagePages>({ queryKey: ['messages'] }, (data) =>
    data
      ? { ...data, pages: data.pages.map((page) => page.map((m) => withAuthor(m, user))) }
      : data,
  )
}
