import { Permission } from '@chinchi/shared'
import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { openMessageMenu } from '../../test/message-menu'
import { renderApp } from '../../test/render-app'

const CHANNEL_URL = `/channels/${testGuild.id}/503`

const history = () => screen.findByRole('list', { name: 'Сообщения в #общий' })
const composer = () => screen.findByRole('textbox', { name: 'Сообщение в #общий' })
const messageRow = (text: string) => screen.getByText(text).closest('li') as HTMLElement

describe('message history', () => {
  it('shows messages with authors, collapsing runs and separating days', async () => {
    renderApp(CHANNEL_URL, { user: testUser })

    const list = await history()
    expect(within(list).getByText('Привет всем!')).toBeVisible()
    // Bob's two messages a minute apart share one header.
    expect(within(list).getAllByText('Боб')).toHaveLength(1)
    expect(within(list).getAllByRole('separator')).toHaveLength(2)
  })

  it('starts the channel with a welcome when there is no more history', async () => {
    renderApp(CHANNEL_URL, { user: testUser })
    expect(await screen.findByRole('heading', { name: 'Добро пожаловать в #общий!' })).toBeVisible()
  })

  it('loads earlier messages on request', async () => {
    const api = createFakeApi({ user: testUser })
    const fullPage = Array.from({ length: 50 }, (_, i) => testMessage(String(2000 + i)))
    api.messages.list.mockResolvedValueOnce({ messages: fullPage }).mockResolvedValueOnce({
      messages: [testMessage('1500', { content: 'Самое старое' })],
    })
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Показать более ранние сообщения' }))

    expect(await screen.findByText('Самое старое')).toBeVisible()
    expect(api.messages.list).toHaveBeenLastCalledWith('503', { limit: 50, before: '2000' })
  })
})

describe('sending', () => {
  it('shows the message immediately and confirms it', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.type(await composer(), 'Новое сообщение{Enter}')

    expect(await screen.findByText('Новое сообщение')).toBeVisible()
    expect(await composer()).toHaveValue('')
    expect(api.messages.create).toHaveBeenCalledWith('503', {
      content: 'Новое сообщение',
      nonce: expect.any(String),
    })
  })

  it('keeps Shift+Enter as a newline', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.type(await composer(), 'строка 1{Shift>}{Enter}{/Shift}строка 2')

    expect(await composer()).toHaveValue('строка 1\nстрока 2')
    expect(api.messages.create).not.toHaveBeenCalled()
  })

  it('offers to retry a message that failed to send', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.create.mockRejectedValueOnce(apiError(0, 'NETWORK_ERROR'))
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.type(await composer(), 'Потерянное{Enter}')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Не удалось отправить.')

    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await waitFor(() => expect(api.messages.create).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getAllByText('Потерянное')).toHaveLength(1)
  })

  it('tells others that you are typing, without flooding the server', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.type(await composer(), 'abc')

    expect(api.messages.typing).toHaveBeenCalledTimes(1)
  })
})

