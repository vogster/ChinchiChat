import { ApiError } from '@chinchi/sdk'
import { DEFAULT_EVERYONE_PERMISSIONS, Permission } from '@chinchi/shared'
import { vi } from 'vitest'

import type { ApiClient, DownloadOptions, UploadOptions } from '@chinchi/sdk'
import type {
  AdminGuild,
  AdminUser,
  ApproveQrLoginRequest,
  AttachmentUpload,
  AuditLogEntry,
  BackupEntry,
  Ban,
  Bot,
  ChangeEmailRequest,
  Channel,
  ChannelFollower,
  ClaimedKeyPackage,
  Command,
  CreateQrLoginRequest,
  CurrentUser,
  Device,
  DeviceApproval,
  GuildDetail,
  Handshake,
  InstanceInvite,
  InstanceSettings,
  Invite,
  KeyBackup,
  LoginResult,
  Member,
  Message,
  NotificationSetting,
  Poll,
  PrivateChannel,
  QrLoginClaim,
  RegistrationMode,
  Relationship,
  ReorderChannelsRequest,
  Report,
  Role,
  SessionInfo,
  SetCustomStatusRequest,
  ThreadPreview,
  UpdateNotificationSettingRequest,
  UploadLimits,
  UserKey,
  UserProfile,
  Webhook,
} from '@chinchi/shared'

export const testUser: CurrentUser = {
  id: '100',
  username: 'alice',
  displayName: null,
  avatarUrl: null,
  email: 'alice@example.com',
  emailVerified: true,
  dmPolicy: 'servers',
  locale: 'ru',
  bio: null,
  mfaEnabled: false,
  isAdmin: false,
  createdAt: '2026-10-14T12:00:00.000Z',
  bannerUrl: null,
  accentColor: null,
}

export const testSessions: readonly SessionInfo[] = [
  {
    id: '1',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    ipAddress: '203.0.113.7',
    createdAt: '2026-10-01T10:00:00.000Z',
    lastUsedAt: new Date().toISOString(),
    current: true,
  },
  {
    id: '2',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
    ipAddress: '198.51.100.4',
    createdAt: '2026-10-02T10:00:00.000Z',
    lastUsedAt: '2026-10-10T10:00:00.000Z',
    current: false,
  },
]

const channel = (overrides: Partial<Channel> & Pick<Channel, 'id' | 'name' | 'type'>): Channel => ({
  guildId: '500',
  topic: null,
  parentId: null,
  position: 0,
  lastMessageId: null,
  rateLimitPerUser: 0,
  nsfw: false,
  announcement: false,
  permissionOverwrites: [],
  threadStarterId: null,
  messageCount: 0,
  ownerId: null,
  ...overrides,
})

/** A thread in #общий, started from Bob's "Как дела?". */
export const testThread = channel({
  id: '520',
  name: 'Релиз',
  type: 'thread',
  parentId: '503',
  threadStarterId: '1002',
  messageCount: 3,
  ownerId: '200',
})

export const testGuild: GuildDetail = {
  id: '500',
  name: 'Котики',
  iconUrl: null,
  ownerId: testUser.id,
  createdAt: '2026-10-14T12:00:00.000Z',
  roles: [
    {
      id: '500',
      guildId: '500',
      name: '@everyone',
      color: 0,
      position: 0,
      permissions: String(DEFAULT_EVERYONE_PERMISSIONS),
      hoist: false,
      mentionable: false,
    },
    {
      id: '510',
      guildId: '500',
      name: 'Модераторы',
      color: 0x2ecc71,
      position: 1,
      permissions: String(Permission.ManageMessages | Permission.KickMembers),
      hoist: true,
      mentionable: true,
    },
  ],
  myRoleIds: [],
  myTimeoutUntil: null,
  myPending: false,
  rules: null,
  emojis: [],
  channels: [
    channel({ id: '501', type: 'category', name: 'Текстовые каналы', position: 0 }),
    channel({ id: '502', type: 'category', name: 'Голосовые каналы', position: 1 }),
    channel({ id: '503', type: 'text', name: 'общий', parentId: '501', position: 0 }),
    channel({
      id: '504',
      type: 'text',
      name: 'мемы',
      parentId: '501',
      position: 1,
      topic: 'Только смешное',
    }),
    channel({ id: '505', type: 'voice', name: 'Общий', parentId: '502', position: 0 }),
  ],
}

