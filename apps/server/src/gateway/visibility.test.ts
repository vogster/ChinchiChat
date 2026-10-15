import { DEFAULT_EVERYONE_PERMISSIONS, Permission } from '@chinchi/shared'
import { describe, expect, it } from 'vitest'

import { applyGuildEvent, visibleChannelIds } from './visibility'

import type { GuildPermissionState } from './visibility'
import type { Channel, Role } from '@chinchi/shared'

const GUILD = 'g'
const ME = 'me'
const VIEW = String(Permission.ViewChannel)

const role = (id: string, position: number, permissions: bigint): Role => ({
  id,
  guildId: GUILD,
  name: id,
  color: 0,
  position,
  permissions: String(permissions),
  hoist: false,
  mentionable: false,
})

const channel = (id: string, overwrites: Channel['permissionOverwrites'] = []): Channel => ({
  id,
  guildId: GUILD,
  type: 'text',
  name: id,
  topic: null,
  parentId: null,
  position: 0,
  lastMessageId: null,
  permissionOverwrites: overwrites,
  rateLimitPerUser: 0,
  nsfw: false,
  announcement: false,
  threadStarterId: null,
  messageCount: 0,
  ownerId: null,
})

const hiddenFromEveryone = (id: string, extra: Channel['permissionOverwrites'] = []) =>
  channel(id, [{ targetType: 'role', targetId: GUILD, allow: '0', deny: VIEW }, ...extra])

const state = (overrides: Partial<GuildPermissionState> = {}): GuildPermissionState => ({
  guildId: GUILD,
  ownerId: 'owner',
  roles: [role(GUILD, 0, DEFAULT_EVERYONE_PERMISSIONS), role('staff', 1, 0n)],
  memberRoleIds: [],
  channels: new Map([
    ['public', channel('public')],
    [
      'secret',
      hiddenFromEveryone('secret', [
        { targetType: 'role', targetId: 'staff', allow: VIEW, deny: '0' },
      ]),
    ],
  ]),
  ...overrides,
})

const types = (outputs: readonly { type: string; data: unknown }[]) =>
  outputs.map((o) => `${o.type}:${(o.data as { id?: string }).id ?? ''}`)

describe('visibleChannelIds', () => {
  it('lists only channels the user can view', () => {
    expect([...visibleChannelIds(state(), ME)]).toEqual(['public'])
    expect([...visibleChannelIds(state({ memberRoleIds: ['staff'] }), ME)].sort()).toEqual([
      'public',
      'secret',
    ])
    expect([...visibleChannelIds(state(), 'owner')].sort()).toEqual(['public', 'secret'])
  })
})

