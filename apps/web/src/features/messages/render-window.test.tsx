import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'
import { jumpToMessage } from './jump-to-message'

import type { Message } from '@chinchi/shared'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const TOTAL = 200
const PAGE = 50

/** 200 messages on one day, oldest first, one minute apart, served 50 at a time. */
const history: Message[] = Array.from({ length: TOTAL }, (_, i) =>
  testMessage(String(10_000 + i), {
    content: `Сообщение номер ${i}`,
    createdAt: new Date(Date.UTC(2026, 9, 14, 8, 0) + i * 60_000).toISOString(),
  }),
)

const setup = () => {
  const api = createFakeApi({ user: testUser })
  api.messages.list.mockImplementation(async (_channelId, query) => {
    const end = query?.before ? history.findIndex((m) => m.id === query.before) : TOTAL
    return { messages: history.slice(Math.max(end - PAGE, 0), end) }
  })
  return { ...renderApp(CHANNEL_URL, { api }), api }
}

const rendered = () => document.querySelectorAll('[data-message-id]').length
const showOlder = () => screen.getByRole('button', { name: 'Показать более ранние сообщения' })

/** Scrolls up until the whole history is in memory (four pages). */
const loadEverything = async ({ user, api }: ReturnType<typeof setup>) => {
  await screen.findByText('Сообщение номер 199')
  while (api.messages.list.mock.calls.length < TOTAL / PAGE) {
    const calls = api.messages.list.mock.calls.length
    await user.click(showOlder())
    await waitFor(() => expect(showOlder()).toBeEnabled())
    if (api.messages.list.mock.calls.length === calls) continue
    await waitFor(() => expect(api.messages.list.mock.results.at(-1)?.type).toBe('return'))
  }
}

/** The reader scrolls back down to the newest messages. */
const backToBottom = () => {
  const scroller = screen
    .getByRole('list', { name: 'Сообщения в #общий' })
    .closest('.overflow-y-auto') as HTMLElement
  scroller.scrollTop = 0
  fireEvent.scroll(scroller)
}

/** Shows rows already in memory until the oldest message is in the page. */
const showAll = async (user: ReturnType<typeof setup>['user']) => {
  while (!screen.queryByText('Сообщение номер 0')) await user.click(showOlder())
}

// Renders a couple of hundred messages several times: slow in jsdom, slower under coverage.
describe('message render window', { timeout: 60_000 }, () => {
  it('shows each loaded page as the reader scrolls up', async () => {
    const app = setup()
    await loadEverything(app)
    expect(screen.getByText('Сообщение номер 0')).toBeInTheDocument()
  })

  it('keeps only the newest messages in the page while older ones stay in memory', async () => {
    const app = setup()
    await loadEverything(app)
    backToBottom()
    await waitFor(() => expect(rendered()).toBeLessThanOrEqual(150))

    expect(screen.getByText('Сообщение номер 199')).toBeInTheDocument()
    expect(screen.queryByText('Сообщение номер 0')).toBeNull()

    // Older messages already loaded come back without another request.
    await showAll(app.user)
    expect(app.api.messages.list).toHaveBeenCalledTimes(4)
  })

  it('shrinks back once the reader returns to the newest messages', async () => {
    const app = setup()
    await loadEverything(app)
    await showAll(app.user)
    backToBottom()

    await waitFor(() => expect(screen.queryByText('Сообщение номер 0')).toBeNull())
    expect(rendered()).toBeLessThanOrEqual(150)
  })

  it('renders a loaded message outside the window when something jumps to it', async () => {
    const app = setup()
    await loadEverything(app)
    backToBottom()
    await waitFor(() => expect(screen.queryByText('Сообщение номер 0')).toBeNull())

    expect(jumpToMessage('10000')).toBe(false)
    expect(await screen.findByText('Сообщение номер 0')).toBeInTheDocument()
  })
})
