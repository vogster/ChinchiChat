import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Poll } from '@chinchi/shared'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const ME = { id: testUser.id, username: testUser.username, displayName: null, avatarUrl: null }
const IN_A_DAY = new Date(Date.now() + 24 * 3_600_000).toISOString()

const poll = (overrides: Partial<Poll> = {}): Poll => ({
  question: 'Куда идём в пятницу?',
  answers: [
    { id: 1, text: 'Кино', count: 1, me: false },
    { id: 2, text: 'Бар', count: 3, me: false },
  ],
  multiple: false,
  expiresAt: IN_A_DAY,
  ended: false,
  voters: 4,
  ...overrides,
})

const withPoll = (value: Poll, mine = false) => {
  const api = createFakeApi({ user: testUser })
  api.messages.list.mockResolvedValue({
    messages: [testMessage('1001', { content: '', poll: value, ...(mine ? { author: ME } : {}) })],
  })
  return api
}

const card = () => screen.getByRole('group', { name: 'Опрос: Куда идём в пятницу?' })

describe('polls', () => {
  it('are created from the composer: question, answers, how long', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Создать опрос' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый опрос' })
    await user.type(within(dialog).getByLabelText('Вопрос', { exact: true }), 'Пицца или суши?')
    await user.type(within(dialog).getByLabelText('Ответ 1', { exact: true }), 'Пицца')
    await user.type(within(dialog).getByLabelText('Ответ 2', { exact: true }), 'Суши')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить ответ' }))
    await user.type(within(dialog).getByLabelText('Ответ 3', { exact: true }), 'И то и другое')
    await user.click(within(dialog).getByRole('switch', { name: 'Несколько ответов' }))
    await user.selectOptions(within(dialog).getByLabelText('Длительность', { exact: true }), '72')
    await user.click(within(dialog).getByRole('button', { name: 'Отправить опрос' }))

    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith('503', {
        content: '',
        poll: {
          question: 'Пицца или суши?',
          answers: ['Пицца', 'Суши', 'И то и другое'],
          multiple: true,
          durationHours: 72,
        },
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('take a vote, then show the results with mine marked', async () => {
    const api = withPoll(poll())
    api.polls.vote.mockResolvedValue({
      poll: poll({
        answers: [
          { id: 1, text: 'Кино', count: 2, me: true },
          { id: 2, text: 'Бар', count: 3, me: false },
        ],
        voters: 5,
      }),
    })
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Куда идём в пятницу?')

    expect(within(card()).getByRole('button', { name: 'Проголосовать' })).toBeDisabled()
    await user.click(within(card()).getByRole('radio', { name: 'Кино' }))
    await user.click(within(card()).getByRole('button', { name: 'Проголосовать' }))

    expect(api.polls.vote).toHaveBeenCalledWith('503', '1001', [1])
    expect(await within(card()).findByRole('meter', { name: /^Кино: 40%/ })).toBeVisible()
    expect(within(card()).getByRole('meter', { name: /^Кино/ })).toHaveAccessibleName(
      'Кино: 40%, 2 голоса, ваш ответ',
    )
    expect(within(card()).getByText(/5 голосов/)).toBeVisible()
  })

  it('follow counts from the gateway, keeping my own vote', async () => {
    const mine = poll({
      answers: [
        { id: 1, text: 'Кино', count: 1, me: true },
        { id: 2, text: 'Бар', count: 3, me: false },
      ],
    })
    const { gateway } = renderApp(CHANNEL_URL, { api: withPoll(mine) })
    await screen.findByText('Куда идём в пятницу?')

    act(() =>
      gateway.emit('POLL_UPDATE', {
        channelId: '503',
        guildId: testGuild.id,
        messageId: '1001',
        poll: poll({
          answers: [
            { id: 1, text: 'Кино', count: 1, me: false },
            { id: 2, text: 'Бар', count: 4, me: false },
          ],
          voters: 5,
        }),
      }),
    )

    expect(await within(card()).findByRole('meter', { name: /^Бар: 80%/ })).toBeVisible()
    expect(within(card()).getByRole('meter', { name: /^Кино/ })).toHaveAccessibleName(/ваш ответ$/)
  })

  it('can be ended early by their author, then take no more votes', async () => {
    const api = withPoll(poll(), true)
    api.polls.end.mockResolvedValue({ poll: poll({ ended: true }) })
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Куда идём в пятницу?')

    await user.click(within(card()).getByRole('button', { name: 'Завершить опрос' }))

    expect(api.polls.end).toHaveBeenCalledWith('503', '1001')
    expect(await within(card()).findByText(/Опрос завершён/)).toBeVisible()
    expect(within(card()).queryByRole('radio')).not.toBeInTheDocument()
    expect(within(card()).getByRole('meter', { name: /^Бар: 75%/ })).toBeVisible()
  })
})
