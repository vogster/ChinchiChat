import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testHistory, testMessage, testUser } from '../../test/fake-api'
import { openMessageMenu } from '../../test/message-menu'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`

/** #общий as an announcement channel. */
const announcing = () => ({
  guild: {
    ...testGuild,
    channels: testGuild.channels.map((c) => (c.id === '503' ? { ...c, announcement: true } : c)),
  },
})

const row = (text: string) => screen.getByText(text).closest('li') as HTMLElement

describe('announcement channels', () => {
  it('are marked in the channel settings', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Настроить канал общий' }))
    const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    await user.click(within(dialog).getByRole('checkbox', { name: /Канал объявлений/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await waitFor(() =>
      expect(api.channels.update).toHaveBeenCalledWith('503', { announcement: true }),
    )
  })

  it('say where to follow and how to publish', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(announcing())
    const { user } = renderApp(GENERAL_URL, { api })

    // An icon like the other header buttons, named for screen readers and on hover.
    const follow = await screen.findByRole('button', { name: 'Подписаться на канал' })
    expect(follow).toHaveTextContent('')
    expect(follow).toHaveAttribute('title', 'Подписаться на канал')
    expect(follow).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Настроить канал общий' }))
    const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    const hint = within(dialog).getByText(/подписанные на этот/)
    expect(hint).toHaveTextContent('«Подписаться»')
    expect(hint).toHaveTextContent('«Опубликовать»')
  })

  it('publish a message to the channels that follow them', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(announcing())
    api.messages.list.mockResolvedValue({
      messages: [
        ...testHistory,
        testMessage('1100', { content: 'Уже разослано', published: true }),
      ],
    })
    const { user } = renderApp(GENERAL_URL, { api })

    await screen.findByText('Как дела?')
    await user.hover(row('Как дела?'))
    await user.click(
      within(await openMessageMenu(row('Как дела?'))).getByRole('menuitem', {
        name: 'Опубликовать',
      }),
    )
    await waitFor(() => expect(api.announcements.publish).toHaveBeenCalledWith('503', '1002'))

    await user.hover(row('Уже разослано'))
    expect(within(row('Уже разослано')).queryByRole('button', { name: 'Опубликовать' })).toBeNull()
    expect(within(row('Уже разослано')).getByText('опубликовано')).toBeVisible()
    expect(within(row('Уже разослано')).getByText('опубликовано')).toHaveAttribute(
      'title',
      'Копия отправлена в каналы, подписанные на этот',
    )
  })

  it('offer to publish right under a message, not only in its menu', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(announcing())
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1100', { content: 'Свежая новость', author: testUser }),
        testMessage('1101', { content: 'Уже разослано', author: testUser, published: true }),
      ],
    })
    const { user } = renderApp(GENERAL_URL, { api })

    await screen.findByText('Свежая новость')
    expect(within(row('Уже разослано')).queryByRole('button', { name: 'Опубликовать' })).toBeNull()
    await user.click(within(row('Свежая новость')).getByRole('button', { name: 'Опубликовать' }))
    await waitFor(() => expect(api.announcements.publish).toHaveBeenCalledWith('503', '1100'))
  })

  it('are followed into a channel picked from one searchable list', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(announcing())
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Подписаться на канал' }))
    const dialog = await screen.findByRole('dialog', { name: 'Подписка на #общий' })
    await user.type(within(dialog).getByRole('searchbox', { name: 'Найти канал' }), 'мем')
    const options = within(dialog).getByRole('listbox', { name: 'Куда подписать' })
    expect(within(options).queryByRole('option', { name: /общий/ })).toBeNull()
    await user.click(within(options).getByRole('option', { name: 'Котики · #мемы' }))
    await user.click(within(dialog).getByRole('button', { name: 'Подписаться' }))

    await waitFor(() => expect(api.announcements.follow).toHaveBeenCalledWith('503', '504'))
    expect(await screen.findByText(/Готово/)).toBeVisible()
  })

  it('show where the channel already comes, and unfollow from there', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(announcing())
    api.announcements.followers.mockResolvedValue({
      followers: [
        {
          webhookId: '701',
          guildId: '500',
          guildName: 'Котики',
          channelId: '504',
          channelName: 'мемы',
          mine: true,
          createdAt: '2026-10-15T10:00:00.000Z',
        },
      ],
    })
    const { user } = renderApp(GENERAL_URL, { api })

    const button = await screen.findByRole('button', { name: 'Подписки на канал' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await user.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Подписка на #общий' })
    const current = within(dialog).getByRole('list', { name: 'Уже приходит' })
    expect(within(current).getByText('Котики · #мемы')).toBeVisible()
    // Where it already goes can't be picked again.
    const taken = within(dialog).getByRole('option', { name: /Котики · #мемы/ })
    expect(taken).toHaveAttribute('aria-disabled', 'true')
    expect(taken).toHaveTextContent('уже подписан')

    await user.click(within(current).getByRole('button', { name: 'Отписаться: Котики · #мемы' }))
    await waitFor(() => expect(api.announcements.unfollow).toHaveBeenCalledWith('503', '701'))
  })
})

describe('followers of an announcement channel', () => {
  it('are listed in its settings to those who manage it, and can be removed', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(announcing())
    api.announcements.followers.mockResolvedValue({
      followers: [
        {
          webhookId: '701',
          guildId: '900',
          guildName: 'Читатели',
          channelId: '901',
          channelName: 'новости',
          mine: false,
          createdAt: '2026-10-15T10:00:00.000Z',
        },
        {
          webhookId: '702',
          guildId: null,
          guildName: null,
          channelId: null,
          channelName: null,
          mine: false,
          createdAt: '2026-10-15T10:00:00.000Z',
        },
      ],
    })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Настроить канал общий' }))
    const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    await user.click(within(dialog).getByRole('tab', { name: 'Подписчики' }))

    expect(await within(dialog).findByText('Подписано каналов: 2')).toBeVisible()
    const list = within(dialog).getByRole('list', { name: 'Подписчики канала' })
    expect(within(list).getByText('Читатели · #новости')).toBeVisible()
    expect(within(list).getByText('Скрытый сервер')).toBeVisible()
    await user.click(within(list).getByRole('button', { name: 'Убрать подписку: Скрытый сервер' }))
    await waitFor(() => expect(api.announcements.unfollow).toHaveBeenCalledWith('503', '702'))
  })

  it('have no tab in a channel that announces nothing', async () => {
    const { user } = renderApp(GENERAL_URL, { api: createFakeApi({ user: testUser }) })

    await user.click(await screen.findByRole('button', { name: 'Настроить канал общий' }))
    const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    expect(within(dialog).queryByRole('tab', { name: 'Подписчики' })).toBeNull()
  })
})
