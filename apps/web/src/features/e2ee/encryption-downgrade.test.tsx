import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { PrivateChannel } from '@chinchi/shared'

const dm = (encrypted: boolean): PrivateChannel => ({
  id: '802',
  type: 'dm',
  name: null,
  ownerId: null,
  recipients: [testFriend],
  lastMessageId: null,
  encrypted,
})
const URL_PATH = '/channels/@me/802'

const withDm = (encrypted: boolean) => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels: [dm(encrypted)] })
  return api
}

describe('a conversation the server stops calling encrypted', () => {
  it('is remembered as encrypted on this device while it is', async () => {
    const { e2ee } = renderApp(URL_PATH, { api: withDm(true) })

    await waitFor(() => expect(e2ee.conversations.remember).toHaveBeenCalledWith('802'))
  })

  it('takes no plaintext from this device once the server says it is not encrypted', async () => {
    const { e2ee } = renderApp(URL_PATH, { api: withDm(false) })
    e2ee.conversations.wasEncrypted.mockResolvedValue(true)

    const alert = await screen.findByRole('alert', {
      name: 'Шифрование беседы выключено сервером',
    })
    expect(alert).toHaveTextContent('Отправка остановлена')
    // Nobody needs to worry about what was written before: it stays encrypted.
    expect(alert).toHaveTextContent('Вся переписка до этого момента осталась зашифрованной')
    expect(screen.queryByRole('textbox', { name: /^Написать/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Позвонить/ })).not.toBeInTheDocument()
  })

  it('can be taken off the list and wiped from this device, since nothing can be sent in it', async () => {
    const api = withDm(false)
    const { e2ee, user, router } = renderApp(URL_PATH, { api })
    e2ee.conversations.wasEncrypted.mockResolvedValue(true)

    const alert = await screen.findByRole('alert', {
      name: 'Шифрование беседы выключено сервером',
    })
    await user.click(within(alert).getByRole('button', { name: 'Убрать беседу' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Убрать беседу с этого устройства?',
    })
    // The server calls it plain: it won't delete it for the other side, so it is only hidden.
    expect(dialog).toHaveTextContent('У собеседника она останется')
    await user.click(within(dialog).getByRole('button', { name: 'Убрать' }))

    await waitFor(() => expect(api.dms.hide).toHaveBeenCalledWith('802'))
    expect(e2ee.forgetConversation).toHaveBeenCalledWith('802')
    expect(api.channels.delete).not.toHaveBeenCalled()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('stays an ordinary chat when it never was encrypted here', async () => {
    renderApp(URL_PATH, { api: withDm(false) })

    expect(await screen.findByRole('textbox', { name: /^Написать/ })).toBeVisible()
    expect(
      screen.queryByRole('alert', { name: 'Шифрование беседы выключено сервером' }),
    ).not.toBeInTheDocument()
  })
})
