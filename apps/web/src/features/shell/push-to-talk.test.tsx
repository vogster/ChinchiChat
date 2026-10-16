import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { createFakeShell } from '../../test/fake-shell'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const SHORTCUT = 'Ctrl+Shift+V'

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

const joinVoice = async (user: ReturnType<typeof renderApp>['user']) =>
  user.click(await screen.findByRole('button', { name: 'Голосовой канал Общий' }))

describe('push-to-talk in the desktop shell', () => {
  it('holds the microphone closed in voice and opens it while the key is down', async () => {
    const shell = createFakeShell({ preferences: { pushToTalk: SHORTCUT } })
    const { user, voice } = renderApp(GENERAL_URL, { api: withVoice(), shell: shell.shell })

    await joinVoice(user)
    await waitFor(() => expect(shell.bound()).toEqual([SHORTCUT]))
    await waitFor(() => expect(voice.room.setMicrophone).toHaveBeenLastCalledWith(false))

    shell.press(SHORTCUT)
    await waitFor(() => expect(voice.room.setMicrophone).toHaveBeenLastCalledWith(true))
    shell.release(SHORTCUT)
    await waitFor(() => expect(voice.room.setMicrophone).toHaveBeenLastCalledWith(false))

    // Leaving voice gives the shortcut back.
    await user.click(await screen.findByRole('button', { name: 'Отключиться' }))
    await waitFor(() => expect(shell.bound()).toEqual([]))
  })

  it('does nothing without a shortcut, or in a browser', async () => {
    const shell = createFakeShell()
    const { user, voice } = renderApp(GENERAL_URL, { api: withVoice(), shell: shell.shell })

    await joinVoice(user)
    await waitFor(() => expect(voice.room.connect).toHaveBeenCalled())

    expect(shell.bound()).toEqual([])
    expect(voice.room.setMicrophone).not.toHaveBeenCalledWith(false)
  })
})
