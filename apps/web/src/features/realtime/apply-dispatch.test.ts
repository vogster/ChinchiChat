import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'

import { testGuild, testMembers, testUser } from '../../test/fake-api'
import { authKeys } from '../auth/queries'
import { dmKeys } from '../dms/queries'
import { relationshipKeys } from '../friends/queries'
import { voiceKeys } from '../voice/queries'
import { guildKeys } from '../guilds/queries'
import { messageKeys } from '../messages/queries'
import { createTypingStore } from './typing-store'
import { applyDispatch } from './apply-dispatch'

import type { MessageItem, MessagePages } from '../messages/queries'
import type { VoiceStates } from '../voice/queries'
import type {
  Guild,
  GuildDetail,
  Member,
  Message,
  PrivateChannel,
  Relationship,
  Role,
} from '@chinchi/shared'

const CHANNEL = '503'

const message = (id: string, overrides: Partial<Message> = {}): Message => ({
  id,
  channelId: CHANNEL,
  guildId: testGuild.id,
  author: { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: null },
  webhook: null,
  interaction: null,
  system: null,
  content: `message ${id}`,
  ciphertext: null,
  createdAt: '2026-10-14T12:00:00.000Z',
  editedAt: null,
  attachments: [],
  reply: null,
  mentions: { users: [], roles: [], everyone: false, here: false },
  pinned: false,
  published: false,
  embeds: [],
  reactions: [],
  nonce: null,
  ...overrides,
})

const pages = (...newestFirst: MessageItem[][]): MessagePages => ({
  pages: newestFirst,
  pageParams: newestFirst.map((_, i) => (i === 0 ? undefined : `p${i}`)),
})

let queryClient: QueryClient
let typing: ReturnType<typeof createTypingStore>

const apply = (type: Parameters<typeof applyDispatch>[2], data: unknown) =>
  applyDispatch(queryClient, typing, type, data)

const loaded = () => queryClient.getQueryData<MessagePages>(messageKeys.channel(CHANNEL))
const detail = () => queryClient.getQueryData<GuildDetail>(guildKeys.detail(testGuild.id))

beforeEach(() => {
  queryClient = new QueryClient()
  typing = createTypingStore()
  const { channels: _channels, ...summary } = testGuild
  queryClient.setQueryData(guildKeys.all, [summary])
  queryClient.setQueryData(guildKeys.detail(testGuild.id), testGuild)
})

describe('READY', () => {
  it('seeds servers, presences and read states', () => {
    apply('READY', {
      sessionId: 's',
      user: testUser,
      guilds: [{ ...testGuild, name: 'Свежие котики' }],
      privateChannels: [],
      voiceStates: [],
      presences: [{ userId: '200', status: 'idle' }],
      readStates: [{ channelId: CHANNEL, lastReadMessageId: '10' }],
      notificationSettings: [],
      mentionCounts: { [CHANNEL]: 2 },
    })

    expect(queryClient.getQueryData<Guild[]>(guildKeys.all)?.map((g) => g.name)).toEqual([
      'Свежие котики',
    ])
    expect(detail()?.name).toBe('Свежие котики')
    expect(queryClient.getQueryData(messageKeys.presences)).toEqual({ '200': 'idle' })
    expect(queryClient.getQueryData(messageKeys.readStates)).toEqual({ [CHANNEL]: '10' })
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({ [CHANNEL]: 2 })
  })
})

