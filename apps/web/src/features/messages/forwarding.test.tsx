import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  createFakeApi,
  testDm,
  testFriend,
  testGuild,
  testMessage,
  testUser,
} from '../../test/fake-api'
import { openMessageMenu } from '../../test/message-menu'
import { renderApp } from '../../test/render-app'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const row = (text: string) => screen.getByText(text).closest('li') as HTMLElement

describe('forwarding', () => {
  it('sends a message on to a channel or DM picked from the list, with a comment', async () => {
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [testDm] })
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Как дела?')

    await user.hover(row('Как дела?'))
    await user.click(
      within(await openMessageMenu(row('Как дела?'))).getByRole('menuitem', { name: 'Переслать' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Переслать сообщение' })
    expect(await within(dialog).findByRole('radio', { name: /Боб/ })).toBeVisible()
    await user.type(within(dialog).getByRole('searchbox', { name: 'Поиск' }), 'мем')
    expect(within(dialog).queryByRole('radio', { name: /Боб/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: /мемы/ }))
    await user.type(within(dialog).getByLabelText('Комментарий', { exact: true }), 'Смотри')
    await user.click(within(dialog).getByRole('button', { name: 'Переслать' }))

    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith('504', {
        content: 'Смотри',
        forward: { channelId: '503', messageId: '1002' },
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a forwarded message with its original author', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1001', {
          content: '',
          forward: {
            channelId: '600',
            guildId: null,
            messageId: '900',
            author: testFriend,
            content: 'Оригинальный текст',
            createdAt: '2026-10-13T12:00:00.000Z',
          },
        }),
      ],
    })
    renderApp(CHANNEL_URL, { api })

    const block = await screen.findByRole('group', { name: 'Пересланное сообщение' })
    expect(block).toHaveTextContent('Оригинальный текст')
    expect(block).toHaveTextContent(testFriend.displayName as string)
  })

  it('is not offered for messages of an encrypted conversation', async () => {
    const api = createFakeApi({ user: testUser })
    const encrypted = { ...testDm, id: '802', encrypted: true }
    api.dms.list.mockResolvedValue({ channels: [encrypted] })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1301', {
          channelId: '802',
          guildId: null,
          content: '',
          ciphertext: 'eyJ2IjoxLCJ0ZXh0Ijoi0KHQtdC60YDQtdGCIn0=',
        }),
      ],
    })
    const { user } = renderApp('/channels/@me/802', { api })
    const message = (await screen.findByText('Секрет')).closest('li') as HTMLElement

    await user.hover(message)
    expect(within(message).queryByRole('button', { name: 'Переслать' })).not.toBeInTheDocument()
  })
})