describe('editing and deleting', () => {
  it('edits your own message inline', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await history()
    await user.hover(messageRow('Отлично!'))
    await user.click(
      within(await openMessageMenu(messageRow('Отлично!'))).getByRole('menuitem', {
        name: 'Редактировать',
      }),
    )
    const box = screen.getByRole('textbox', { name: 'Изменить сообщение' })
    await user.clear(box)
    await user.type(box, 'Просто отлично!{Enter}')

    await waitFor(() =>
      expect(api.messages.update).toHaveBeenCalledWith('503', '1003', 'Просто отлично!'),
    )
    expect(await screen.findByText('(изменено)')).toBeVisible()
  })

  it('opens your last message for editing with the up arrow', async () => {
    const { user } = renderApp(CHANNEL_URL, { user: testUser })

    await user.click(await composer())
    await user.keyboard('{ArrowUp}')

    expect(screen.getByRole('textbox', { name: 'Изменить сообщение' })).toHaveValue('Отлично!')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Изменить сообщение' })).not.toBeInTheDocument()
  })

  it('asks before deleting, unless Shift is held', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })
    await history()

    await user.click(
      within(await openMessageMenu(messageRow('Отлично!'))).getByRole('menuitem', {
        name: 'Удалить',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Удалить сообщение' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(api.messages.delete).toHaveBeenCalledWith('503', '1003'))
    await waitFor(() => expect(screen.queryByText('Отлично!')).not.toBeInTheDocument())

    // The owner may also remove others' messages; Shift skips the confirmation.
    await user.keyboard('{Shift>}')
    await user.click(
      within(await openMessageMenu(messageRow('Как дела?'))).getByRole('menuitem', {
        name: 'Удалить',
      }),
    )
    await user.keyboard('{/Shift}')
    await waitFor(() => expect(api.messages.delete).toHaveBeenCalledWith('503', '1002'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it("does not offer to edit or delete other people's messages to regular members", async () => {
    const member = { ...testUser, id: '999', username: 'carol' }
    renderApp(CHANNEL_URL, { user: member })

    await history()
    const menu = within(await openMessageMenu(messageRow('Как дела?')))
    expect(menu.getByRole('menuitem', { name: 'Ответить' })).toBeInTheDocument()
    expect(menu.queryByRole('menuitem', { name: 'Редактировать' })).not.toBeInTheDocument()
    expect(menu.queryByRole('menuitem', { name: 'Удалить' })).not.toBeInTheDocument()
  })

  it('lets members with MANAGE_MESSAGES delete messages of others', async () => {
    const api = createFakeApi({ user: { ...testUser, id: '999', username: 'carol' } })
    api.guilds.get.mockResolvedValue({
      guild: { ...testGuild, ownerId: '200', myRoleIds: ['510'] },
    })
    renderApp(CHANNEL_URL, { api })

    await history()
    const menu = within(await openMessageMenu(messageRow('Как дела?')))
    expect(menu.getByRole('menuitem', { name: 'Удалить' })).toBeVisible()
    expect(menu.queryByRole('menuitem', { name: 'Редактировать' })).not.toBeInTheDocument()
  })

  it('replaces the composer with a notice when sending is not allowed', async () => {
    const api = createFakeApi({ user: { ...testUser, id: '999', username: 'carol' } })
    api.guilds.get.mockResolvedValue({
      guild: {
        ...testGuild,
        ownerId: '200',
        channels: testGuild.channels.map((channel) =>
          channel.id === '503'
            ? {
                ...channel,
                permissionOverwrites: [
                  {
                    targetType: 'role' as const,
                    targetId: testGuild.id,
                    allow: '0',
                    deny: String(Permission.SendMessages),
                  },
                ],
              }
            : channel,
        ),
      },
    })
    renderApp(CHANNEL_URL, { api })

    await history()
    expect(screen.getByText('У вас нет прав отправлять сообщения в этот канал.')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Сообщение в #общий' })).not.toBeInTheDocument()
  })

  it('paints author names with their role color', async () => {
    renderApp(CHANNEL_URL, { user: testUser })
    await history()
    await waitFor(() => expect(screen.getAllByText('Боб')[0]).toHaveStyle({ color: '#2ecc71' }))
  })
})

describe('realtime', () => {
  it('shows messages from others as they arrive', async () => {
    const { gateway } = renderApp(CHANNEL_URL, { user: testUser })
    await history()

    act(() => gateway.emit('MESSAGE_CREATE', testMessage('1004', { content: 'Живое сообщение' })))

    expect(await screen.findByText('Живое сообщение')).toBeVisible()
  })

  it('shows who is typing, and stops when their message arrives', async () => {
    const { gateway } = renderApp(CHANNEL_URL, { user: testUser })
    await history()

    act(() =>
      gateway.emit('TYPING_START', {
        channelId: '503',
        guildId: testGuild.id,
        userId: '200',
        timestamp: '',
      }),
    )
    expect(await screen.findByText('Боб печатает…')).toBeVisible()

    act(() => gateway.emit('MESSAGE_CREATE', testMessage('1005')))
    await waitFor(() => expect(screen.queryByText('Боб печатает…')).not.toBeInTheDocument())
  })

  it('reflects edits and deletions made elsewhere', async () => {
    const { gateway } = renderApp(CHANNEL_URL, { user: testUser })
    await history()

    act(() => {
      gateway.emit(
        'MESSAGE_UPDATE',
        testMessage('1001', { content: 'Привет, мир!', editedAt: '2026-10-14T12:00:00.000Z' }),
      )
      gateway.emit('MESSAGE_DELETE', { id: '1002', channelId: '503', guildId: testGuild.id })
    })

    expect(await screen.findByText('Привет, мир!')).toBeVisible()
    expect(screen.queryByText('Как дела?')).not.toBeInTheDocument()
  })

  it('marks the open channel as read', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.readStates.mockResolvedValue({
      readStates: [{ channelId: '503', lastReadMessageId: '1001' }],
      mentionCounts: {},
    })
    renderApp(CHANNEL_URL, { api })

    await waitFor(() => expect(api.messages.ack).toHaveBeenCalledWith('503', '1003'))
  })

  it('highlights channels and servers with unread messages', async () => {
    const { gateway } = renderApp(CHANNEL_URL, { user: testUser })
    await history()

    act(() =>
      gateway.emit('MESSAGE_CREATE', testMessage('1100', { channelId: '504', content: 'В мемах' })),
    )

    const channels = screen.getByRole('navigation', { name: 'Каналы' })
    expect(
      await within(channels).findByRole('link', { name: /мемы \(есть непрочитанные\)/ }),
    ).toBeVisible()
    expect(
      within(screen.getByRole('navigation', { name: 'Серверы' })).getByRole('link', {
        name: 'Котики (есть непрочитанные)',
      }),
    ).toBeVisible()
  })

  it('shows member presence and lets you change your status', async () => {
    const { gateway, user } = renderApp(CHANNEL_URL, { user: testUser })
    await history()

    act(() => gateway.emit('PRESENCE_UPDATE', { userId: '200', status: 'dnd' }))
    const members = await screen.findByRole('complementary', { name: 'Участники — 2' })
    // Bob is online and holds the hoisted «Модераторы» role, painted in its color.
    expect(within(members).getByText('Модераторы — 1')).toBeVisible()
    expect(within(members).getByText('Боб')).toHaveStyle({ color: '#2ecc71' })
    expect(within(members).getByRole('img', { name: 'Не беспокоить' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Изменить статус' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Не активен' }))

    expect(gateway.client.setStatus).toHaveBeenCalledWith('idle')
    expect(
      within(screen.getByRole('region', { name: 'Текущий пользователь' })).getByText('Не активен'),
    ).toBeVisible()
  })

  it('tells the user when the connection drops', async () => {
    const { gateway } = renderApp(CHANNEL_URL, { user: testUser })
    await history()

    act(() => gateway.setState('reconnecting'))
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Переподключаемся')

    act(() => gateway.setState('ready'))
    expect(screen.queryByText(/Переподключаемся/)).not.toBeInTheDocument()
  })

  it('signs out when the gateway rejects the session', async () => {
    const { gateway, router } = renderApp(CHANNEL_URL, { user: testUser })
    await history()

    act(() => gateway.rejectAuth())

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('connects once while signed in', async () => {
    const { gateway } = renderApp(CHANNEL_URL, { user: testUser })
    await history()
    expect(gateway.client.connect).toHaveBeenCalledTimes(1)
  })
})
