import { describe, expect, it } from 'vitest'

import {
  CloseCode,
  GATEWAY_VERSION,
  Opcode,
  dispatchSchemas,
  parseClientMessage,
  presenceStatusSchema,
} from './gateway'

describe('parseClientMessage', () => {
  it.each([
    [{ op: Opcode.Heartbeat, d: 42 }],
    [{ op: Opcode.Heartbeat, d: null }],
    [{ op: Opcode.Identify, d: {} }],
    [{ op: Opcode.Identify, d: { token: 'abc' } }],
    [{ op: Opcode.Resume, d: { sessionId: 'sess', seq: 10 } }],
    [{ op: Opcode.PresenceUpdate, d: { status: 'idle' } }],
  ])('accepts %j', (message) => {
    expect(parseClientMessage(JSON.stringify(message))).toEqual({ ok: true, message })
  })

  it.each([
    ['not json', '{nope'],
    ['unknown opcode', JSON.stringify({ op: 99, d: null })],
    ['server-only opcode', JSON.stringify({ op: Opcode.Hello, d: { heartbeatInterval: 1 } })],
    ['bad payload', JSON.stringify({ op: Opcode.Resume, d: { sessionId: 1 } })],
    ['bad status', JSON.stringify({ op: Opcode.PresenceUpdate, d: { status: 'away' } })],
    ['oversized frame', JSON.stringify({ op: Opcode.Identify, d: { token: 'x'.repeat(5000) } })],
  ])('rejects %s', (_label, raw) => {
    expect(parseClientMessage(raw)).toEqual({ ok: false })
  })
})

describe('protocol constants', () => {
  it('uses Discord-like opcode numbers', () => {
    expect(Opcode).toMatchObject({
      Dispatch: 0,
      Heartbeat: 1,
      Identify: 2,
      Hello: 10,
      HeartbeatAck: 11,
    })
  })

  it('reserves 4000+ close codes for the application', () => {
    for (const code of Object.values(CloseCode)) expect(code).toBeGreaterThanOrEqual(4000)
  })

  it('has a protocol version', () => {
    expect(GATEWAY_VERSION).toBe(1)
  })

  it('distinguishes the statuses users can pick from what others see', () => {
    expect(presenceStatusSchema.options).toEqual(['online', 'idle', 'dnd', 'offline'])
  })
})

describe('dispatchSchemas', () => {
  it('validates typing events', () => {
    const event = {
      channelId: '1',
      guildId: '2',
      userId: '3',
      timestamp: '2026-10-14T12:00:00.000Z',
    }
    expect(dispatchSchemas.TYPING_START.parse(event)).toEqual(event)
  })

  it('describes every event the server emits', () => {
    expect(Object.keys(dispatchSchemas).sort()).toEqual(
      [
        'CHANNEL_ACK',
        'CHANNEL_CREATE',
        'CHANNEL_DELETE',
        'CHANNEL_UPDATE',
        'E2EE_DEVICES_UPDATE',
        'E2EE_HANDSHAKE',
        'GUILD_CREATE',
        'GUILD_DELETE',
        'GUILD_MEMBER_ADD',
        'GUILD_MEMBER_REMOVE',
        'GUILD_MEMBER_UPDATE',
        'GUILD_ROLE_CREATE',
        'GUILD_ROLE_DELETE',
        'GUILD_EMOJIS_UPDATE',
        'INTERACTION_CREATE',
        'GUILD_ROLE_UPDATE',
        'GUILD_UPDATE',
        'MESSAGE_CREATE',
        'MESSAGE_DELETE',
        'MESSAGE_REACTION_ADD',
        'MESSAGE_REACTION_REMOVE',
        'MESSAGE_UPDATE',
        'NOTIFICATION_SETTINGS_UPDATE',
        'PRESENCE_UPDATE',
        'PRIVATE_CHANNEL_CREATE',
        'PRIVATE_CHANNEL_DELETE',
        'PRIVATE_CHANNEL_UPDATE',
        'READY',
        'RELATIONSHIP_ADD',
        'RELATIONSHIP_REMOVE',
        'RESUMED',
        'TYPING_START',
        'USER_UPDATE',
        'VOICE_STATE_UPDATE',
      ].sort(),
    )
  })
})
