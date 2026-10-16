import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testDm, testFriend, testUser } from '../../test/fake-api'
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

const withVoice = () => {
  const api = createFakeApi({ user: testUser })
  api.instance.get.mockResolvedValue({
    instance: {
      name: 'Chinchi',
      registrationMode: 'open',
      uploads: null,
      voice: true,
      requireVerifiedEmail: false,
    },
  })
  api.dms.list.mockResolvedValue({ channels: [testDm, encryptedDm] })
  return api
}

const call = async (user: { click: (element: Element) => Promise<void> }) =>
  user.click(await screen.findByRole('button', { name: 'Позвонить' }))

describe('calls in encrypted conversations', () => {
  it('connect with the conversation key and say the call is encrypted', async () => {
    const { user, e2ee, voice } = renderApp(`/channels/@me/${encryptedDm.id}`, { api: withVoice() })

    await call(user)

    await waitFor(() => expect(voice.room.connect).toHaveBeenCalled())
    expect(e2ee.callKey).toHaveBeenCalledWith({
      id: encryptedDm.id,
      memberIds: [testUser.id, testFriend.id],
    })
    expect(voice.room.connect.mock.calls[0]?.[2].encryption).toEqual({
      epoch: 1,
      key: new Uint8Array(32).fill(1),
    })
    const panel = await screen.findByRole('region', { name: 'Голосовое подключение' })
    expect(panel).toHaveTextContent('Звонок зашифрован')
  })

  it('switch to the new key when the conversation moves on', async () => {
    const { user, e2ee, voice, gateway } = renderApp(`/channels/@me/${encryptedDm.id}`, {
      api: withVoice(),
    })
    await call(user)
    await screen.findByText('Звонок зашифрован')

    const next = { epoch: 2, key: new Uint8Array(32).fill(2) }
    e2ee.callKey.mockResolvedValue(next)
    act(() => gateway.emit('E2EE_HANDSHAKE', { channelId: encryptedDm.id, kind: 'commit' }))

    await waitFor(() => expect(voice.room.setEncryptionKey).toHaveBeenCalledWith(next))
  })

  it('refuse to call from a device not let into the conversation yet', async () => {
    const api = withVoice()
    const { user, voice } = renderApp(`/channels/@me/${encryptedDm.id}`, {
      api,
      e2eeStatus: 'waiting',
    })

    await call(user)

    expect(await screen.findByText(/это устройство ещё не впустили в беседу/)).toBeVisible()
    expect(api.voice.join).not.toHaveBeenCalled()
    expect(voice.room.connect).not.toHaveBeenCalled()
  })

  it('leave plain DM calls unencrypted', async () => {
    const { user, voice } = renderApp(`/channels/@me/${testDm.id}`, { api: withVoice() })

    await call(user)

    await waitFor(() => expect(voice.room.connect).toHaveBeenCalled())
    expect(voice.room.connect.mock.calls[0]?.[2].encryption).toBeUndefined()
    expect(screen.queryByText('Звонок зашифрован')).not.toBeInTheDocument()
  })
})
