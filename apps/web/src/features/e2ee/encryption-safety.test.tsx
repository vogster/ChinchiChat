import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Device, PrivateChannel } from '@chinchi/shared'

const encryptedDm: PrivateChannel = {
  id: '802',
  type: 'dm',
  name: null,
  ownerId: null,
  recipients: [testFriend],
  lastMessageId: null,
  encrypted: true,
}
const URL_PATH = `/channels/@me/${encryptedDm.id}`
const device = (id: string, userId: string, name: string): Device => ({
  id,
  userId,
  name,
  signaturePublicKey: 'a2V5',
  createdAt: '2026-10-16T10:00:00.000Z',
  revokedAt: null,
})
const withEncryptedDm = () => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
  return api
}

describe('checking who is on the other end', () => {
  it('shows the safety code to compare, and remembers a match', async () => {
    const { user, e2ee } = renderApp(URL_PATH, { api: withEncryptedDm() })

    await user.click(await screen.findByRole('button', { name: 'Проверка шифрования' }))
    const dialog = await screen.findByRole('dialog', { name: 'Проверка шифрования' })
    const bob = within(dialog).getByRole('group', { name: 'Боб' })
    expect(await within(bob).findByText('11111 22222 33333 44444')).toBeVisible()
    expect(within(bob).getByText('Не проверен')).toBeVisible()

    e2ee.safety.status.mockResolvedValue({
      people: [{ userId: testFriend.id, verified: true, newDevices: [] }],
      mine: [],
    })
    await user.click(within(bob).getByRole('button', { name: 'Коды совпали' }))

    expect(e2ee.safety.verify).toHaveBeenCalledWith(testFriend.id)
    expect(await within(bob).findByText('Проверен')).toBeVisible()
  })

  it('warns about a new device of the other person until acknowledged', async () => {
    const { user, e2ee } = renderApp(URL_PATH, { api: withEncryptedDm() })
    e2ee.safety.status.mockResolvedValue({
      people: [
        {
          userId: testFriend.id,
          verified: false,
          newDevices: [device('7', testFriend.id, 'Телефон')],
        },
      ],
      mine: [],
    })

    const warning = await screen.findByRole('alert', { name: 'Новые устройства' })
    expect(warning).toHaveTextContent('У Боб новое устройство: Телефон')

    await user.click(within(warning).getByRole('button', { name: 'Понятно' }))
    await waitFor(() => expect(e2ee.safety.acknowledge).toHaveBeenCalledWith(testFriend.id))
  })

  it('warns about a new device on my own account', async () => {
    const { e2ee } = renderApp(URL_PATH, { api: withEncryptedDm() })
    e2ee.safety.status.mockResolvedValue({
      people: [{ userId: testFriend.id, verified: false, newDevices: [] }],
      mine: [device('8', testUser.id, 'Чужой ноутбук')],
    })

    expect(await screen.findByRole('alert', { name: 'Новые устройства' })).toHaveTextContent(
      'В вашей учётной записи новое устройство: Чужой ноутбук',
    )
  })
})
