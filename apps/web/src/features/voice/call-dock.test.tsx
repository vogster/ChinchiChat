import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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

const inCall = (userId: string): VoiceState => ({
  guildId: null,
  channelId: testDm.id,
  userId,
  selfMute: false,
  selfDeaf: false,
  serverMute: false,
  serverDeaf: false,
  video: false,
  stream: false,
})

const dock = () => screen.findByRole('region', { name: 'Управление звонком' })
const call = () => screen.findByRole('region', { name: 'Звонок' })

describe('a call in a DM', () => {
  it('says it is calling until the other person picks up, then counts the time', async () => {
    const { user, gateway } = renderApp(DM_URL, { api: withVoice() })
    await user.click(await screen.findByRole('button', { name: 'Позвонить' }))

    expect(await within(await call()).findByText('Вызываем…')).toBeVisible()

    act(() => {
      gateway.emit('VOICE_STATE_UPDATE', inCall(testUser.id))
      gateway.emit('VOICE_STATE_UPDATE', inCall('200'))
    })
    expect(await within(await call()).findByText(/^Звонок · 00:0\d$/)).toBeVisible()
  })

  it('grows to the whole chat and back', async () => {
    const { user } = renderApp(DM_URL, { api: withVoice() })
    await user.click(await screen.findByRole('button', { name: 'Позвонить' }))
    const block = await call()

    await user.click(within(block).getByRole('button', { name: 'Во весь экран' }))
    expect(block).toHaveAttribute('data-full', 'true')
    await user.click(within(block).getByRole('button', { name: 'Свернуть звонок' }))
    expect(block).toHaveAttribute('data-full', 'false')
  })

  it('has one set of controls, in step with the user panel', async () => {
    const { user, voice } = renderApp(DM_URL, { api: withVoice() })
    await user.click(await screen.findByRole('button', { name: 'Позвонить' }))
    const controls = await dock()

    const mic = within(controls).getByRole('button', { name: 'Микрофон' })
    expect(mic).toHaveAttribute('aria-pressed', 'true')
    await user.click(mic)
    expect(voice.room.setMicrophone).toHaveBeenLastCalledWith(false)
    expect(mic).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Включить микрофон' })).toBeVisible()

    await user.click(within(controls).getByRole('button', { name: 'Камера' }))
    expect(voice.room.setCamera).toHaveBeenCalledWith(true)

    await user.click(within(controls).getByRole('button', { name: 'Отключиться' }))
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Управление звонком' })).toBeNull(),
    )
  })
})