describe('messages', () => {
  it('appends new messages to the newest loaded page and bumps the channel', () => {
    queryClient.setQueryData(messageKeys.channel(CHANNEL), pages([message('10')], [message('5')]))

    apply('MESSAGE_CREATE', message('11'))

    expect(loaded()?.pages[0]?.map((m) => m.id)).toEqual(['10', '11'])
    expect(detail()?.channels.find((c) => c.id === CHANNEL)?.lastMessageId).toBe('11')
  })

  it('replaces the optimistic copy when the server echoes the nonce', () => {
    const optimistic: MessageItem = { ...message('local-1', { nonce: 'n-1' }), pending: 'sending' }
    queryClient.setQueryData(messageKeys.channel(CHANNEL), pages([message('10'), optimistic]))

    apply('MESSAGE_CREATE', message('11', { nonce: 'n-1' }))

    expect(loaded()?.pages[0]?.map((m) => [m.id, m.pending])).toEqual([
      ['10', undefined],
      ['11', undefined],
    ])
  })

  it('ignores duplicates (e.g. replayed after a resume)', () => {
    queryClient.setQueryData(messageKeys.channel(CHANNEL), pages([message('10')]))

    apply('MESSAGE_CREATE', message('10'))

    expect(loaded()?.pages[0]).toHaveLength(1)
  })

  it('does not create history for channels that were never opened', () => {
    apply('MESSAGE_CREATE', message('11'))
    expect(loaded()).toBeUndefined()
  })

  it('stops the author typing when their message arrives', () => {
    typing.start(CHANNEL, '200')
    apply('MESSAGE_CREATE', message('11'))
    expect(typing.typingIn(CHANNEL)).toEqual([])
  })

  it('applies edits and deletions in any loaded page', () => {
    queryClient.setQueryData(
      messageKeys.channel(CHANNEL),
      pages([message('10')], [message('5'), message('6')]),
    )

    apply(
      'MESSAGE_UPDATE',
      message('5', { content: 'edited', editedAt: '2026-10-14T13:00:00.000Z' }),
    )
    apply('MESSAGE_DELETE', { id: '6', channelId: CHANNEL, guildId: testGuild.id })

    expect(loaded()?.pages[1]).toEqual([
      message('5', { content: 'edited', editedAt: '2026-10-14T13:00:00.000Z' }),
    ])
  })

  it('keeps reply snippets in step with their original', () => {
    const snippet = { author: null, content: 'old', attachmentCount: 0 }
    queryClient.setQueryData(
      messageKeys.channel(CHANNEL),
      pages([
        message('5', { content: 'old' }),
        message('6', { reply: { messageId: '5', mentionsAuthor: true, message: snippet } }),
        message('7', { reply: { messageId: '1', mentionsAuthor: true, message: snippet } }),
      ]),
    )

    apply('MESSAGE_UPDATE', message('5', { content: 'new' }))
    expect(loaded()?.pages[0]?.[1]?.reply?.message?.content).toBe('new')
    expect(loaded()?.pages[0]?.[2]?.reply?.message?.content).toBe('old')

    apply('MESSAGE_DELETE', { id: '5', channelId: CHANNEL, guildId: testGuild.id })
    expect(loaded()?.pages[0]?.[0]?.reply).toEqual({
      messageId: '5',
      mentionsAuthor: true,
      message: null,
    })
  })

  it('counts new mentions of me until the channel is read', () => {
    queryClient.setQueryData(authKeys.me, testUser)
    queryClient.setQueryData(messageKeys.mentionCounts, {})
    const toMe = { users: [testUser.id], roles: [], everyone: false, here: false }

    apply('MESSAGE_CREATE', message('11', { mentions: toMe }))
    apply(
      'MESSAGE_CREATE',
      message('12', { mentions: { users: [], roles: [], everyone: true, here: false } }),
    )
    apply('MESSAGE_CREATE', message('13'))
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({ [CHANNEL]: 2 })

    apply('CHANNEL_ACK', { channelId: CHANNEL, lastReadMessageId: '13', mentionCount: 0 })
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({})

    apply('MESSAGE_CREATE', message('14', { mentions: toMe }))
    apply('MESSAGE_CREATE', message('15', { author: { ...testUser, avatarUrl: null } }))
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({})
  })

  it('ignores mentions older than what was already read', () => {
    queryClient.setQueryData(authKeys.me, testUser)
    queryClient.setQueryData(messageKeys.readStates, { [CHANNEL]: '20' })
    queryClient.setQueryData(messageKeys.mentionCounts, {})

    apply(
      'MESSAGE_CREATE',
      message('15', {
        mentions: { users: [testUser.id], roles: [], everyone: false, here: false },
      }),
    )

    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({})
  })

  it('follows edits and deletions of unread mentions', () => {
    queryClient.setQueryData(authKeys.me, testUser)
    const toMe = { users: [testUser.id], roles: [], everyone: false, here: false }
    queryClient.setQueryData(
      messageKeys.channel(CHANNEL),
      pages([message('11', { mentions: toMe }), message('12', { mentions: toMe }), message('13')]),
    )
    queryClient.setQueryData(messageKeys.mentionCounts, { [CHANNEL]: 2 })

    apply('MESSAGE_UPDATE', message('11', { content: 'never mind' }))
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({ [CHANNEL]: 1 })
    apply('MESSAGE_UPDATE', message('13', { mentions: toMe }))
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({ [CHANNEL]: 2 })
    apply('MESSAGE_DELETE', { id: '12', channelId: CHANNEL, guildId: testGuild.id })
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({ [CHANNEL]: 1 })
  })

  it('counts every unread message in a DM, and deletions of them', () => {
    queryClient.setQueryData(authKeys.me, testUser)
    queryClient.setQueryData(messageKeys.mentionCounts, {})
    const mine = { id: testUser.id, username: 'alice', displayName: null, avatarUrl: null }

    apply('MESSAGE_CREATE', message('11', { guildId: null }))
    apply('MESSAGE_CREATE', message('12', { guildId: null }))
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({ [CHANNEL]: 2 })

    queryClient.setQueryData(
      messageKeys.channel(CHANNEL),
      pages([message('11', { guildId: null }), message('12', { guildId: null })]),
    )
    apply('MESSAGE_DELETE', { id: '12', channelId: CHANNEL, guildId: null })
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({ [CHANNEL]: 1 })

    apply('MESSAGE_CREATE', message('13', { guildId: null, author: mine }))
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({})

    // Like the server, a DM counts at most 100 unread.
    queryClient.setQueryData(messageKeys.mentionCounts, { [CHANNEL]: 100 })
    apply('MESSAGE_CREATE', message('14', { guildId: null }))
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({ [CHANNEL]: 100 })
  })

  it('syncs what other devices have read', () => {
    queryClient.setQueryData(messageKeys.readStates, { [CHANNEL]: '1' })

    apply('CHANNEL_ACK', { channelId: CHANNEL, lastReadMessageId: '11', mentionCount: 0 })

    expect(queryClient.getQueryData(messageKeys.readStates)).toEqual({ [CHANNEL]: '11' })
  })

  it('counts your own new messages as read', () => {
    queryClient.setQueryData(authKeys.me, testUser)
    queryClient.setQueryData(messageKeys.readStates, { [CHANNEL]: '1' })

    apply(
      'MESSAGE_CREATE',
      message('12', {
        author: { id: testUser.id, username: 'alice', displayName: null, avatarUrl: null },
      }),
    )
    apply('MESSAGE_CREATE', message('13'))

    expect(queryClient.getQueryData(messageKeys.readStates)).toEqual({ [CHANNEL]: '12' })
  })
})

