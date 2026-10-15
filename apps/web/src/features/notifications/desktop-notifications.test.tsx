import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeApi, testDm, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'
import { setDesktopNotifications } from './desktop-preference'

import type { NotificationSetting } from '@chinchi/shared'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const bob = { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: null }

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => FakeNotification.permission)
  static shown: FakeNotification[] = []
  onclick: (() => void) | null = null
  close = vi.fn()
  constructor(
    readonly title: string,
    readonly options: NotificationOptions = {},
  ) {
    FakeNotification.shown.push(this)
  }
}

const setting = (targetId: string, change: Partial<NotificationSetting>): NotificationSetting => ({
  targetId,
  level: null,
  muted: false,
  mutedUntil: null,
  ...change,
})

beforeEach(() => {
  FakeNotification.permission = 'granted'
  FakeNotification.shown = []
  vi.stubGlobal('Notification', FakeNotification)
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  setDesktopNotifications(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setDesktopNotifications(false)
  document.title = 'Chinchi'
})

describe('desktop notifications setting', () => {
  it('asks the browser for permission when turned on', async () => {
    setDesktopNotifications(false)
    FakeNotification.permission = 'default'
    FakeNotification.requestPermission.mockImplementationOnce(async () => {
      FakeNotification.permission = 'granted'
      return 'granted'
    })
    const { user } = renderApp('/settings/notifications', { user: testUser })

    const toggle = await screen.findByRole('switch', { name: /Уведомления на рабочем столе/ })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)

    expect(FakeNotification.requestPermission).toHaveBeenCalled()
    await waitFor(() => expect(toggle).toBeChecked())
  })

  it('explains when the browser blocks notifications', async () => {
    FakeNotification.permission = 'denied'
    renderApp('/settings/notifications', { user: testUser })

    expect(
      await screen.findByRole('switch', { name: /Уведомления на рабочем столе/ }),
    ).toBeDisabled()
    expect(screen.getByText(/запретил уведомления/)).toBeVisible()
  })
})

describe('desktop notifications', () => {
  it('shows a DM while the tab is in the background and opens it on click', async () => {
    const { gateway, router } = renderApp(GENERAL_URL, { user: testUser })
    await screen.findByText('Как дела?')

    act(() =>
      gateway.emit(
        'MESSAGE_CREATE',
        testMessage('1200', {
          channelId: testDm.id,
          guildId: null,
          author: bob,
          content: 'Привет',
        }),
      ),
    )

    await waitFor(() => expect(FakeNotification.shown).toHaveLength(1))
    const [shown] = FakeNotification.shown
    expect(shown?.title).toBe('Боб')
    expect(shown?.options.body).toBe('Привет')
    act(() => shown?.onclick?.())
    await waitFor(() => expect(router.state.location.pathname).toBe(`/channels/@me/${testDm.id}`))
  })

  it('follows the level: with "only mentions" a server message needs a mention', async () => {
    const api = createFakeApi({ user: testUser })
    api.notifications.list.mockResolvedValue({
      notificationSettings: [setting(testGuild.id, { level: 'mentions' })],
    })
    const { gateway } = renderApp(GENERAL_URL, { api })
    await screen.findByText('Как дела?')

    act(() => gateway.emit('MESSAGE_CREATE', testMessage('1201', { author: bob, content: 'Всем' })))
    act(() =>
      gateway.emit(
        'MESSAGE_CREATE',
        testMessage('1202', {
          channelId: '504',
          author: bob,
          content: 'Алиса, глянь',
          mentions: { users: [testUser.id], roles: [], everyone: false, here: false },
        }),
      ),
    )

    await waitFor(() => expect(FakeNotification.shown).toHaveLength(1))
    expect(FakeNotification.shown[0]?.title).toBe('Боб (#мемы, Котики)')
  })

  it('stays quiet in a focused tab, in muted channels and for my own messages', async () => {
    const api = createFakeApi({ user: testUser })
    api.notifications.list.mockResolvedValue({
      notificationSettings: [setting('504', { muted: true })],
    })
    const { gateway } = renderApp(GENERAL_URL, { api })
    await screen.findByText('Как дела?')

    act(() =>
      gateway.emit('MESSAGE_CREATE', testMessage('1203', { channelId: '504', author: bob })),
    )
    act(() =>
      gateway.emit(
        'MESSAGE_CREATE',
        testMessage('1204', {
          content: 'Это я',
          author: { id: testUser.id, username: 'alice', displayName: null, avatarUrl: null },
        }),
      ),
    )
    vi.mocked(document.hasFocus).mockReturnValue(true)
    act(() => gateway.emit('MESSAGE_CREATE', testMessage('1205', { author: bob })))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(FakeNotification.shown).toHaveLength(0)
  })

  it('stays quiet while I am on "Do not disturb"', async () => {
    const { gateway } = renderApp(GENERAL_URL, { user: testUser })
    await screen.findByText('Как дела?')

    act(() => gateway.emit('PRESENCE_UPDATE', { userId: testUser.id, status: 'dnd' }))
    act(() =>
      gateway.emit(
        'MESSAGE_CREATE',
        testMessage('1207', { channelId: testDm.id, guildId: null, author: bob }),
      ),
    )

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(FakeNotification.shown).toHaveLength(0)
  })

  it('stays quiet when turned off', async () => {
    setDesktopNotifications(false)
    const { gateway } = renderApp(GENERAL_URL, { user: testUser })
    await screen.findByText('Как дела?')

    act(() => gateway.emit('MESSAGE_CREATE', testMessage('1206', { author: bob })))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(FakeNotification.shown).toHaveLength(0)
  })
})

describe('unread badge', () => {
  it('counts mentions and DMs in the tab title and marks the icon', async () => {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.href = '/favicon.svg'
    document.head.append(icon)
    const { gateway } = renderApp(GENERAL_URL, { user: testUser })
    await screen.findByText('Как дела?')

    act(() =>
      gateway.emit('READY', {
        sessionId: 's',
        user: testUser,
        guilds: [testGuild],
        privateChannels: [testDm],
        voiceStates: [],
        presences: [],
        readStates: [],
        notificationSettings: [],
        mentionCounts: { '504': 2, [testDm.id]: 1 },
      }),
    )

    await waitFor(() => expect(document.title).toBe('(3) Chinchi'))
    expect(icon.getAttribute('href')).toBe('/favicon-unread.svg')
    icon.remove()
  })
})