export const testMembers: readonly Member[] = [
  {
    user: { id: testUser.id, username: 'alice', displayName: null, avatarUrl: null },
    roleIds: [],
    nickname: null,
    joinedAt: '2026-10-14T12:00:00.000Z',
    timeoutUntil: null,
  },
  {
    user: { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: null },
    roleIds: ['510'],
    nickname: null,
    joinedAt: '2026-10-14T13:00:00.000Z',
    timeoutUntil: null,
  },
]

export const testInvite: Invite = {
  code: 'AbCd1234',
  guild: { id: testGuild.id, name: testGuild.name, iconUrl: null, memberCount: 2 },
  channel: { id: '503', name: 'общий', type: 'text' },
  inviter: { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: null },
  uses: 0,
  maxUses: null,
  expiresAt: '2026-10-21T12:00:00.000Z',
  createdAt: '2026-10-14T12:00:00.000Z',
}

const { channels: _channels, ...guildSummary } = testGuild

export const testPoll: Poll = {
  question: 'Опрос',
  answers: [
    { id: 1, text: 'Да', count: 0, me: false, sample: [] },
    { id: 2, text: 'Нет', count: 0, me: false, sample: [] },
  ],
  multiple: false,
  expiresAt: '2026-10-17T12:00:00.000Z',
  ended: false,
  voters: 0,
  anonymous: false,
}

export const testApproval: DeviceApproval = {
  id: '950',
  newDeviceId: '701',
  commitment: 'AAAA',
  newKey: null,
  approverDeviceId: null,
  approverKey: null,
  secrets: null,
  state: 'requested',
  expiresAt: '2026-10-16T10:10:00.000Z',
}

export const testUpload: AttachmentUpload = {
  id: '900',
  uploadUrl: 'http://localhost:9000/chinchi/uploads/503/900?X-Amz-Signature=test',
  method: 'PUT',
  headers: { 'Content-Type': 'image/png' },
  expiresAt: '2026-10-14T12:15:00.000Z',
}

