import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testGuild, testMessage, testUser } from '../../test/fake-api'
import { fakeCiphertext } from '../../test/fake-e2ee'
import { renderApp } from '../../test/render-app'

import type { PrivateChannel } from '@chinchi/shared'

const encryptedDm: PrivateChannel = {
  id: '802',
  type: 'dm',
  name: null,
  ownerId: null,
  recipients: [testFriend],
  lastMessageId: '1301',
  encrypted: true,
}
const URL = `/channels/@me/${encryptedDm.id}`

const withEncryptedDm = () => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
  api.messages.list.mockImplementation(async () => ({
    messages: [
      testMessage('1300', {
        channelId: encryptedDm.id,
        guildId: null,
        content: '',
        ciphertext: 'AAAA',
      }),
      testMessage('1301', {
        channelId: encryptedDm.id,
        guildId: null,
        content: '',
        ciphertext: fakeCiphertext('Секретная встреча в пятницу'),
      }),
    ],
  }))
  return api
}

describe('encrypted conversations', () => {
  it('start from a profile card', async () => {
    const api = createFakeApi({ user: testUser })
    api.dms.open.mockResolvedValue({ channel: encryptedDm })
    const { user, router } = renderApp(`/channels/${testGuild.id}/503`, { api })

    const members = await screen.findByRole('complementary', { name: /Участники/ })
    await user.click(await within(members).findByRole('button', { name: /^Боб,/ }))
    const card = await screen.findByRole('dialog', { name: 'Профиль: Боб' })
    await user.click(within(card).getByRole('button', { name: 'Зашифрованная беседа' }))

    expect(api.dms.open).toHaveBeenCalledWith(['200'], { encrypted: true })
    await waitFor(() => expect(router.state.location.pathname).toBe(URL))
  })

  it('show decrypted messages, say what this device cannot read, and say what is off', async () => {
    const { e2ee } = renderApp(URL, { api: withEncryptedDm() })

    expect(await screen.findByText('Секретная встреча в пятницу')).toBeVisible()
    expect(screen.getByText('Сообщение недоступно на этом устройстве')).toBeVisible()
    expect(screen.getByText(/Сервер не видит сообщений/)).toBeVisible()
    expect(e2ee.open).toHaveBeenCalledWith({ id: encryptedDm.id, memberIds: [testUser.id, '200'] })
  })

  it('send through encryption', async () => {
    const api = withEncryptedDm()
    const { user, e2ee, gateway } = renderApp(URL, { api })

    const composer = await screen.findByRole('textbox', { name: 'Написать @Боб' })
    await user.type(composer, 'Только для нас{Enter}')

    await waitFor(() =>
      expect(e2ee.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: encryptedDm.id }),
        'Только для нас',
        { nonce: expect.any(String), files: [] },
      ),
    )
    const [, , { nonce }] = e2ee.send.mock.calls[0] as unknown as [
      unknown,
      string,
      { nonce: string },
    ]
    act(() =>
      gateway.emit(
        'MESSAGE_CREATE',
        testMessage('1400', {
          channelId: encryptedDm.id,
          guildId: null,
          content: '',
          ciphertext: fakeCiphertext('Только для нас'),
          nonce,
          author: { id: testUser.id, username: 'alice', displayName: null, avatarUrl: null },
        }),
      ),
    )
    expect(await screen.findByText('Только для нас')).toBeVisible()
    expect(api.messages.create).not.toHaveBeenCalledWith(
      encryptedDm.id,
      expect.objectContaining({ content: 'Только для нас' }),
    )
  })

  it('wait until another device lets this one in', async () => {
    const { e2ee } = renderApp(URL, { api: withEncryptedDm(), e2eeStatus: 'waiting' })

    expect(
      await screen.findByText(
        /Ждём, пока другое ваше устройство или собеседник впустит это устройство/,
      ),
    ).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Написать @Боб' })).toBeNull()
    expect(e2ee.open).toHaveBeenCalled()
  })

  it('are marked in the DM list', async () => {
    renderApp('/', { api: withEncryptedDm() })

    const list = await screen.findByRole('complementary', { name: 'Личные сообщения' })
    expect(
      await within(list).findByRole('link', { name: /^Боб.*зашифрованная беседа/ }),
    ).toBeVisible()
  })
})

describe('editing and replying in encrypted conversations', () => {
  const ME = { id: testUser.id, username: 'alice', displayName: null, avatarUrl: null }
  const withHistory = () => {
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
    const base = { channelId: encryptedDm.id, guildId: null, content: '' }
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1301', { ...base, ciphertext: fakeCiphertext('Секретная встреча в пятницу') }),
        testMessage('1302', { ...base, author: ME, ciphertext: fakeCiphertext('Мой текст') }),
        testMessage('1303', {
          ...base,
          ciphertext: fakeCiphertext('Напоминаю'),
          // The server keeps the link only: it has no text to quote.
          reply: {
            messageId: '1301',
            mentionsAuthor: true,
            message: { author: testFriend, content: '', attachmentCount: 0 },
          },
        }),
      ],
    })
    return api
  }
  const messageRow = (text: string) => screen.getAllByText(text)[0]?.closest('li') as HTMLElement

  it('edit through encryption', async () => {
    const { user, e2ee } = renderApp(URL, { api: withHistory() })
    await screen.findByText('Мой текст')

    await user.click(screen.getByRole('textbox', { name: 'Написать @Боб' }))
    await user.keyboard('{ArrowUp}')
    const box = screen.getByRole('textbox', { name: 'Изменить сообщение' })
    expect(box).toHaveValue('Мой текст')
    await user.clear(box)
    await user.type(box, 'Новый текст{Enter}')

    await waitFor(() =>
      expect(e2ee.edit).toHaveBeenCalledWith(
        expect.objectContaining({ id: encryptedDm.id }),
        '1302',
        'Новый текст',
      ),
    )
  })

  it('reply through encryption and quote the decrypted text', async () => {
    const { user, e2ee } = renderApp(URL, { api: withHistory() })
    await screen.findByText('Напоминаю')
    // The quote above the reply shows what the original says, decrypted here.
    expect(screen.getAllByText('Секретная встреча в пятницу')).toHaveLength(2)

    await user.hover(messageRow('Мой текст'))
    await user.click(within(messageRow('Мой текст')).getByRole('button', { name: 'Ответить' }))
    await user.type(screen.getByRole('textbox', { name: 'Написать @Боб' }), 'Ок{Enter}')

    await waitFor(() =>
      expect(e2ee.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: encryptedDm.id }),
        'Ок',
        expect.objectContaining({ reply: { messageId: '1302', mention: true } }),
      ),
    )
  })
})
