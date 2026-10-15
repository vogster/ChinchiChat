import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testHistory, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`

describe('searching a server', () => {
  it('finds messages and shows where they are', async () => {
    const api = createFakeApi({ user: testUser })
    api.search.guild.mockResolvedValue({
      messages: [testMessage('1001', { content: 'Мой кот любит рыбу' })],
      total: 1,
    })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.type(await screen.findByRole('searchbox', { name: 'Поиск' }), 'кот{Enter}')

    const results = await screen.findByRole('complementary', { name: 'Результаты поиска' })
    expect(await within(results).findByText('Найдено: 1')).toBeVisible()
    expect(within(results).getByText('Мой кот любит рыбу')).toBeVisible()
    expect(within(results).getByText('#общий')).toBeVisible()
    expect(api.search.guild).toHaveBeenCalledWith(testGuild.id, { q: 'кот', limit: 25 })
  })

  it('opens from a header button on narrow screens, ready for typing', async () => {
    const { user } = renderApp(GENERAL_URL, { api: createFakeApi({ user: testUser }) })

    await user.click(await screen.findByRole('button', { name: 'Открыть поиск' }))

    expect(screen.getByRole('searchbox', { name: 'Поиск' })).toHaveFocus()
  })

  it('keeps results from age-restricted channels behind their consent', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue({
      guild: {
        ...testGuild,
        channels: testGuild.channels.map((c) => (c.id === '503' ? { ...c, nsfw: true } : c)),
      },
    })
    api.search.guild.mockResolvedValue({
      messages: [testMessage('1001', { content: 'откровенное' })],
      total: 1,
    })
    const { user } = renderApp(`/channels/${testGuild.id}/504`, { api })

    await user.type(await screen.findByRole('searchbox', { name: 'Поиск' }), 'кот{Enter}')

    const results = await screen.findByRole('complementary', { name: 'Результаты поиска' })
    expect(await within(results).findByText(/Сообщение из канала 18\+/)).toBeVisible()
    expect(within(results).queryByText('откровенное')).not.toBeInTheDocument()
  })

  it('turns from:, in: and has: into filters', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.type(
      await screen.findByRole('searchbox', { name: 'Поиск' }),
      'from:bob in:#общий has:image кот{Enter}',
    )

    await waitFor(() =>
      expect(api.search.guild).toHaveBeenCalledWith(testGuild.id, {
        q: 'кот',
        authorId: '200',
        channelId: '503',
        has: 'image',
        limit: 25,
      }),
    )
  })

  it('says when a filter names nobody', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.type(await screen.findByRole('searchbox', { name: 'Поиск' }), 'from:nobody{Enter}')

    expect(await screen.findByText('На сервере нет участника «nobody»')).toBeVisible()
    expect(api.search.guild).not.toHaveBeenCalled()
  })

  it('jumps to a result, loading older history when needed', async () => {
    const api = createFakeApi({ user: testUser })
    const old = testMessage('900', { content: 'старое сообщение про кота' })
    api.search.guild.mockResolvedValue({ messages: [old], total: 1 })
    api.messages.list.mockImplementation(
      async (_channelId: string, query?: { before?: string }) => ({
        messages: query?.before ? [old] : [...testHistory],
      }),
    )
    const { user } = renderApp(GENERAL_URL, { api })

    await user.type(await screen.findByRole('searchbox', { name: 'Поиск' }), 'кот{Enter}')
    const results = await screen.findByRole('complementary', { name: 'Результаты поиска' })
    await user.click(await within(results).findByRole('button', { name: 'Перейти' }))

    await waitFor(() => expect(document.activeElement?.getAttribute('data-message-id')).toBe('900'))
  })
})