export const testMessage = (id: string, overrides: Partial<Message> = {}): Message => ({
  id,
  channelId: '503',
  guildId: testGuild.id,
  author: { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: null },
  webhook: null,
  interaction: null,
  system: null,
  content: `Сообщение ${id}`,
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

export const testHistory: readonly Message[] = [
  testMessage('1001', { content: 'Привет всем!', createdAt: '2026-10-13T18:00:00.000Z' }),
  testMessage('1002', { content: 'Как дела?', createdAt: '2026-10-13T18:01:00.000Z' }),
  testMessage('1003', {
    content: 'Отлично!',
    author: { id: '100', username: 'alice', displayName: null, avatarUrl: null },
    createdAt: '2026-10-14T09:00:00.000Z',
  }),
]

/** Bob, a friend of the test user, and the 1:1 DM with him. */
export const testFriend = { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: null }
export const testDm: PrivateChannel = {
  id: '800',
  type: 'dm',
  name: null,
  ownerId: null,
  recipients: [testFriend],
  lastMessageId: '1003',
  encrypted: false,
}
export const testGroupDm: PrivateChannel = {
  id: '801',
  type: 'group_dm',
  name: null,
  ownerId: '100',
  recipients: [testFriend, { id: '300', username: 'carol', displayName: null, avatarUrl: null }],
  lastMessageId: null,
  encrypted: false,
}

/** A profile as the test user sees it: Bob is a friend and a server mate. */
export const testProfile = (userId: string, guildId?: string): UserProfile => {
  const member = testMembers.find((m) => m.user.id === userId)
  return {
    user: member?.user ?? {
      id: userId,
      username: `user${userId}`,
      displayName: null,
      avatarUrl: null,
    },
    bio: userId === '200' ? 'Строю плотины 🦫' : null,
    createdAt: '2026-01-15T12:00:00.000Z',
    bannerUrl: null,
    accentColor: userId === '200' ? 0x2b8a3e : null,
    relationship: userId === '200' ? 'friend' : null,
    mutualGuildIds: member && userId !== testUser.id ? [testGuild.id] : [],
    mutualFriends: [],
    member:
      guildId && member
        ? { nickname: member.nickname, roleIds: member.roleIds, joinedAt: member.joinedAt }
        : null,
  }
}

export const apiError = (status: number, code: string) => new ApiError(status, code, code)

export interface FakeApiOptions {
  /** `null` means a guest (users.me answers 401). */
  readonly user?: CurrentUser | null
  readonly registrationMode?: RegistrationMode
}

/** Every endpoint is a vi.fn with a happy-path default; tests override what they need. */
export const testInstanceSettings: InstanceSettings = {
  registrationMode: 'open',
  maxGuildsPerUser: null,
  requireVerifiedEmail: false,
}
export const testAdminUsers: readonly AdminUser[] = [
  {
    user: { id: '100', username: 'alice', displayName: null, avatarUrl: null },
    email: 'alice@example.com',
    isAdmin: true,
    suspended: false,
    mfaEnabled: false,
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    user: { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: null },
    email: 'bob@example.com',
    isAdmin: false,
    suspended: false,
    mfaEnabled: true,
    createdAt: '2026-10-02T10:00:00.000Z',
  },
]
export const testAdminGuilds: readonly AdminGuild[] = [
  {
    id: '500',
    name: 'Котики',
    iconUrl: null,
    owner: { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: null },
    memberCount: 2,
    createdAt: '2026-10-03T10:00:00.000Z',
  },
]
export const testInstanceInvite: InstanceInvite = {
  code: 'Abcd2345Efgh6789',
  uses: 0,
  maxUses: 1,
  expiresAt: '2026-10-22T10:00:00.000Z',
  createdBy: { id: '100', username: 'alice', displayName: null, avatarUrl: null },
  createdAt: '2026-10-15T10:00:00.000Z',
}

/** A QR sign-in as the new device holds it, and as the approving one sees it. */
export const testQrTicket = {
  id: 'qrloginabcdefghij',
  secret: 'S'.repeat(43),
  code: 'KQ7M-2PXD',
  url: 'http://localhost:5173/?qr=qrloginabcdefghij',
  expiresAt: '2099-01-01T00:00:00.000Z',
}
export const testQrLogin = {
  id: testQrTicket.id,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
  ipAddress: '203.0.113.5',
  createdAt: '2026-10-21T10:00:00.000Z',
  publicKey: null as string | null,
  choices: [23, 47, 81],
}

export const createFakeApi = ({ user = null, registrationMode = 'open' }: FakeApiOptions = {}) => {
  const signedInAs = { user: testUser }
  /** Like the server: with 2FA on, the password alone answers MFA_CODE_REQUIRED. */
  const codeFor = (code: string | undefined, required = user?.mfaEnabled ?? false) => {
    if (required && !code) throw apiError(400, 'MFA_CODE_REQUIRED')
  }

  return {
    announcements: {
      follow: vi.fn(async (sourceChannelId: string, channelId: string) => ({
        webhook: {
          id: '701',
          guildId: '500',
          channelId,
          name: 'Котики #новости',
          createdBy: testUser,
          createdAt: '2026-10-15T10:00:00.000Z',
          sourceChannelId,
          sourceGuildId: '500',
        },
      })),
      followers: vi.fn(async (_sourceChannelId: string) => ({
        followers: [] as ChannelFollower[],
      })),
      unfollow: vi.fn(async (_sourceChannelId: string, _webhookId: string) => undefined),
      publish: vi.fn(async (_channelId: string, messageId: string) => ({
        message: testMessage(messageId, { published: true }),
      })),
    },
    commands: {
      put: vi.fn(async () => ({ commands: [] as Command[] })),
      guild: vi.fn(async (_guildId: string) => ({ commands: [] as Command[] })),
    },
    interactions: {
      invoke: vi.fn(async (_channelId: string, _body: unknown) => undefined),
      respond: vi.fn(async (): Promise<{ message: Message }> => {
        throw new Error('not mocked')
      }),
    },
    bots: {
      list: vi.fn(async () => ({ bots: [] as Bot[] })),
      create: vi.fn(async (): Promise<{ bot: Bot; token: string }> => {
        throw new Error('not mocked')
      }),
      update: vi.fn(async (_botId: string, _body: unknown): Promise<{ bot: Bot }> => {
        throw new Error('not mocked')
      }),
      renewToken: vi.fn(async () => ({ token: 'NEW_TOKEN' })),
      delete: vi.fn(async () => undefined),
      addToGuild: vi.fn(async () => undefined),
    },
    webhooks: {
      list: vi.fn(async () => ({ webhooks: [] as Webhook[] })),
      create: vi.fn(async (channelId: string, name: string) => ({
        webhook: {
          id: '700',
          guildId: '500',
          channelId,
          name,
          createdBy: testUser,
          createdAt: '2026-10-15T10:00:00.000Z',
          sourceChannelId: null,
          sourceGuildId: null,
        },
        url: 'https://chat.example.com/api/v1/webhooks/700/SECRET_TOKEN_SECRET_TOKEN',
      })),
      delete: vi.fn(async () => undefined),
    },
    emojis: {
      create: vi.fn(async (_guildId: string, name: string) => ({
        emoji: { id: '600', name, url: '/api/v1/emojis/600.webp', animated: false },
      })),
      rename: vi.fn(async (_guildId: string, emojiId: string, name: string) => ({
        emoji: { id: emojiId, name, url: `/api/v1/emojis/${emojiId}.webp`, animated: false },
      })),
      delete: vi.fn(async () => undefined),
    },
    search: {
      guild: vi.fn(async () => ({ messages: [] as Message[], total: 0 })),
      channel: vi.fn(async () => ({ messages: [] as Message[], total: 0 })),
    },
    automod: {
      get: vi.fn(async () => ({
        automod: {
          blockedWords: [] as string[],
          antiSpam: false,
          maxMentions: null as number | null,
        },
      })),
      update: vi.fn(async (_guildId: string, changes: Record<string, unknown>) => ({
        automod: { blockedWords: [], antiSpam: false, maxMentions: null, ...changes },
      })),
    },
    reports: {
      create: vi.fn(async () => undefined),
      guild: vi.fn(async () => ({ reports: [] as Report[] })),
      closeGuild: vi.fn(async () => ({ report: {} as Report })),
      direct: vi.fn(async () => ({ reports: [] as Report[] })),
      closeDirect: vi.fn(async () => ({ report: {} as Report })),
    },
    admin: {
      settings: vi.fn(async () => ({ settings: testInstanceSettings })),
      updateSettings: vi.fn(async (changes: Partial<InstanceSettings>) => ({
        settings: { ...testInstanceSettings, ...changes },
      })),
      users: vi.fn(async () => ({ users: [...testAdminUsers] })),
      updateUser: vi.fn(async (userId: string, body: { suspended?: boolean; admin?: boolean }) => {
        const found = testAdminUsers.find((u) => u.user.id === userId) as AdminUser
        return {
          user: {
            ...found,
            ...(body.suspended !== undefined ? { suspended: body.suspended } : {}),
            ...(body.admin !== undefined ? { isAdmin: body.admin } : {}),
          },
        }
      }),
      guilds: vi.fn(async () => ({ guilds: [...testAdminGuilds] })),
      deleteGuild: vi.fn(async () => undefined),
      deleteUser: vi.fn(async (_userId: string) => undefined),
      invites: vi.fn(async () => ({ invites: [] as InstanceInvite[] })),
      createInvite: vi.fn(async () => ({ invite: testInstanceInvite })),
      revokeInvite: vi.fn(async () => undefined),
    },
    mfa: {
      setup: vi.fn(async () => ({
        secret: 'JBSWY3DPEHPK3PXP',
        uri: 'otpauth://totp/Chinchi:alice?secret=JBSWY3DPEHPK3PXP&issuer=Chinchi',
      })),
      enable: vi.fn(async () => ({ recoveryCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'] })),
      disable: vi.fn(async (body: { password: string; code?: string }) => {
        codeFor(body.code, true)
        return null
      }),
      renewRecoveryCodes: vi.fn(async (body: { password: string; code?: string }) => {
        codeFor(body.code, true)
        return { recoveryCodes: ['eeeee-fffff'] }
      }),
    },
    auth: {
      register: vi.fn(async () => signedInAs),
      login: vi.fn(async (): Promise<LoginResult> => signedInAs),
      loginMfa: vi.fn(async () => signedInAs),
      logout: vi.fn(async () => undefined),
      verifyEmail: vi.fn(async () => ({ user: { ...testUser, emailVerified: true } })),
      resendVerification: vi.fn(async () => null),
      changeEmail: vi.fn(async (body: ChangeEmailRequest) => {
        codeFor(body.code)
        return null
      }),
      confirmEmailChange: vi.fn(async (_token: string) => ({
        user: { ...testUser, email: 'new@example.com', emailVerified: true },
      })),
      changePassword: vi.fn(async () => null),
      forgotPassword: vi.fn(async () => null),
      resetPassword: vi.fn(async () => null),
      qr: {
        create: vi.fn(async (_body: CreateQrLoginRequest) => ({ ticket: { ...testQrTicket } })),
        find: vi.fn(async (_id: string) => ({ login: { ...testQrLogin } })),
        findByCode: vi.fn(async (_code: string) => ({ login: { ...testQrLogin } })),
        approve: vi.fn(async (_id: string, _body: ApproveQrLoginRequest) => undefined),
        claim: vi.fn(async (_id: string, _secret: string): Promise<QrLoginClaim> => ({
          state: 'pending',
        })),
      },
    },
    sessions: {
      list: vi.fn(async () => ({ sessions: [...testSessions] })),
      revoke: vi.fn(async () => undefined),
      revokeOthers: vi.fn(async () => undefined),
    },
    users: {
      deleteMe: vi.fn(async (_password: string, code?: string) => codeFor(code)),
      exportTicket: vi.fn(async (_password: string, code?: string) => {
        codeFor(code)
        return { ticket: 'ticket' }
      }),
      me: vi.fn(async () => {
        if (!user) throw apiError(401, 'UNAUTHORIZED')
        return { user }
      }),
      updateMe: vi.fn(async () => signedInAs),
      setAvatar: vi.fn(async () => ({
        user: { ...signedInAs.user, avatarUrl: '/api/v1/avatars/100/901.webp' },
      })),
      clearAvatar: vi.fn(async () => ({ user: { ...signedInAs.user, avatarUrl: null } })),
      setBanner: vi.fn(async () => ({
        user: { ...signedInAs.user, bannerUrl: '/api/v1/banners/100/902.webp' },
      })),
      clearBanner: vi.fn(async () => ({ user: { ...signedInAs.user, bannerUrl: null } })),
      setCustomStatus: vi.fn(async (body: SetCustomStatusRequest) => ({
        customStatus: {
          text: body.text ?? null,
          emoji: body.emoji ?? null,
          expiresAt: body.expiresAt ?? null,
        },
      })),
      clearCustomStatus: vi.fn(async () => undefined),
      profile: vi.fn(async (userId: string, guildId?: string) => ({
        profile: testProfile(userId, guildId),
      })),
    },
    guilds: {
      setIcon: vi.fn(async () => ({
        guild: { ...guildSummary, iconUrl: '/api/v1/icons/500/902.webp' },
      })),
      clearIcon: vi.fn(async () => ({ guild: { ...guildSummary, iconUrl: null } })),
      list: vi.fn(async () => ({ guilds: [guildSummary] })),
      create: vi.fn(async () => ({ guild: testGuild })),
      get: vi.fn(async () => ({ guild: testGuild })),
      update: vi.fn(async () => ({ guild: testGuild })),
      delete: vi.fn(async () => undefined),
      transfer: vi.fn(async () => ({ guild: testGuild })),
      members: vi.fn(async () => ({ members: [...testMembers] })),
      leave: vi.fn(async () => undefined),
      ack: vi.fn(async () => undefined),
      acceptRules: vi.fn(async () => ({ guild: testGuild })),
      setNickname: vi.fn(async (_guildId: string, userId: string, nickname: string | null) => ({
        member: { ...(testMembers.find((m) => m.user.id === userId) as Member), nickname },
      })),
      invites: vi.fn(async () => ({ invites: [testInvite] })),
    },
    channels: {
      createThread: vi.fn(async () => ({ channel: testThread })),
      threadPreviews: vi.fn(async (_channelId: string) => ({ previews: [] as ThreadPreview[] })),
      create: vi.fn(async () => ({ channel: testGuild.channels[2] as Channel })),
      // Answers with the channels as reordered, like the server.
      reorder: vi.fn(async (_guildId: string, items: ReorderChannelsRequest) => ({
        channels: testGuild.channels.map((channel) => {
          const item = items.find((i) => i.id === channel.id)
          return item ? { ...channel, ...item } : channel
        }),
      })),
      get: vi.fn(async () => ({ channel: testGuild.channels[2] as Channel })),
      update: vi.fn(async () => ({ channel: testGuild.channels[2] as Channel })),
      delete: vi.fn(async () => undefined),
    },
    invites: {
      create: vi.fn(async () => ({ invite: testInvite })),
      get: vi.fn(async () => ({ invite: testInvite })),
      accept: vi.fn(async () => ({ guild: testGuild })),
      revoke: vi.fn(async () => undefined),
    },
    roles: {
      list: vi.fn(async () => ({ roles: testGuild.roles })),
      create: vi.fn(async () => ({
        role: {
          ...(testGuild.roles[1] as Role),
          id: '520',
          name: 'new role',
          position: 1,
          permissions: '0',
        },
      })),
      update: vi.fn(async (_guildId: string, roleId: string, body: Partial<Role>) => ({
        role: { ...(testGuild.roles.find((r) => r.id === roleId) as Role), ...body },
      })),
      delete: vi.fn(async () => undefined),
      reorder: vi.fn(async () => ({ roles: testGuild.roles })),
      addToMember: vi.fn(async () => undefined),
      removeFromMember: vi.fn(async () => undefined),
    },
    permissions: {
      put: vi.fn(async () => ({ channel: testGuild.channels[2] as Channel })),
      delete: vi.fn(async () => undefined),
      sync: vi.fn(async (_channelId: string) => ({ channel: testGuild.channels[3] as Channel })),
    },
    messages: {
      list: vi.fn(async (_channelId: string, _query?: { before?: string }) => ({
        messages: [...testHistory] as Message[],
      })),
      create: vi.fn(
        async (
          channelId: string,
          body: { content?: string; nonce?: string; ciphertext?: string },
        ) => ({
          message: testMessage(`9${Date.now()}`, {
            channelId,
            content: body.content ?? '',
            ciphertext: body.ciphertext ?? null,
            nonce: body.nonce ?? null,
            author: {
              id: testUser.id,
              username: testUser.username,
              displayName: testUser.displayName,
              avatarUrl: testUser.avatarUrl,
            },
          }),
        }),
      ),
      update: vi.fn(
        async (_channelId: string, messageId: string, change: string | { ciphertext: string }) => ({
          message: testMessage(messageId, {
            ...(typeof change === 'string' ? { content: change } : { content: '', ...change }),
            editedAt: '2026-10-14T12:30:00.000Z',
          }),
        }),
      ),
      delete: vi.fn(async () => undefined),
      ack: vi.fn(async () => undefined),
      typing: vi.fn(async () => undefined),
      readStates: vi.fn(async () => ({
        readStates: [{ channelId: '503', lastReadMessageId: '1003' }],
        mentionCounts: {} as Record<string, number>,
      })),
    },
    e2ee: {
      myDevices: vi.fn(async () => ({ devices: [] as Device[] })),
      devicesOf: vi.fn(async (_userId: string) => ({ devices: [] as Device[] })),
      registerDevice: vi.fn(async (body: { name: string; signaturePublicKey: string }) => ({
        device: {
          id: '700',
          userId: testUser.id,
          ...body,
          createdAt: '2026-10-15T12:00:00.000Z',
        } as Device,
      })),
      deleteDevice: vi.fn(async (_deviceId: string) => undefined),
      userKey: vi.fn(async (_userId: string) => ({ userKey: null as UserKey | null })),
      setUserKey: vi.fn(async (body: { publicKey: string }) => ({
        userKey: {
          userId: '100',
          publicKey: body.publicKey,
          createdAt: '2026-10-16T10:00:00.000Z',
        },
      })),
      signDevice: vi.fn(async (_deviceId: string, _signature: string) => undefined),
      backup: vi.fn(async () => ({ backup: null as KeyBackup | null })),
      createBackup: vi.fn(async (body: { userKey: string }) => ({
        backup: { version: '900', userKey: body.userKey, createdAt: '2026-10-16T10:00:00.000Z' },
      })),
      putBackupEntries: vi.fn(async () => undefined),
      backupEntries: vi.fn(async () => ({ entries: [] as BackupEntry[] })),
      approvals: {
        request: vi.fn(async (_body: { deviceId: string; commitment: string }) => ({
          approval: testApproval,
        })),
        get: vi.fn(async (_approvalId: string) => ({ approval: testApproval })),
        accept: vi.fn(
          async (_approvalId: string, _body: { deviceId: string; publicKey: string }) => ({
            approval: testApproval,
          }),
        ),
        reveal: vi.fn(async (_approvalId: string, _publicKey: string) => ({
          approval: testApproval,
        })),
        complete: vi.fn(async (_approvalId: string, _secrets: string) => ({
          approval: testApproval,
        })),
        decline: vi.fn(async (_approvalId: string) => undefined),
      },
      uploadKeyPackages: vi.fn(async () => undefined),
      countKeyPackages: vi.fn(async () => ({ count: 0 })),
      claimKeyPackages: vi.fn(async (_userId: string) => ({
        keyPackages: [] as ClaimedKeyPackage[],
      })),
      postCommit: vi.fn(async () => undefined),
      handshakes: vi.fn(async () => ({ handshakes: [] as Handshake[] })),
    },
    notifications: {
      list: vi.fn(async () => ({ notificationSettings: [] as NotificationSetting[] })),
      // Answers with the request merged onto the defaults, like the server.
      update: vi.fn(async (targetId: string, body: UpdateNotificationSettingRequest) => ({
        setting: {
          targetId,
          level: body.level ?? null,
          muted: body.muted ?? false,
          mutedUntil: body.muted ? (body.mutedUntil ?? null) : null,
        },
      })),
    },
    relationships: {
      list: vi.fn(async () => ({ relationships: [] as Relationship[] })),
      request: vi.fn(async (username: string) => ({
        relationship: {
          user: { id: '700', username, displayName: null, avatarUrl: null },
          type: 'pending_out' as const,
          since: '2026-10-14T12:00:00.000Z',
        },
      })),
      accept: vi.fn(async (userId: string) => ({
        relationship: {
          user: { id: userId, username: 'friend', displayName: null, avatarUrl: null },
          type: 'friend' as const,
          since: '2026-10-14T12:00:00.000Z',
        },
      })),
      block: vi.fn(async (userId: string) => ({
        relationship: {
          user: { id: userId, username: 'blocked', displayName: null, avatarUrl: null },
          type: 'blocked' as const,
          since: '2026-10-14T12:00:00.000Z',
        },
      })),
      remove: vi.fn(async () => undefined),
    },
    moderation: {
      kick: vi.fn(async () => undefined),
      ban: vi.fn(async () => undefined),
      unban: vi.fn(async () => undefined),
      bans: vi.fn(async () => ({ bans: [] as Ban[] })),
      timeout: vi.fn(
        async (_guildId: string, _userId: string, _body: { until: string | null }) => undefined,
      ),
      auditLog: vi.fn(async () => ({ entries: [] as AuditLogEntry[] })),
    },
    voice: {
      join: vi.fn(async () => ({ connection: { url: 'ws://livekit.test', token: 'voice-token' } })),
      updateState: vi.fn(async () => undefined),
      moderate: vi.fn(async () => undefined),
      move: vi.fn(async () => undefined),
    },
    dms: {
      list: vi.fn(async () => ({ channels: [testDm, testGroupDm] })),
      open: vi.fn(async (recipientIds: readonly string[]) => ({
        channel: recipientIds.length === 1 ? testDm : testGroupDm,
      })),
      rename: vi.fn(async (_channelId: string, name: string | null) => ({
        channel: { ...testGroupDm, name: name || null },
      })),
      addRecipient: vi.fn(async () => undefined),
      removeRecipient: vi.fn(async () => undefined),
      hide: vi.fn(async () => undefined),
    },
    pins: {
      list: vi.fn(async () => ({ messages: [] as Message[] })),
      pin: vi.fn(async () => undefined),
      unpin: vi.fn(async () => undefined),
    },
    polls: {
      voters: vi.fn(
        async (_channelId: string, _messageId: string, _answerId: number, _query?: object) => ({
          users: [testFriend],
        }),
      ),
      vote: vi.fn(
        async (_channelId: string, _messageId: string, _answerIds: readonly number[]) => ({
          poll: testPoll,
        }),
      ),
      end: vi.fn(async (_channelId: string, _messageId: string) => ({ poll: testPoll })),
    },
    reactions: {
      setEncrypted: vi.fn(
        async (_channelId: string, _messageId: string, _ciphertext: string | null) => undefined,
      ),
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      removeOf: vi.fn(async () => undefined),
      users: vi.fn(async () => ({ users: [] })),
    },
    attachments: {
      create: vi.fn(async () => ({ attachment: testUpload })),
      upload: vi.fn(
        async (_channelId: string, _file: Blob, _options?: UploadOptions) => testUpload.id,
      ),
    },
    media: {
      download: vi.fn(async (path: string, _options?: DownloadOptions) => {
        const response = await fetch(path)
        if (!response.ok) throw new Error(`Download failed: ${response.status}`)
        return response.blob()
      }),
    },
    instance: {
      get: vi.fn(async () => ({
        instance: {
          name: 'Chinchi',
          registrationMode,
          uploads: { maxBytes: 25 * 1024 * 1024, maxAttachments: 10 } as UploadLimits | null,
          voice: false,
          requireVerifiedEmail: false,
        },
      })),
    },
  } satisfies ApiClient
}

export type FakeApi = ReturnType<typeof createFakeApi>
