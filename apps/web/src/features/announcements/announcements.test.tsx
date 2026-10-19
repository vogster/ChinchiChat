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

    // Following is a labelled button in the header, not a bare icon.
    expect(await screen.findByRole('button', { name: 'Подписаться на канал' })).toHaveTextContent(
      'Подписаться',
    )
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

  it('are followed into a channel of another server', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(announcing())
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Подписаться на канал' }))
    const dialog = await screen.findByRole('dialog', { name: 'Подписка на #общий' })
    await user.selectOptions(within(dialog).getByLabelText('Сервер', { exact: true }), '500')
    await user.selectOptions(await within(dialog).findByLabelText('Канал', { exact: true }), '504')
    await user.click(within(dialog).getByRole('button', { name: 'Подписаться' }))

    await waitFor(() => expect(api.announcements.follow).toHaveBeenCalledWith('503', '504'))
    expect(await screen.findByText(/Готово/)).toBeVisible()
  })
})
