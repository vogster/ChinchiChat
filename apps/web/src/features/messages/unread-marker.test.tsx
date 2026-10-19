import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`

/** Read up to "Привет всем!": "Как дела?" from Bob is new. */
const readUpToFirst = () => {
  const api = createFakeApi({ user: testUser })
  api.messages.readStates.mockResolvedValue({
    readStates: [{ channelId: '503', lastReadMessageId: '1001' }],
    mentionCounts: {},
  })
  return api
}

const history = () => screen.findByRole('list', { name: 'Сообщения в #общий' })
const marker = () => screen.queryByRole('separator', { name: 'Новые сообщения' })

describe('unread marker', () => {
  it('marks where the new messages start and says how many there are', async () => {
    renderApp(GENERAL_URL, { api: readUpToFirst() })
    const list = await history()

    const line = await within(list).findByRole('separator', { name: 'Новые сообщения' })
    const next = line.closest('li')?.nextElementSibling as HTMLElement
    expect(within(next).getByText('Как дела?')).toBeVisible()
    expect(screen.getByText('1 новое сообщение')).toBeVisible()
  })

  it('waits for the read state when it arrives after the messages', async () => {
    const api = readUpToFirst()
    api.messages.readStates.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                readStates: [{ channelId: '503', lastReadMessageId: '1001' }],
                mentionCounts: {},
              }),
            100,
          ),
        ),
    )
    renderApp(GENERAL_URL, { api })

    expect(await screen.findByRole('separator', { name: 'Новые сообщения' })).toBeVisible()
    await waitFor(() => expect(api.messages.ack).toHaveBeenCalledWith('503', '1003'))
  })

  it('starts a new group at the marker', async () => {
    const api = readUpToFirst()
    renderApp(GENERAL_URL, { api })
    const line = await screen.findByRole('separator', { name: 'Новые сообщения' })
    const next = line.closest('li')?.nextElementSibling as HTMLElement
    expect(within(next).getAllByRole('button', { name: 'Боб' })[0]).toBeVisible()
  })

  it('can be dismissed', async () => {
    const { user } = renderApp(GENERAL_URL, { api: readUpToFirst() })
    await history()

    await user.click(await screen.findByRole('button', { name: 'Отметить прочитанным' }))
    expect(marker()).toBeNull()
    expect(screen.queryByText('1 новое сообщение')).toBeNull()
  })

  it('jumps to the first new message and hides the banner, keeping the line', async () => {
    const { user } = renderApp(GENERAL_URL, { api: readUpToFirst() })
    await history()

    await user.click(await screen.findByRole('button', { name: 'Перейти к новым сообщениям' }))
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-message-id')).toBe('1002'),
    )

    await waitFor(() => expect(screen.queryByText('1 новое сообщение')).toBeNull())
    expect(marker()).toBeVisible()
  })

  it('shows no banner when the new messages are already on screen', async () => {
    const observed: Element[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe(element: Element) {
          observed.push(element)
          this.callback(
            [{ target: element, isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          )
        }
        disconnect() {}
      },
    )
    try {
      renderApp(GENERAL_URL, { api: readUpToFirst() })
      expect(
        await within(await history()).findByRole('separator', { name: 'Новые сообщения' }),
      ).toBeVisible()

      await waitFor(() => expect(screen.queryByText('1 новое сообщение')).toBeNull())
      expect(observed).toContain(marker())
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('stays where it was while new messages arrive, and goes away once I write', async () => {
    const { gateway } = renderApp(GENERAL_URL, { api: readUpToFirst() })
    await history()
    expect(await screen.findByRole('separator', { name: 'Новые сообщения' })).toBeVisible()

    act(() => gateway.emit('MESSAGE_CREATE', testMessage('1100', { content: 'Ещё одно' })))
    expect(await screen.findByText('Ещё одно')).toBeVisible()
    expect(marker()).not.toBeNull()

    act(() =>
      gateway.emit(
        'MESSAGE_CREATE',
        testMessage('1101', {
          content: 'Мой ответ',
          author: { id: testUser.id, username: 'alice', displayName: null, avatarUrl: null },
        }),
      ),
    )
    await waitFor(() => expect(marker()).toBeNull())
  })

  it('shows nothing in a channel read to the end', async () => {
    renderApp(GENERAL_URL, { user: testUser })
    await screen.findByText('Как дела?')

    expect(marker()).toBeNull()
  })
})

describe('marking a server read', () => {
  it('reads every channel from the server menu', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, gateway } = renderApp(GENERAL_URL, { api })
    await history()
    act(() =>
      gateway.emit('MESSAGE_CREATE', testMessage('1100', { channelId: '504', content: 'В мемах' })),
    )
    const channels = screen.getByRole('navigation', { name: 'Каналы' })
    expect(
      await within(channels).findByRole('link', { name: /мемы \(есть непрочитанные\)/ }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Меню сервера Котики' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Отметить прочитанным' }))

    expect(api.guilds.ack).toHaveBeenCalledWith(testGuild.id)
    expect(await within(channels).findByRole('link', { name: 'мемы' })).toBeVisible()
  })
})

describe('marking a category read', () => {
  it('offers it only when the category has something unread, and reads its channels', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, gateway } = renderApp(GENERAL_URL, { api })
    await history()
    const channels = screen.getByRole('navigation', { name: 'Каналы' })
    const button = () =>
      within(channels).queryByRole('button', {
        name: 'Отметить категорию Текстовые каналы прочитанной',
      })
    expect(button()).toBeNull()

    act(() =>
      gateway.emit('MESSAGE_CREATE', testMessage('1100', { channelId: '504', content: 'В мемах' })),
    )
    expect(
      await within(channels).findByRole('link', { name: /мемы \(есть непрочитанные\)/ }),
    ).toBeVisible()
    await user.click(button() as HTMLElement)

    await waitFor(() => expect(api.messages.ack).toHaveBeenCalledWith('504', '1100'))
    expect(await within(channels).findByRole('link', { name: 'мемы' })).toBeVisible()
    await waitFor(() => expect(button()).toBeNull())
    // Nothing else goes: a channel in another category, or one already read.
    expect(api.guilds.ack).not.toHaveBeenCalled()
  })
})
