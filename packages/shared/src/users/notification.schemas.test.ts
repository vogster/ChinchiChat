import { describe, expect, it } from 'vitest'

import {
  isMuteActive,
  resolveNotifications,
  shouldNotify,
  updateNotificationSettingRequestSchema,
} from './notification.schemas'

import type { NotificationSetting } from './notification.schemas'

const NOW = Date.parse('2026-10-15T12:00:00.000Z')
const setting = (targetId: string, change: Partial<NotificationSetting>): NotificationSetting => ({
  targetId,
  level: null,
  muted: false,
  mutedUntil: null,
  ...change,
})
const settingsOf = (...items: NotificationSetting[]) =>
  new Map(items.map((item) => [item.targetId, item]))

describe('updateNotificationSettingRequestSchema', () => {
  it('accepts a level, a mute and a timed mute', () => {
    expect(updateNotificationSettingRequestSchema.safeParse({ level: 'mentions' }).success).toBe(
      true,
    )
    expect(updateNotificationSettingRequestSchema.safeParse({ level: null }).success).toBe(true)
    expect(
      updateNotificationSettingRequestSchema.safeParse({
        muted: true,
        mutedUntil: '2026-10-15T13:00:00.000Z',
      }).success,
    ).toBe(true)
  })

  it('rejects empty bodies, unknown levels and an end without a mute', () => {
    expect(updateNotificationSettingRequestSchema.safeParse({}).success).toBe(false)
    expect(updateNotificationSettingRequestSchema.safeParse({ level: 'loud' }).success).toBe(false)
    expect(
      updateNotificationSettingRequestSchema.safeParse({ mutedUntil: '2026-10-15T13:00:00.000Z' })
        .success,
    ).toBe(false)
    expect(
      updateNotificationSettingRequestSchema.safeParse({
        muted: false,
        mutedUntil: '2026-10-15T13:00:00.000Z',
      }).success,
    ).toBe(false)
  })
})

describe('isMuteActive', () => {
  it('holds until the end time, or forever without one', () => {
    expect(isMuteActive(setting('1', { muted: true }), NOW)).toBe(true)
    expect(
      isMuteActive(setting('1', { muted: true, mutedUntil: '2026-10-15T13:00:00.000Z' }), NOW),
    ).toBe(true)
    expect(
      isMuteActive(setting('1', { muted: true, mutedUntil: '2026-10-15T11:00:00.000Z' }), NOW),
    ).toBe(false)
    expect(isMuteActive(setting('1', {}), NOW)).toBe(false)
    expect(isMuteActive(undefined, NOW)).toBe(false)
  })
})

describe('resolveNotifications', () => {
  const thread = { guildId: 'g', channelIds: ['thread', 'channel', 'category'] }

  it('defaults to every message, in servers and DMs alike', () => {
    expect(resolveNotifications(new Map(), thread, NOW)).toEqual({ muted: false, level: 'all' })
    expect(resolveNotifications(new Map(), { guildId: null, channelIds: ['dm'] }, NOW)).toEqual({
      muted: false,
      level: 'all',
    })
  })

  it('takes the closest explicit level: channel, then its parents, then the server', () => {
    const settings = settingsOf(
      setting('g', { level: 'none' }),
      setting('category', { level: 'mentions' }),
    )
    expect(resolveNotifications(settings, thread, NOW).level).toBe('mentions')
    expect(
      resolveNotifications(
        new Map([...settings, ['channel', setting('channel', { level: 'all' })]]),
        thread,
        NOW,
      ).level,
    ).toBe('all')
    expect(resolveNotifications(settings, { guildId: 'g', channelIds: ['other'] }, NOW).level).toBe(
      'none',
    )
  })

  it('is muted when the channel, a parent or the server is muted (and the mute holds)', () => {
    expect(resolveNotifications(settingsOf(setting('g', { muted: true })), thread, NOW).muted).toBe(
      true,
    )
    expect(
      resolveNotifications(settingsOf(setting('category', { muted: true })), thread, NOW).muted,
    ).toBe(true)
    expect(
      resolveNotifications(
        settingsOf(setting('channel', { muted: true, mutedUntil: '2026-10-15T11:00:00.000Z' })),
        thread,
        NOW,
      ).muted,
    ).toBe(false)
  })
})

describe('shouldNotify', () => {
  it('follows the level, and never while muted', () => {
    expect(shouldNotify({ muted: false, level: 'all' }, false)).toBe(true)
    expect(shouldNotify({ muted: false, level: 'mentions' }, false)).toBe(false)
    expect(shouldNotify({ muted: false, level: 'mentions' }, true)).toBe(true)
    expect(shouldNotify({ muted: false, level: 'none' }, true)).toBe(false)
    expect(shouldNotify({ muted: true, level: 'all' }, true)).toBe(false)
  })
})
