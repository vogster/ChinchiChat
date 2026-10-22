import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
  userSignature: null,
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
      people: [{ userId: testFriend.id, verified: true, newDevices: [], keyChanged: false }],
      mine: [],
    })
    await user.click(within(bob).getByRole('button', { name: 'Коды совпали' }))

    expect(e2ee.safety.verify).toHaveBeenCalledWith(testFriend.id)
    expect(await within(bob).findByText('Проверен')).toBeVisible()
  })

  it('shows the code even on a device still waiting to be let in', async () => {
    // The code comes from the people's public keys, not from this device's place in the group.
    const { user } = renderApp(URL_PATH, { api: withEncryptedDm(), e2eeStatus: 'waiting' })

    await user.click(await screen.findByRole('button', { name: 'Проверка шифрования' }))
    const dialog = await screen.findByRole('dialog', { name: 'Проверка шифрования' })
    const bob = await within(dialog).findByRole('group', { name: 'Боб' })
    expect(await within(bob).findByText('11111 22222 33333 44444')).toBeVisible()
  })

  it('asks to let in an unapproved device of the other person, by its code', async () => {
    // No random wait before the background admission (it spreads the members' devices out).
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const { user, e2ee } = renderApp(URL_PATH, { api: withEncryptedDm() })
    e2ee.safety.status.mockResolvedValue({
      people: [
        {
          userId: testFriend.id,
          verified: false,
          newDevices: [device('7', testFriend.id, 'Телефон')],
          keyChanged: false,
        },
      ],
      mine: [],
    })

    const warning = await screen.findByRole('alert', { name: 'Новые устройства' })
    expect(warning).toHaveTextContent('Боб: новое устройство — Телефон')
    // Its code, to compare with Bob by voice before letting it in.
    expect(await within(warning).findByText('48213 90177 35260 11849')).toBeVisible()
    expect(within(warning).queryByRole('button', { name: 'Понятно' })).toBeNull()

    await user.click(
      within(warning).getByRole('button', { name: 'Впустить устройство Телефон — Боб' }),
    )
    await waitFor(() => expect(e2ee.safety.acceptDevice).toHaveBeenCalledWith(testFriend.id, '7'))
    // Bob's other encrypted conversations take the device in too, in the background.
    await waitFor(() =>
      expect(e2ee.admit).toHaveBeenCalledWith(expect.objectContaining({ id: encryptedDm.id })),
    )
    random.mockRestore()
  })

  it('warns about an unapproved device on my own account, without letting it in', async () => {
    const { user, e2ee } = renderApp(URL_PATH, { api: withEncryptedDm() })
    e2ee.safety.status.mockResolvedValue({
      people: [{ userId: testFriend.id, verified: false, newDevices: [], keyChanged: false }],
      mine: [device('8', testUser.id, 'Чужой ноутбук')],
    })

    const warning = await screen.findByRole('alert', { name: 'Новые устройства' })
    expect(warning).toHaveTextContent(
      'В вашей учётной записи неподтверждённое устройство: Чужой ноутбук',
    )
    expect(within(warning).queryByRole('button', { name: /Впустить/ })).toBeNull()
    await user.click(within(warning).getByRole('button', { name: 'Понятно' }))
    await waitFor(() => expect(e2ee.safety.acknowledge).toHaveBeenCalledWith(testUser.id))
  })

  it('warns when the other person reset their keys, and accepts the new key on request', async () => {
    const { user, e2ee } = renderApp(URL_PATH, { api: withEncryptedDm() })
    e2ee.safety.status.mockResolvedValue({
      people: [{ userId: testFriend.id, verified: false, newDevices: [], keyChanged: true }],
      mine: [],
    })

    const warning = await screen.findByRole('alert', { name: 'Новые устройства' })
    expect(warning).toHaveTextContent('Боб сбросил(а) ключи шифрования')
    await user.click(within(warning).getByRole('button', { name: 'Принять новый ключ — Боб' }))
    await waitFor(() => expect(e2ee.safety.acceptKey).toHaveBeenCalledWith(testFriend.id))
  })
})
