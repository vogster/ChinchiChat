import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createFakeApi, testDm, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { VoiceState } from '@chinchi/shared'

const DM_URL = `/channels/@me/${testDm.id}`

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
  return api
}

const inCall = (userId: string, channelId: string | null = testDm.id): VoiceState => ({
  guildId: null,
  channelId,
  userId,
  selfMute: false,
  selfDeaf: false,
  serverMute: false,
  serverDeaf: false,
  video: false,
  stream: false,
})

const ringtone = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))
vi.mock('./ringtone', () => ({ createRingtone: () => ringtone }))

const incoming = () => screen.queryByRole('alertdialog', { name: 'Входящий звонок' })

describe('calls in DMs', () => {
  it('starts a call from the DM header', async () => {
    const api = withVoice()
    const { user } = renderApp(DM_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Позвонить' }))

    expect(api.voice.join).toHaveBeenCalledWith(testDm.id, { selfMute: false, selfDeaf: false })
    const panel = await screen.findByRole('region', { name: 'Голосовое подключение' })
    await waitFor(() => expect(panel).toHaveTextContent('Боб'))
  })

  it('shows who is in the call and lets the user join it', async () => {
    const api = withVoice()
    const { user, gateway } = renderApp(DM_URL, { api })
    await screen.findByRole('button', { name: 'Позвонить' })

    gateway.emit('VOICE_STATE_UPDATE', inCall('200'))

    const stage = await screen.findByRole('list', { name: 'Участники звонка' })
    expect(await within(stage).findByText('Боб')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Присоединиться к звонку' }))
    expect(api.voice.join).toHaveBeenCalledWith(testDm.id, { selfMute: false, selfDeaf: false })
  })

  it('does not ring for a call the user just hung up on', async () => {
    const { user, gateway } = renderApp(DM_URL, { api: withVoice() })
    await user.click(await screen.findByRole('button', { name: 'Позвонить' }))
    gateway.emit('VOICE_STATE_UPDATE', inCall('200'))
    gateway.emit('VOICE_STATE_UPDATE', inCall(testUser.id))

    const dock = await screen.findByRole('region', { name: 'Управление звонком' })
    await user.click(within(dock).getByRole('button', { name: 'Отключиться' }))
    gateway.emit('VOICE_STATE_UPDATE', inCall(testUser.id, null))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(incoming()).not.toBeInTheDocument()
  })

  it('rings when someone calls, and can be answered or declined', async () => {
    const api = withVoice()
    const { user, gateway } = renderApp('/', { api })
    await screen.findByRole('heading', { name: 'Друзья', level: 1 })

    gateway.emit('VOICE_STATE_UPDATE', inCall('200'))
    const ringing = await screen.findByRole('alertdialog', { name: 'Входящий звонок' })
    expect(ringing).toHaveTextContent('Боб звонит')
    expect(ringtone.start).toHaveBeenCalled()

    await user.click(within(ringing).getByRole('button', { name: 'Отклонить' }))
    expect(incoming()).not.toBeInTheDocument()
    expect(ringtone.stop).toHaveBeenCalled()
    // The same call stays quiet after a decline...
    gateway.emit('VOICE_STATE_UPDATE', { ...inCall('200'), selfMute: true })
    expect(incoming()).not.toBeInTheDocument()

    // ...but a new one rings again.
    gateway.emit('VOICE_STATE_UPDATE', inCall('200', null))
    gateway.emit('VOICE_STATE_UPDATE', inCall('200'))
    const again = await screen.findByRole('alertdialog', { name: 'Входящий звонок' })
    await user.click(within(again).getByRole('button', { name: 'Принять' }))

    expect(api.voice.join).toHaveBeenCalledWith(testDm.id, { selfMute: false, selfDeaf: false })
    await waitFor(() => expect(incoming()).not.toBeInTheDocument())
  })
})
