import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  createFakeApi,
  testGuild,
  testHistory,
  testMessage,
  testThread,
  testUser,
} from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const messageRow = (text: string) => screen.getByText(text).closest('li') as HTMLElement

const withThread = () => {
  const api = createFakeApi({ user: testUser })
  api.guilds.get.mockResolvedValue({
    guild: { ...testGuild, channels: [...testGuild.channels, testThread] },
  })
  // The thread has its own history.
  api.messages.list.mockImplementation(async (channelId: string) => ({
    messages:
      channelId === testThread.id
        ? [testMessage('7000', { channelId, content: 'Выпускаем в пятницу' })]
        : [...testHistory],
  }))
  return api
}

const threadPanel = () => screen.findByRole('complementary', { name: 'Тред «Релиз»' })

describe('threads', () => {
  it('open beside their channel from the starter message', async () => {
    const api = withThread()
    const { user, router } = renderApp(GENERAL_URL, { api })

    await screen.findByText('Как дела?')
    await user.click(
      within(messageRow('Как дела?')).getByRole('link', { name: 'Тред «Релиз» — 3 сообщения' }),
    )

    const panel = await threadPanel()
    expect(router.state.location.pathname).toBe(GENERAL_URL)
    expect(await within(panel).findByText('Выпускаем в пятницу')).toBeVisible()
    // The channel stays open next to it.
    expect(screen.getByRole('heading', { name: 'общий', level: 1 })).toBeVisible()

    await user.type(within(panel).getByRole('textbox', { name: 'Сообщение в #Релиз' }), 'Ок{Enter}')
    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        testThread.id,
        expect.objectContaining({ content: 'Ок' }),
      ),
    )

    await user.click(within(panel).getByRole('button', { name: 'Закрыть тред' }))
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Тред «Релиз»' })).toBeNull(),
    )
  })

  it('are listed from the channel header', async () => {
    const api = withThread()
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Треды' }))
    const list = await screen.findByRole('complementary', { name: 'Треды в #общий' })
    await user.click(within(list).getByRole('link', { name: 'Тред «Релиз» — 3 сообщения' }))

    expect(await within(await threadPanel()).findByText('Выпускаем в пятницу')).toBeVisible()
  })

  it('say when a channel has none yet', async () => {
    const { user } = renderApp(GENERAL_URL, { user: testUser })

    await user.click(await screen.findByRole('button', { name: 'Треды' }))
    const list = await screen.findByRole('complementary', { name: 'Треды в #общий' })
    expect(
      within(list).getByText('Тредов пока нет. Начните тред из любого сообщения.'),
    ).toBeVisible()
  })

  it('show under their channel and open in full', async () => {
    const api = withThread()
    const { user, router } = renderApp(`${GENERAL_URL}?thread=${testThread.id}`, { api })

    const nav = await screen.findByRole('navigation', { name: 'Каналы' })
    expect(within(nav).getByRole('link', { name: 'Релиз' })).toBeVisible()

    await user.click(
      within(await threadPanel()).getByRole('link', { name: 'Открыть тред целиком' }),
    )

    expect(await screen.findByRole('heading', { name: 'Релиз', level: 1 })).toBeVisible()
    expect(router.state.location.pathname).toBe(`/channels/${testGuild.id}/520`)
    expect(screen.getByRole('link', { name: 'Вернуться в #общий' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Сообщение в #Релиз' })).toBeVisible()
  })

  it('count their messages from the gateway', async () => {
    const api = withThread()
    const { gateway } = renderApp(GENERAL_URL, { api })
    await screen.findByText('Как дела?')

    gateway.emit('MESSAGE_CREATE', {
      ...testHistory[0],
      id: '7001',
      channelId: testThread.id,
      guildId: testGuild.id,
    })

    expect(
      await within(messageRow('Как дела?')).findByRole('link', {
        name: 'Тред «Релиз» — 4 сообщения',
      }),
    ).toBeVisible()
  })

  it('start from a message and open', async () => {
    const api = createFakeApi({ user: testUser })
    api.channels.createThread.mockImplementation(async () => {
      // From now on the server lists the new thread too.
      api.guilds.get.mockResolvedValue({
        guild: { ...testGuild, channels: [...testGuild.channels, testThread] },
      })
      return { channel: testThread }
    })
    const { user, router } = renderApp(GENERAL_URL, { api })

    await screen.findByText('Как дела?')
    await user.click(within(messageRow('Как дела?')).getByRole('button', { name: 'Создать тред' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый тред' })
    const name = within(dialog).getByLabelText('Название треда', { exact: true })
    expect(name).toHaveValue('Как дела?')
    await user.clear(name)
    await user.type(name, 'Релиз')
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))

    await waitFor(() =>
      expect(api.channels.createThread).toHaveBeenCalledWith('503', {
        name: 'Релиз',
        messageId: '1002',
      }),
    )
    expect(await threadPanel()).toBeVisible()
    // Ids stay plain strings in the URL (no JSON quoting, no loss of precision).
    expect(router.state.location.searchStr).toBe('?thread=520')
  })
})
