import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { apiError, createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const row = (text: string) => screen.getByText(text).closest('li') as HTMLElement

describe('pinning', () => {
  it('lets moderators pin and unpin from the toolbar', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, gateway } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Как дела?')

    await user.hover(row('Как дела?'))
    await user.click(within(row('Как дела?')).getByRole('button', { name: 'Закрепить' }))
    await waitFor(() => expect(api.pins.pin).toHaveBeenCalledWith('503', '1002'))

    act(() =>
      gateway.emit('MESSAGE_UPDATE', testMessage('1002', { content: 'Как дела?', pinned: true })),
    )
    expect(await within(row('Как дела?')).findByLabelText('Закреплено')).toBeVisible()

    await user.hover(row('Как дела?'))
    await user.click(within(row('Как дела?')).getByRole('button', { name: 'Открепить' }))
    await waitFor(() => expect(api.pins.unpin).toHaveBeenCalledWith('503', '1002'))
  })

  it('says why pinning failed', async () => {
    const api = createFakeApi({ user: testUser })
    api.pins.pin.mockRejectedValueOnce(apiError(400, 'TOO_MANY_PINS'))
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Как дела?')

    await user.hover(row('Как дела?'))
    await user.click(within(row('Как дела?')).getByRole('button', { name: 'Закрепить' }))

    expect(
      await screen.findByText('В канале уже слишком много закреплённых сообщений.'),
    ).toBeVisible()
  })

  it('does not offer pinning to regular members', async () => {
    renderApp(CHANNEL_URL, { user: { ...testUser, id: '999', username: 'carol' } })
    await screen.findByText('Как дела?')

    expect(within(row('Как дела?')).queryByRole('button', { name: 'Закрепить' })).toBeNull()
  })
})

describe('pins panel', () => {
  it('lists pinned messages and jumps to one', async () => {
    const api = createFakeApi({ user: testUser })
    api.pins.list.mockResolvedValue({
      messages: [testMessage('1001', { content: 'Привет всем!', pinned: true })],
    })
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Как дела?')

    await user.click(screen.getByRole('button', { name: 'Закреплённые сообщения' }))
    const panel = await screen.findByRole('dialog', { name: 'Закреплённые сообщения' })
    expect(await within(panel).findByText('Привет всем!')).toBeVisible()

    await user.click(within(panel).getByRole('button', { name: 'Перейти' }))
    expect(scroll.mock.contexts.at(-1)).toHaveAttribute('data-message-id', '1001')
    expect(document.querySelector('[data-message-id="1001"]')).toHaveFocus()
    scroll.mockRestore()
  })

  it('keeps the panel open when the pinned message is not loaded', async () => {
    const api = createFakeApi({ user: testUser })
    api.pins.list.mockResolvedValue({
      messages: [testMessage('42', { content: 'Очень старое', pinned: true })],
    })
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Как дела?')

    await user.click(screen.getByRole('button', { name: 'Закреплённые сообщения' }))
    const panel = await screen.findByRole('dialog', { name: 'Закреплённые сообщения' })
    await user.click(await within(panel).findByRole('button', { name: 'Перейти' }))

    expect(
      within(panel).getByText('Это сообщение не загружено — прокрутите историю выше.'),
    ).toBeVisible()
  })

  it('drops deleted messages from the open panel', async () => {
    const api = createFakeApi({ user: testUser })
    api.pins.list.mockResolvedValue({
      messages: [testMessage('1001', { content: 'Привет всем!', pinned: true })],
    })
    const { user, gateway } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Как дела?')
    await user.click(screen.getByRole('button', { name: 'Закреплённые сообщения' }))
    const panel = await screen.findByRole('dialog', { name: 'Закреплённые сообщения' })
    await within(panel).findByText('Привет всем!')

    api.pins.list.mockResolvedValue({ messages: [] })
    act(() =>
      gateway.emit('MESSAGE_DELETE', { id: '1001', channelId: '503', guildId: testGuild.id }),
    )

    expect(await within(panel).findByText('В этом канале пока ничего не закреплено.')).toBeVisible()
  })

  it('says when nothing is pinned and refreshes when pins change', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, gateway } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Как дела?')

    await user.click(screen.getByRole('button', { name: 'Закреплённые сообщения' }))
    expect(await screen.findByText('В этом канале пока ничего не закреплено.')).toBeVisible()

    api.pins.list.mockResolvedValue({
      messages: [testMessage('1002', { content: 'Как дела?', pinned: true })],
    })
    act(() =>
      gateway.emit('MESSAGE_UPDATE', testMessage('1002', { content: 'Как дела?', pinned: true })),
    )

    const panel = screen.getByRole('dialog', { name: 'Закреплённые сообщения' })
    expect(await within(panel).findByText('Как дела?')).toBeVisible()
  })
})
