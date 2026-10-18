import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFakeApi, testDm, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { NotificationSetting } from '@chinchi/shared'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const NOW = new Date('2026-10-15T12:00:00.000Z')

const setting = (targetId: string, change: Partial<NotificationSetting>): NotificationSetting => ({
  targetId,
  level: null,
  muted: false,
  mutedUntil: null,
  ...change,
})

const channels = () => screen.findByRole('navigation', { name: 'Каналы' })
const rail = () => screen.getByRole('navigation', { name: 'Серверы' })

afterEach(() => {
  vi.useRealTimers()
})

describe('notification settings', () => {
  it('mutes a channel for an hour from its header', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Уведомления канала' }))
    const dialog = await screen.findByRole('dialog', { name: 'Уведомления: #общий' })
    // A popover from the header, like threads and pins: inside the chat's card, not a window.
    expect(screen.getByRole('main')).toContainElement(dialog)
    await user.selectOptions(within(dialog).getByLabelText('Заглушить'), '1 час')

    await waitFor(() =>
      expect(api.notifications.update).toHaveBeenCalledWith('503', {
        muted: true,
        mutedUntil: '2026-10-15T13:00:00.000Z',
      }),
    )
    expect(await within(dialog).findByText(/Заглушено до/)).toBeVisible()
    await user.keyboard('{Escape}')
    expect(
      await within(await channels()).findByRole('link', { name: 'общий (заглушён)' }),
    ).toBeVisible()
  })

  it('sets what a server notifies about from the server menu', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Меню сервера Котики' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Уведомления' }))
    const dialog = await screen.findByRole('dialog', { name: 'Уведомления: Котики' })
    expect(within(dialog).getByRole('radio', { name: 'Все сообщения' })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: 'Только упоминания' }))

    await waitFor(() =>
      expect(api.notifications.update).toHaveBeenCalledWith(testGuild.id, { level: 'mentions' }),
    )
  })

  it('lets a channel follow the server again', async () => {
    const api = createFakeApi({ user: testUser })
    api.notifications.list.mockResolvedValue({
      notificationSettings: [setting('503', { level: 'none' })],
    })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Уведомления канала' }))
    const dialog = await screen.findByRole('dialog', { name: 'Уведомления: #общий' })
    expect(within(dialog).getByRole('radio', { name: 'Ничего' })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: 'Как у сервера' }))

    await waitFor(() =>
      expect(api.notifications.update).toHaveBeenCalledWith('503', { level: null }),
    )
  })

  it('hides unread markers of muted channels and servers, but keeps mentions', async () => {
    const api = createFakeApi({ user: testUser })
    api.notifications.list.mockResolvedValue({
      notificationSettings: [
        setting('504', { muted: true }),
        setting(testGuild.id, { muted: true }),
      ],
    })
    const { gateway } = renderApp(GENERAL_URL, { api })
    await channels()

    act(() =>
      gateway.emit('MESSAGE_CREATE', testMessage('1100', { channelId: '504', content: 'В мемах' })),
    )

    expect(
      await within(await channels()).findByRole('link', { name: 'мемы (заглушён)' }),
    ).toBeVisible()
    expect(within(rail()).getByRole('link', { name: 'Котики (заглушён)' })).toBeVisible()
  })

  it('follows changes made on another device', async () => {
    const { gateway } = renderApp(GENERAL_URL, { user: testUser })
    await channels()

    act(() =>
      gateway.emit('NOTIFICATION_SETTINGS_UPDATE', {
        targetId: '504',
        setting: setting('504', { muted: true }),
      }),
    )
    expect(
      await within(await channels()).findByRole('link', { name: 'мемы (заглушён)' }),
    ).toBeVisible()

    act(() => gateway.emit('NOTIFICATION_SETTINGS_UPDATE', { targetId: '504', setting: null }))
    expect(await within(await channels()).findByRole('link', { name: 'мемы' })).toBeVisible()
  })

  it('mutes a DM, which then stops counting on the home button', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, gateway } = renderApp(`/channels/${testGuild.id}/503`, { api })
    await channels()
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
        mentionCounts: { [testDm.id]: 2 },
      }),
    )
    expect(
      await within(rail()).findByRole('link', { name: /Главная \(непрочитанных/ }),
    ).toBeVisible()

    await user.click(within(rail()).getByRole('link', { name: /Главная/ }))
    await user.click(
      await within(
        await screen.findByRole('complementary', { name: 'Личные сообщения' }),
      ).findByRole('link', { name: /^Боб \(/ }),
    )
    await user.click(await screen.findByRole('button', { name: 'Уведомления беседы' }))
    const dialog = await screen.findByRole('dialog', { name: /^Уведомления: / })
    expect(within(dialog).queryByRole('radio')).toBeNull()
    await user.selectOptions(within(dialog).getByLabelText('Заглушить'), 'Пока не включу')

    await waitFor(() =>
      expect(api.notifications.update).toHaveBeenCalledWith(testDm.id, { muted: true }),
    )
    await user.keyboard('{Escape}')
    await waitFor(() => expect(within(rail()).getByRole('link', { name: 'Главная' })).toBeVisible())
  })
})
