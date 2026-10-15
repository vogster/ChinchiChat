import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testHistory, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const bot = {
  user: {
    id: '900',
    username: 'helper_bot',
    displayName: null,
    avatarUrl: null,
    bot: true as const,
  },
  ownerId: testUser.id,
  public: false,
  createdAt: '2026-10-15T10:00:00.000Z',
}

describe('bots', () => {
  it('are created in the settings, showing the token once, and added to a server', async () => {
    const api = createFakeApi({ user: testUser })
    api.bots.create.mockResolvedValue({ bot, token: 'BOT_TOKEN_BOT_TOKEN' })
    const { user } = renderApp('/settings/bots', { api })

    await user.type(await screen.findByLabelText('Имя бота', { exact: true }), 'helper_bot')
    await user.click(screen.getByRole('button', { name: 'Создать бота' }))
    expect(await screen.findByRole('textbox', { name: 'Токен бота' })).toHaveValue(
      'BOT_TOKEN_BOT_TOKEN',
    )

    const list = screen.getByRole('list', { name: 'Мои боты' })
    await user.selectOptions(
      await within(list).findByLabelText('Добавить helper_bot на сервер', { exact: true }),
      testGuild.id,
    )
    await waitFor(() => expect(api.bots.addToGuild).toHaveBeenCalledWith(testGuild.id, '900'))
  })

  it('are marked in messages', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [...testHistory, testMessage('1010', { author: bot.user, content: 'Я бот' })],
    })
    renderApp(`/channels/${testGuild.id}/503`, { api })

    const row = (await screen.findByText('Я бот')).closest('li') as HTMLElement
    expect(within(row).getByText('Бот')).toBeVisible()
  })
})
