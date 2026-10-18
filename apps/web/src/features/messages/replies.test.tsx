import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { openMessageMenu } from '../../test/message-menu'
import { renderApp } from '../../test/render-app'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const BOB = { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: null }

const composer = () => screen.findByRole('textbox', { name: 'Сообщение в #общий' })
const messageRow = (text: string) => screen.getByText(text).closest('li') as HTMLElement

const startReply = async (user: ReturnType<typeof renderApp>['user'], text: string) => {
  await screen.findByText(text)
  await user.hover(messageRow(text))
  await user.click(
    within(await openMessageMenu(messageRow(text))).getByRole('menuitem', { name: 'Ответить' }),
  )
}

describe('replying', () => {
  it('replies to a message, mentioning its author by default', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await startReply(user, 'Как дела?')
    expect(screen.getByText('Ответ для Боб')).toBeVisible()
    await user.type(await composer(), 'Хорошо{Enter}')

    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith('503', {
        content: 'Хорошо',
        nonce: expect.any(String),
        replyTo: '1002',
        replyMention: true,
      }),
    )
    expect(screen.queryByText('Ответ для Боб')).toBeNull()
  })

  it('moves focus to the composer when starting a reply', async () => {
    const { user } = renderApp(CHANNEL_URL, { user: testUser })

    await startReply(user, 'Как дела?')

    expect(await composer()).toHaveFocus()
  })

  it('retries a failed reply as a reply', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.create.mockRejectedValueOnce(new Error('offline'))
    const { user } = renderApp(CHANNEL_URL, { api })

    await startReply(user, 'Как дела?')
    await user.click(screen.getByRole('button', { name: 'Упомянуть автора' }))
    await user.type(await composer(), 'ещё раз{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Повторить' }))

    await waitFor(() => expect(api.messages.create).toHaveBeenCalledTimes(2))
    expect(api.messages.create).toHaveBeenLastCalledWith(
      '503',
      expect.objectContaining({ content: 'ещё раз', replyTo: '1002', replyMention: false }),
    )
  })

  it('can reply without notifying the author', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await startReply(user, 'Как дела?')
    const toggle = screen.getByRole('button', { name: 'Упомянуть автора' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.type(await composer(), 'тихо{Enter}')

    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        '503',
        expect.objectContaining({ replyTo: '1002', replyMention: false }),
      ),
    )
  })

  it('cancels with the button or Escape', async () => {
    const { user } = renderApp(CHANNEL_URL, { user: testUser })

    await startReply(user, 'Как дела?')
    await user.click(screen.getByRole('button', { name: 'Отменить ответ' }))
    expect(screen.queryByText('Ответ для Боб')).toBeNull()

    await startReply(user, 'Как дела?')
    await user.click(await composer())
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Ответ для Боб')).toBeNull()
  })
})

describe('reply headers', () => {
  it('shows what a message answers and jumps to it', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1001', { content: 'Вопрос' }),
        testMessage('1002', {
          content: 'Ответ',
          author: { ...BOB, id: '300', displayName: 'Кэрол' },
          reply: {
            messageId: '1001',
            mentionsAuthor: true,
            message: { author: BOB, content: 'Вопрос\nдлинный', attachmentCount: 0 },
          },
        }),
      ],
    })
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { user } = renderApp(CHANNEL_URL, { api })

    const header = await screen.findByRole('button', {
      name: 'Ответ на сообщение Боб: Вопрос длинный',
    })
    expect(within(header).getByText('Вопрос длинный')).toBeVisible()
    await user.click(header)

    expect(scroll).toHaveBeenCalled()
    expect(scroll.mock.contexts.at(-1)).toHaveAttribute('data-message-id', '1001')
    scroll.mockRestore()
  })

  it('shows server emoji in the snippet by name, not as raw text', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1002', {
          content: 'Ура',
          reply: {
            messageId: '1001',
            mentionsAuthor: false,
            message: { author: BOB, content: 'Вышло <a:shipit:600> вот', attachmentCount: 0 },
          },
        }),
      ],
    })
    renderApp(CHANNEL_URL, { api })

    expect(
      await screen.findByRole('button', { name: 'Ответ на сообщение Боб: Вышло :shipit: вот' }),
    ).toBeVisible()
  })

  it('says when the original is gone or only had files', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1002', {
          content: 'a',
          reply: { messageId: '1', mentionsAuthor: false, message: null },
        }),
        testMessage('1003', {
          content: 'b',
          reply: {
            messageId: '2',
            mentionsAuthor: false,
            message: { author: BOB, content: '', attachmentCount: 2 },
          },
        }),
      ],
    })
    renderApp(CHANNEL_URL, { api })

    expect(await screen.findByText('Исходное сообщение удалено')).toBeVisible()
    expect(screen.getByText('Вложения: 2')).toBeVisible()
  })
})
