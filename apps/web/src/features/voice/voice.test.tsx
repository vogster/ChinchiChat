import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { VoiceState } from '@chinchi/shared'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const VOICE_ID = '505'

const SECOND_VOICE_ID = '599'

/** The test server with one more voice channel. */
const withSecondVoice = () => {
  const voice = testGuild.channels.find((channel) => channel.id === VOICE_ID)
  if (!voice) throw new Error('The test server has no voice channel')
  return {
    ...testGuild,
    channels: [
      ...testGuild.channels,
      { ...voice, id: SECOND_VOICE_ID, name: 'Тихий', position: 1 },
    ],
  }
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
  return api
}

const state = (userId: string, changes: Partial<VoiceState> = {}): VoiceState => ({
  guildId: testGuild.id,
  channelId: VOICE_ID,
  userId,
  selfMute: false,
  selfDeaf: false,
  serverMute: false,
  serverDeaf: false,
  video: false,
  stream: false,
  ...changes,
})

const joinFromSidebar = async (user: ReturnType<typeof renderApp>['user']) =>
  user.click(await screen.findByRole('button', { name: 'Голосовой канал Общий' }))

const panel = () => screen.findByRole('region', { name: 'Голосовое подключение' })

describe('joining voice', () => {
  it('connects from the sidebar and opens the channel', async () => {
    const api = withVoice()
    const { user, voice, router } = renderApp(GENERAL_URL, { api })

    await joinFromSidebar(user)

    expect(api.voice.join).toHaveBeenCalledWith(VOICE_ID, { selfMute: false, selfDeaf: false })
    await waitFor(() =>
      expect(voice.room.connect).toHaveBeenCalledWith('ws://livekit.test', 'voice-token', {
        microphone: true,
        preferences: expect.objectContaining({ noiseSuppression: true }),
      }),
    )
    expect(await panel()).toHaveTextContent('В голосовом')
    expect(await panel()).toHaveTextContent('Общий')
    expect(router.state.location.pathname).toBe(`/channels/${testGuild.id}/${VOICE_ID}`)
  })

  it('explains why it could not connect', async () => {
    const api = withVoice()
    api.voice.join.mockRejectedValueOnce(apiError(403, 'MISSING_PERMISSIONS'))
    const { user } = renderApp(GENERAL_URL, { api })

    await joinFromSidebar(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Недостаточно прав')
  })

  it('still connects, muted, when the microphone is not available', async () => {
    const api = withVoice()
    const { user, voice } = renderApp(GENERAL_URL, { api })
    voice.room.connect.mockResolvedValueOnce({ microphone: false })

    await joinFromSidebar(user)

    expect(await panel()).toHaveTextContent('В голосовом')
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа к микрофону')
    expect(screen.getByRole('button', { name: 'Включить микрофон' })).toBeVisible()
    expect(api.voice.updateState).toHaveBeenCalledWith({ selfMute: true, selfDeaf: false })
  })

  it('never connects a join the user already abandoned', async () => {
    const api = withVoice()
    let answer: (value: { connection: { url: string; token: string } }) => void = () => {}
    api.voice.join.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    const { user, voice } = renderApp(GENERAL_URL, { api })

    await joinFromSidebar(user)
    await user.click(within(await panel()).getByRole('button', { name: 'Отключиться' }))
    answer({ connection: { url: 'ws://livekit.test', token: 'late' } })

    await waitFor(() => expect(api.voice.join).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(voice.room.connect).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Голосовое подключение' })).not.toBeInTheDocument()
  })

  it('keeps showing the microphone off when it fails to come on', async () => {
    const api = withVoice()
    const { user, voice } = renderApp(GENERAL_URL, { api })
    await joinFromSidebar(user)
    await panel()
    await user.click(screen.getByRole('button', { name: 'Выключить микрофон' }))

    voice.room.setMicrophone.mockRejectedValueOnce(new Error('NotAllowedError'))
    await user.click(screen.getByRole('button', { name: 'Включить микрофон' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа к микрофону')
    expect(screen.getByRole('button', { name: 'Включить микрофон' })).toBeVisible()
    expect(api.voice.updateState).toHaveBeenLastCalledWith({ selfMute: true, selfDeaf: false })
  })

  it('is not offered when the instance has no voice', async () => {
    renderApp(GENERAL_URL, { user: testUser })

    await screen.findByRole('link', { name: 'общий' })
    expect(screen.queryByRole('button', { name: 'Голосовой канал Общий' })).not.toBeInTheDocument()
  })

  it('disconnects on request and when the server ends the call', async () => {
    const { user, voice } = renderApp(GENERAL_URL, { api: withVoice() })
    await joinFromSidebar(user)

    await user.click(within(await panel()).getByRole('button', { name: 'Отключиться' }))
    expect(voice.room.disconnect).toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Голосовое подключение' })).not.toBeInTheDocument()

    await joinFromSidebar(user)
    await panel()
    voice.drop()
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Голосовое подключение' }),
      ).not.toBeInTheDocument(),
    )
  })
})

describe('in a voice channel', () => {
  it('lists who is in it, with their mute state and who is speaking', async () => {
    const { user, gateway, voice } = renderApp(GENERAL_URL, { api: withVoice() })
    await joinFromSidebar(user)

    gateway.emit('VOICE_STATE_UPDATE', state('200', { selfMute: true }))
    gateway.emit('VOICE_STATE_UPDATE', state(testUser.id))
    voice.speaking(['200'])

    const members = await screen.findByRole('list', { name: 'В канале Общий' })
    const bob = await within(members).findByRole('listitem', { name: /Боб/ })
    expect(bob).toHaveAccessibleName('Боб (говорит, микрофон выключен)')
    expect(within(members).getByRole('listitem', { name: 'alice' })).toBeVisible()

    gateway.emit('VOICE_STATE_UPDATE', state('200', { channelId: null }))
    await waitFor(() => expect(within(members).queryByText('Боб')).not.toBeInTheDocument())
  })

  it('mutes and deafens, telling the server', async () => {
    const api = withVoice()
    const { user, voice } = renderApp(GENERAL_URL, { api })
    await joinFromSidebar(user)
    await panel()

    await user.click(screen.getByRole('button', { name: 'Выключить микрофон' }))
    expect(voice.room.setMicrophone).toHaveBeenLastCalledWith(false)
    expect(api.voice.updateState).toHaveBeenLastCalledWith({ selfMute: true, selfDeaf: false })

    await user.click(screen.getByRole('button', { name: 'Выключить звук' }))
    expect(voice.room.setDeafened).toHaveBeenLastCalledWith(true)
    expect(api.voice.updateState).toHaveBeenLastCalledWith({ selfMute: true, selfDeaf: true })

    // Unmuting while deafened brings the sound back too.
    await user.click(screen.getByRole('button', { name: 'Включить микрофон' }))
    expect(voice.room.setDeafened).toHaveBeenLastCalledWith(false)
    expect(voice.room.setMicrophone).toHaveBeenLastCalledWith(true)
  })

  it('turns the camera and screen share on and off', async () => {
    const { user, voice } = renderApp(GENERAL_URL, { api: withVoice() })
    await joinFromSidebar(user)
    const controls = await screen.findByRole('region', { name: 'Управление звонком' })
    const camera = await within(controls).findByRole('button', { name: 'Камера' })
    await waitFor(() => expect(camera).toBeEnabled())

    await user.click(camera)
    expect(voice.room.setCamera).toHaveBeenCalledWith(true)
    await waitFor(() => expect(camera).toHaveAttribute('aria-pressed', 'true'))
    await user.click(camera)
    expect(voice.room.setCamera).toHaveBeenLastCalledWith(false)

    await user.click(within(controls).getByRole('button', { name: 'Демонстрация экрана' }))
    expect(voice.room.setScreenShare).toHaveBeenCalledWith(true)
  })

  it('shows the channel page with everyone in it and a way to join', async () => {
    const { user, gateway, api } = renderApp(`/channels/${testGuild.id}/${VOICE_ID}`, {
      api: withVoice(),
    })
    expect(await screen.findByRole('heading', { name: 'Общий', level: 1 })).toBeVisible()
    gateway.emit('VOICE_STATE_UPDATE', state('200', { video: true }))

    const stage = await screen.findByRole('list', { name: 'Участники звонка' })
    expect(await within(stage).findByText('Боб')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Подключиться' }))
    expect(api.voice.join).toHaveBeenCalledWith(VOICE_ID, { selfMute: false, selfDeaf: false })
  })
})

describe('in-voice bar', () => {
  it('turns the camera and screen on from any page, not only the call', async () => {
    const { user, voice, router } = renderApp(GENERAL_URL, { api: withVoice() })
    await joinFromSidebar(user)
    const bar = await panel()
    await router.navigate({ to: GENERAL_URL })

    await user.click(await within(bar).findByRole('button', { name: 'Включить камеру' }))
    expect(voice.room.setCamera).toHaveBeenCalledWith(true)
    await user.click(within(bar).getByRole('button', { name: 'Показать экран' }))
    expect(voice.room.setScreenShare).toHaveBeenCalledWith(true)
  })

  it('marks a member muted by a moderator apart from one who muted themselves', async () => {
    const { user, gateway } = renderApp(GENERAL_URL, { api: withVoice() })
    await screen.findByRole('button', { name: 'Голосовой канал Общий' })
    gateway.emit('VOICE_STATE_UPDATE', state('200', { serverMute: true }))

    await user.click(await screen.findByRole('button', { name: 'Показать участников Общий' }))
    const bob = await screen.findByRole('listitem', { name: /^Боб/ })
    expect(within(bob).getByTitle('микрофон выключен модератором')).toBeInTheDocument()
  })
})

describe('voice moderation', () => {
  it('lets moderators server-mute, deafen and disconnect people', async () => {
    const api = withVoice()
    const { user, gateway } = renderApp(GENERAL_URL, { api })
    await screen.findByRole('button', { name: 'Голосовой канал Общий' })
    gateway.emit('VOICE_STATE_UPDATE', state('200', { serverMute: true }))

    await user.click(await screen.findByRole('button', { name: 'Показать участников Общий' }))
    await user.click(await screen.findByRole('button', { name: 'Действия — Боб' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Включить микрофон на сервере' }))
    expect(api.voice.moderate).toHaveBeenLastCalledWith(testGuild.id, '200', { mute: false })

    await user.click(screen.getByRole('button', { name: 'Действия — Боб' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Выключить звук на сервере' }))
    expect(api.voice.moderate).toHaveBeenLastCalledWith(testGuild.id, '200', { deaf: true })

    await user.click(screen.getByRole('button', { name: 'Действия — Боб' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Отключить от голоса' }))
    expect(api.voice.moderate).toHaveBeenLastCalledWith(testGuild.id, '200', { disconnect: true })
  })

  it('offers nothing to members without those rights', async () => {
    const api = withVoice()
    api.guilds.get.mockResolvedValue({ guild: { ...testGuild, ownerId: '999' } })
    const { gateway } = renderApp(GENERAL_URL, { api })
    await screen.findByRole('button', { name: 'Голосовой канал Общий' })
    gateway.emit('VOICE_STATE_UPDATE', state('200'))

    await screen.findByRole('listitem', { name: 'Боб' })
    expect(screen.queryByRole('button', { name: 'Действия — Боб' })).not.toBeInTheDocument()
  })

  it('moves people to another voice channel', async () => {
    const api = withVoice()
    api.guilds.get.mockResolvedValue({ guild: withSecondVoice() })
    const { user, gateway } = renderApp(GENERAL_URL, { api })
    await screen.findByRole('button', { name: 'Голосовой канал Общий' })
    gateway.emit('VOICE_STATE_UPDATE', state('200'))

    await user.click(await screen.findByRole('button', { name: 'Показать участников Общий' }))
    await user.click(await screen.findByRole('button', { name: 'Действия — Боб' }))
    expect(screen.queryByRole('menuitem', { name: 'Переместить в «Общий»' })).toBeNull()
    await user.click(await screen.findByRole('menuitem', { name: 'Переместить в «Тихий»' }))

    expect(api.voice.move).toHaveBeenCalledWith(testGuild.id, '200', SECOND_VOICE_ID)
  })
})

describe('being moved', () => {
  it('switches to the channel a moderator moved you to', async () => {
    const api = withVoice()
    api.guilds.get.mockResolvedValue({ guild: withSecondVoice() })
    const { user, gateway } = renderApp(GENERAL_URL, { api })
    await joinFromSidebar(user)
    expect(await panel()).toHaveTextContent('В голосовом')

    gateway.emit('VOICE_MOVE', { guildId: testGuild.id, channelId: SECOND_VOICE_ID })

    await waitFor(() =>
      expect(api.voice.join).toHaveBeenLastCalledWith(SECOND_VOICE_ID, {
        selfMute: false,
        selfDeaf: false,
      }),
    )
    await waitFor(async () => expect(await panel()).toHaveTextContent('Тихий'))
  })

  it('does not pull you into voice when you were not in it here', async () => {
    const api = withVoice()
    const { gateway } = renderApp(GENERAL_URL, { api })
    await screen.findByRole('button', { name: 'Голосовой канал Общий' })

    gateway.emit('VOICE_MOVE', { guildId: testGuild.id, channelId: VOICE_ID })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.voice.join).not.toHaveBeenCalled()
  })
})