describe('applyGuildEvent', () => {
  it('forwards messages and typing only from visible channels', () => {
    const s = state()
    const inPublic = { channelId: 'public', id: 'm1' }
    const inSecret = { channelId: 'secret', id: 'm2' }

    expect(applyGuildEvent(s, ME, 'MESSAGE_CREATE', inPublic).outputs).toEqual([
      { type: 'MESSAGE_CREATE', data: inPublic },
    ])
    expect(applyGuildEvent(s, ME, 'MESSAGE_CREATE', inSecret).outputs).toEqual([])
    expect(applyGuildEvent(s, ME, 'TYPING_START', inSecret).outputs).toEqual([])
    expect(applyGuildEvent(s, ME, 'MESSAGE_DELETE', inSecret).outputs).toEqual([])
    expect(applyGuildEvent(s, ME, 'MESSAGE_REACTION_ADD', inSecret).outputs).toEqual([])
    expect(applyGuildEvent(s, ME, 'MESSAGE_REACTION_REMOVE', inSecret).outputs).toEqual([])
  })

  it('shows voice states only in visible channels; joining a hidden one looks like leaving', () => {
    const voice = (channelId: string | null) => ({
      guildId: GUILD,
      channelId,
      userId: 'bob',
      selfMute: false,
      selfDeaf: false,
      serverMute: false,
      serverDeaf: false,
      video: false,
      stream: false,
    })

    expect(applyGuildEvent(state(), ME, 'VOICE_STATE_UPDATE', voice('public')).outputs).toEqual([
      { type: 'VOICE_STATE_UPDATE', data: voice('public') },
    ])
    expect(applyGuildEvent(state(), ME, 'VOICE_STATE_UPDATE', voice('secret')).outputs).toEqual([
      { type: 'VOICE_STATE_UPDATE', data: voice(null) },
    ])
    expect(applyGuildEvent(state(), ME, 'VOICE_STATE_UPDATE', voice(null)).outputs).toEqual([
      { type: 'VOICE_STATE_UPDATE', data: voice(null) },
    ])
  })

  it('drops events about unknown channels', () => {
    expect(applyGuildEvent(state(), ME, 'MESSAGE_CREATE', { channelId: 'nope' }).outputs).toEqual(
      [],
    )
  })

  it('announces new channels only to those who can see them', () => {
    const hidden = hiddenFromEveryone('new')
    const result = applyGuildEvent(state(), ME, 'CHANNEL_CREATE', hidden)

    expect(result.outputs).toEqual([])
    // …but remembers it, in case it becomes visible later.
    expect(result.state.channels.get('new')).toEqual(hidden)
  })

  it('turns an update that hides a channel into a delete, and one that reveals it into a create', () => {
    const hide = applyGuildEvent(state(), ME, 'CHANNEL_UPDATE', hiddenFromEveryone('public'))
    expect(hide.outputs).toEqual([
      { type: 'CHANNEL_DELETE', data: { id: 'public', guildId: GUILD } },
    ])

    const reveal = applyGuildEvent(hide.state, ME, 'CHANNEL_UPDATE', channel('public'))
    expect(reveal.outputs).toEqual([{ type: 'CHANNEL_CREATE', data: channel('public') }])
  })

  it('forwards channel deletes only for channels the user could see', () => {
    expect(
      types(
        applyGuildEvent(state(), ME, 'CHANNEL_DELETE', { id: 'secret', guildId: GUILD }).outputs,
      ),
    ).toEqual([])
    const result = applyGuildEvent(state(), ME, 'CHANNEL_DELETE', { id: 'public', guildId: GUILD })
    expect(types(result.outputs)).toEqual(['CHANNEL_DELETE:public'])
    expect(result.state.channels.has('public')).toBe(false)
  })

  it('reveals channels when the user gets a role, and hides them when it is taken away', () => {
    const granted = applyGuildEvent(state(), ME, 'GUILD_MEMBER_UPDATE', {
      guildId: GUILD,
      userId: ME,
      roleIds: ['staff'],
    })
    expect(types(granted.outputs)).toEqual(['GUILD_MEMBER_UPDATE:', 'CHANNEL_CREATE:secret'])

    const revoked = applyGuildEvent(granted.state, ME, 'GUILD_MEMBER_UPDATE', {
      guildId: GUILD,
      userId: ME,
      roleIds: [],
    })
    expect(types(revoked.outputs)).toEqual(['GUILD_MEMBER_UPDATE:', 'CHANNEL_DELETE:secret'])
  })

  it('ignores other members’ role changes for visibility', () => {
    const result = applyGuildEvent(state(), ME, 'GUILD_MEMBER_UPDATE', {
      guildId: GUILD,
      userId: 'bob',
      roleIds: ['staff'],
    })
    expect(types(result.outputs)).toEqual(['GUILD_MEMBER_UPDATE:'])
  })

  it('recomputes visibility when roles change', () => {
    const withAdmin = applyGuildEvent(
      state({ memberRoleIds: ['staff'] }),
      ME,
      'GUILD_ROLE_UPDATE',
      {
        guildId: GUILD,
        role: role(GUILD, 0, DEFAULT_EVERYONE_PERMISSIONS & ~Permission.ViewChannel),
      },
    )
    // @everyone lost VIEW_CHANNEL: the public channel disappears; the staff override keeps secret.
    expect(types(withAdmin.outputs)).toEqual(['GUILD_ROLE_UPDATE:', 'CHANNEL_DELETE:public'])

    const deleted = applyGuildEvent(state({ memberRoleIds: ['staff'] }), ME, 'GUILD_ROLE_DELETE', {
      guildId: GUILD,
      roleId: 'staff',
    })
    expect(types(deleted.outputs)).toEqual(['GUILD_ROLE_DELETE:', 'CHANNEL_DELETE:secret'])
    expect(deleted.state.memberRoleIds).toEqual([])

    const created = applyGuildEvent(state(), ME, 'GUILD_ROLE_CREATE', {
      guildId: GUILD,
      role: role('new', 2, 0n),
    })
    expect(created.state.roles.map((r) => r.id)).toContain('new')
  })

  it('recomputes visibility when ownership changes', () => {
    const result = applyGuildEvent(state(), ME, 'GUILD_UPDATE', {
      id: GUILD,
      name: 'x',
      ownerId: ME,
      createdAt: '',
    })
    expect(types(result.outputs)).toEqual([`GUILD_UPDATE:${GUILD}`, 'CHANNEL_CREATE:secret'])
  })

  it('passes server-level events through untouched', () => {
    for (const type of ['PRESENCE_UPDATE', 'GUILD_MEMBER_ADD', 'GUILD_MEMBER_REMOVE'] as const) {
      expect(applyGuildEvent(state(), ME, type, { guildId: GUILD }).outputs).toEqual([
        { type, data: { guildId: GUILD } },
      ])
    }
  })
})
