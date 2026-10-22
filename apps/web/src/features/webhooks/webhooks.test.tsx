import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testHistory, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const MEMES_URL = `/channels/${testGuild.id}/504`

describe('webhooks', () => {
  it('show their messages under the webhook name, marked as such', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [
        ...testHistory,
        testMessage('1009', {
          author: null,
          webhook: { id: '700', name: 'CI' },
          content: 'Сборка прошла',
        }),
      ],
    })
    renderApp(MEMES_URL, { api })

    const row = (await screen.findByText('Сборка прошла')).closest('li') as HTMLElement
    expect(within(row).getByText('CI')).toBeVisible()
    expect(within(row).getByText('Вебхук')).toBeVisible()
  })

  it('are created in the channel settings, showing the secret URL once', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(MEMES_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Настроить канал мемы' }))
    const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    await user.click(within(dialog).getByRole('tab', { name: 'Вебхуки' }))
    await user.type(within(dialog).getByLabelText('Название вебхука', { exact: true }), 'Сборки')
    await user.click(within(dialog).getByRole('button', { name: 'Создать вебхук' }))

    await waitFor(() => expect(api.webhooks.create).toHaveBeenCalledWith('504', 'Сборки'))
    const url = await within(dialog).findByRole('textbox', { name: 'Адрес вебхука' })
    expect(url).toHaveValue(
      'https://chat.example.com/api/v1/webhooks/700/SECRET_TOKEN_SECRET_TOKEN',
    )
    const list = within(dialog).getByRole('list', { name: 'Вебхуки канала' })
    await user.click(within(list).getByRole('button', { name: 'Удалить вебхук Сборки' }))
    await waitFor(() => expect(api.webhooks.delete).toHaveBeenCalledWith('700'))
  })

  it('show a follow of an announcement channel as a follow, with where it comes from', async () => {
    const api = createFakeApi({ user: testUser })
    api.webhooks.list.mockResolvedValue({
      webhooks: [
        {
          id: '701',
          guildId: '500',
          channelId: '504',
          name: 'Новости #релизы',
          createdBy: testUser,
          createdAt: '2026-10-15T10:00:00.000Z',
          sourceChannelId: '900',
          sourceGuildId: '901',
        },
      ],
    })
    const { user } = renderApp(MEMES_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Настроить канал мемы' }))
    const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    await user.click(within(dialog).getByRole('tab', { name: 'Вебхуки' }))
    const list = within(dialog).getByRole('list', { name: 'Вебхуки канала' })

    expect(await within(list).findByText('Объявления из Новости #релизы')).toBeVisible()
    expect(
      within(list).getByRole('link', { name: 'Открыть канал Новости #релизы' }),
    ).toHaveAttribute('href', '/channels/901/900')
    expect(within(list).queryByRole('button', { name: /Удалить вебхук/ })).toBeNull()
    await user.click(within(list).getByRole('button', { name: 'Отписаться: Новости #релизы' }))
    await waitFor(() => expect(api.announcements.unfollow).toHaveBeenCalledWith('900', '701'))
  })
})
