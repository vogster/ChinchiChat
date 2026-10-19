import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { PrivateChannel } from '@chinchi/shared'

const encryptedDm: PrivateChannel = {
  id: '802',
  type: 'dm',
  name: null,
  ownerId: null,
  recipients: [testFriend],
  lastMessageId: null,
  encrypted: true,
}
const URL = `/channels/@me/${encryptedDm.id}`

const withEncryptedDm = () => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
  api.messages.list.mockResolvedValue({ messages: [] })
  return api
}

const guide = () => screen.findByRole('dialog', { name: 'Как работает шифрование' })

describe('the encryption guide', () => {
  it('walks through how encryption works the first time a conversation opens here', async () => {
    const { user } = renderApp(URL, { api: withEncryptedDm(), encryptionGuide: true })

    const dialog = await guide()
    expect(within(dialog).getByText('Шаг 1 из 5')).toBeVisible()
    expect(within(dialog).getByRole('heading', { name: /Ключи только у вас/ })).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Далее' }))
    expect(within(dialog).getByText('Шаг 2 из 5')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Назад' }))
    expect(within(dialog).getByText('Шаг 1 из 5')).toBeVisible()

    for (let step = 1; step < 5; step += 1) {
      await user.click(within(dialog).getByRole('button', { name: 'Далее' }))
    }
    await user.click(within(dialog).getByRole('button', { name: 'Понятно' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Как работает шифрование' })).toBeNull(),
    )
  })

  it('is not shown again, but opens from the start of the conversation', async () => {
    const first = renderApp(URL, { api: withEncryptedDm(), encryptionGuide: true })
    await first.user.click(within(await guide()).getByRole('button', { name: 'Закрыть' }))
    first.unmount()

    const { user } = renderApp(URL, { api: withEncryptedDm() })
    const how = await screen.findByRole('button', { name: 'Как это работает' })
    expect(screen.queryByRole('dialog', { name: 'Как работает шифрование' })).toBeNull()
    await user.click(how)
    expect(await guide()).toBeVisible()
  })

  it('comes before the request to save the recovery key', async () => {
    const { user, e2ee } = renderApp(URL, { api: withEncryptedDm(), encryptionGuide: true })
    e2ee.recovery.saved.mockResolvedValue(false)

    const dialog = await guide()
    expect(screen.queryByRole('dialog', { name: 'Сохраните ключ восстановления' })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))

    expect(
      await screen.findByRole('dialog', { name: 'Сохраните ключ восстановления' }),
    ).toBeVisible()
  })
})