describe('typing and presence', () => {
  it('records typing', () => {
    apply('TYPING_START', {
      channelId: CHANNEL,
      guildId: testGuild.id,
      userId: '200',
      timestamp: '',
    })
    expect(typing.typingIn(CHANNEL)).toEqual(['200'])
  })

  it('tracks presence, dropping offline users', () => {
    apply('PRESENCE_UPDATE', { userId: '200', status: 'dnd' })
    apply('PRESENCE_UPDATE', { userId: '300', status: 'online' })
    apply('PRESENCE_UPDATE', { userId: '300', status: 'offline' })

    expect(queryClient.getQueryData(messageKeys.presences)).toEqual({ '200': 'dnd' })
  })
})

describe('servers and channels', () => {
  it('adds a joined server', () => {
    const joined = { ...testGuild, id: '900', name: 'Новый' }
    apply('GUILD_CREATE', joined)

    expect(queryClient.getQueryData<Guild[]>(guildKeys.all)?.map((g) => g.id)).toEqual([
      testGuild.id,
      '900',
    ])
    expect(queryClient.getQueryData(guildKeys.detail('900'))).toEqual(joined)
  })

  it('learns who is online in a server the user just joined', () => {
    queryClient.setQueryData(messageKeys.presences, { '1': 'online' })

    apply('GUILD_CREATE', {
      ...testGuild,
      id: '901',
      presences: [{ userId: '200', status: 'idle' }],
    })

    expect(queryClient.getQueryData(messageKeys.presences)).toEqual({
      '1': 'online',
      '200': 'idle',
    })
    expect(queryClient.getQueryData(guildKeys.detail('901'))).not.toHaveProperty('presences')
  })

  it('updates and removes servers', () => {
    apply('GUILD_UPDATE', {
      id: testGuild.id,
      name: 'Переименован',
      iconUrl: null,
      ownerId: '200',
      createdAt: testGuild.createdAt,
    })
    expect(detail()).toMatchObject({ name: 'Переименован', ownerId: '200' })

    apply('GUILD_DELETE', { id: testGuild.id })
    expect(queryClient.getQueryData<Guild[]>(guildKeys.all)).toEqual([])
    expect(detail()).toBeUndefined()
  })

  it('creates, updates and deletes channels', () => {
    const created = {
      ...testGuild.channels[2],
      id: '600',
      name: 'новости',
    } as GuildDetail['channels'][number]
    apply('CHANNEL_CREATE', created)
    apply('CHANNEL_UPDATE', { ...created, topic: 'Тема' })
    apply('CHANNEL_DELETE', { id: '504', guildId: testGuild.id })

    const channels = detail()?.channels ?? []
    expect(channels.find((c) => c.id === '600')?.topic).toBe('Тема')
    expect(channels.find((c) => c.id === '504')).toBeUndefined()
  })

  it('keeps the member list in sync', () => {
    queryClient.setQueryData(guildKeys.members(testGuild.id), [...testMembers])
    const newcomer: Member = {
      user: { id: '300', username: 'carol', displayName: null, avatarUrl: null },
      roleIds: [],
      nickname: null,
      joinedAt: '',
      timeoutUntil: null,
    }

    apply('GUILD_MEMBER_ADD', { guildId: testGuild.id, member: newcomer })
    apply('GUILD_MEMBER_ADD', { guildId: testGuild.id, member: newcomer })
    apply('GUILD_MEMBER_REMOVE', { guildId: testGuild.id, userId: '200' })

    expect(
      queryClient.getQueryData<Member[]>(guildKeys.members(testGuild.id))?.map((m) => m.user.id),
    ).toEqual([testUser.id, '300'])
  })

  it('keeps roles in sync', () => {
    const role = { ...(testGuild.roles[1] as Role), id: '520', name: 'Новая', position: 2 }
    apply('GUILD_ROLE_CREATE', { guildId: testGuild.id, role })
    apply('GUILD_ROLE_UPDATE', { guildId: testGuild.id, role: { ...role, name: 'Переименована' } })
    expect(detail()?.roles.find((r) => r.id === '520')?.name).toBe('Переименована')

    queryClient.setQueryData(guildKeys.detail(testGuild.id), { ...detail(), myRoleIds: ['520'] })
    apply('GUILD_ROLE_DELETE', { guildId: testGuild.id, roleId: '520' })
    expect(detail()?.roles.map((r) => r.id)).not.toContain('520')
    expect(detail()?.myRoleIds).toEqual([])
  })

  it('tracks members’ roles, including the user’s own', () => {
    queryClient.setQueryData(authKeys.me, testUser)
    queryClient.setQueryData(guildKeys.members(testGuild.id), [...testMembers])

    apply('GUILD_MEMBER_UPDATE', { guildId: testGuild.id, userId: '200', roleIds: [] })
    apply('GUILD_MEMBER_UPDATE', { guildId: testGuild.id, userId: testUser.id, roleIds: ['510'] })

    const members = queryClient.getQueryData<Member[]>(guildKeys.members(testGuild.id)) ?? []
    expect(members.find((m) => m.user.id === '200')?.roleIds).toEqual([])
    expect(detail()?.myRoleIds).toEqual(['510'])
  })

  it('ignores events for servers that are not loaded', () => {
    apply('CHANNEL_CREATE', { ...testGuild.channels[2], guildId: '777' })
    apply('GUILD_UPDATE', { id: '777', name: 'x', iconUrl: null, ownerId: '1', createdAt: '' })
    expect(queryClient.getQueryData(guildKeys.detail('777'))).toBeUndefined()
  })
})

describe('DMs and friends', () => {
  const bob = { id: '200', username: 'bob', displayName: null, avatarUrl: null }
  const dm = (id: string, lastMessageId: string | null = null): PrivateChannel => ({
    id,
    type: 'dm',
    name: null,
    ownerId: null,
    recipients: [bob],
    lastMessageId,
    encrypted: false,
  })
  const dms = () => queryClient.getQueryData<PrivateChannel[]>(dmKeys.all)?.map((c) => c.id)

  it('seeds DMs from READY and keeps them in step, latest activity first', () => {
    apply('READY', {
      sessionId: 's',
      user: testUser,
      guilds: [],
      privateChannels: [dm('900', '950'), dm('901')],
      voiceStates: [],
      presences: [],
      readStates: [],
      notificationSettings: [],
      mentionCounts: {},
    })
    expect(dms()).toEqual(['900', '901'])

    apply('PRIVATE_CHANNEL_CREATE', dm('960'))
    expect(dms()).toEqual(['960', '900', '901'])

    apply('MESSAGE_CREATE', message('970', { channelId: '901', guildId: null }))
    expect(dms()).toEqual(['901', '960', '900'])

    apply('PRIVATE_CHANNEL_UPDATE', { ...dm('960'), type: 'group_dm', name: 'Котики' })
    expect(queryClient.getQueryData<PrivateChannel[]>(dmKeys.all)?.[1]?.name).toBe('Котики')

    queryClient.setQueryData(messageKeys.mentionCounts, { '960': 3 })
    queryClient.setQueryData(messageKeys.channel('960'), pages([message('961')]))
    apply('PRIVATE_CHANNEL_DELETE', { id: '960' })
    expect(dms()).toEqual(['901', '900'])
    expect(queryClient.getQueryData(messageKeys.mentionCounts)).toEqual({})
    expect(queryClient.getQueryData(messageKeys.channel('960'))).toBeUndefined()
  })

  it('keeps the loaded relationships in step', () => {
    queryClient.setQueryData<Relationship[]>(relationshipKeys.all, [])
    const since = '2026-10-14T12:00:00.000Z'

    apply('RELATIONSHIP_ADD', { user: bob, type: 'pending_in', since })
    apply('RELATIONSHIP_ADD', { user: bob, type: 'friend', since })
    expect(queryClient.getQueryData(relationshipKeys.all)).toEqual([
      { user: bob, type: 'friend', since },
    ])

    apply('RELATIONSHIP_REMOVE', { userId: bob.id })
    expect(queryClient.getQueryData(relationshipKeys.all)).toEqual([])
  })
})

describe('USER_UPDATE', () => {
  it('shows the new profile everywhere the user appears', () => {
    const renamed = { id: '200', username: 'bob', displayName: 'Бобби', avatarUrl: '/a.webp' }
    queryClient.setQueryData(guildKeys.members(testGuild.id), testMembers)
    queryClient.setQueryData<PrivateChannel[]>(dmKeys.all, [
      {
        id: '900',
        type: 'dm',
        name: null,
        ownerId: null,
        recipients: [{ ...renamed, displayName: null, avatarUrl: null }],
        lastMessageId: null,
        encrypted: false,
      },
    ])
    queryClient.setQueryData<Relationship[]>(relationshipKeys.all, [
      {
        user: { ...renamed, displayName: null },
        type: 'friend',
        since: '2026-10-14T12:00:00.000Z',
      },
    ])
    const reply = {
      messageId: '10',
      mentionsAuthor: false,
      message: { author: message('10').author, content: 'x', attachmentCount: 0 },
    }
    queryClient.setQueryData(
      messageKeys.channel(CHANNEL),
      pages([message('10'), message('11', { reply })]),
    )

    apply('USER_UPDATE', renamed)

    const member = queryClient
      .getQueryData<Member[]>(guildKeys.members(testGuild.id))
      ?.find((m) => m.user.id === renamed.id)
    expect(member?.user).toEqual(renamed)
    expect(queryClient.getQueryData<PrivateChannel[]>(dmKeys.all)?.[0]?.recipients).toEqual([
      renamed,
    ])
    expect(queryClient.getQueryData<Relationship[]>(relationshipKeys.all)?.[0]?.user).toEqual(
      renamed,
    )
    const [first, second] = loaded()?.pages[0] ?? []
    expect(first?.author).toEqual(renamed)
    expect(second?.reply?.message?.author).toEqual(renamed)
  })

  it('updates the current user from another device', () => {
    queryClient.setQueryData(authKeys.me, testUser)

    apply('USER_UPDATE', {
      id: testUser.id,
      username: 'alice',
      displayName: 'Ali',
      avatarUrl: null,
    })

    expect(queryClient.getQueryData(authKeys.me)).toEqual({ ...testUser, displayName: 'Ali' })
  })
})

describe('voice', () => {
  const inVoice = (userId: string, channelId: string | null) => ({
    guildId: testGuild.id,
    channelId,
    userId,
    selfMute: false,
    selfDeaf: false,
    serverMute: false,
    serverDeaf: false,
    video: false,
    stream: false,
  })
  const states = () => queryClient.getQueryData<VoiceStates>(voiceKeys.states)

  it('seeds from READY, follows updates and drops deleted channels', () => {
    apply('READY', {
      sessionId: 's',
      user: testUser,
      guilds: [],
      privateChannels: [],
      voiceStates: [inVoice('200', '505')],
      presences: [],
      readStates: [],
      notificationSettings: [],
      mentionCounts: {},
    })
    expect(Object.keys(states() ?? {})).toEqual(['200'])

    apply('VOICE_STATE_UPDATE', { ...inVoice('300', '505'), selfMute: true })
    expect(states()?.['300']?.selfMute).toBe(true)

    apply('VOICE_STATE_UPDATE', inVoice('200', null))
    expect(Object.keys(states() ?? {})).toEqual(['300'])

    apply('CHANNEL_DELETE', { id: '505', guildId: testGuild.id })
    expect(states()).toEqual({})
  })
})
