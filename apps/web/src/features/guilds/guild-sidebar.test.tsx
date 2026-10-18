import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testThread, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { VoiceState } from '@chinchi/shared'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const VOICE_ID = '505'

const withThread = () => {
  const api = createFakeApi({ user: testUser })
  api.guilds.get.mockResolvedValue({
    guild: { ...testGuild, channels: [...testGuild.channels, testThread] },
  })
  return api
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

const sidebar = () => screen.findByRole('complementary', { name: 'Котики' })

describe('server sidebar', () => {
  it('says how many members are online', async () => {
    const { gateway } = renderApp(GENERAL_URL, { user: testUser })
    const aside = await sidebar()
    expect(await within(aside).findByText('0 в сети · 2 участника')).toBeVisible()

    act(() => gateway.emit('PRESENCE_UPDATE', { userId: '200', status: 'online' }))
    expect(await within(aside).findByText('1 в сети · 2 участника')).toBeVisible()
  })

  it('folds the threads of a channel, keeping their count in view', async () => {
    const { user } = renderApp(GENERAL_URL, { api: withThread() })
    const channels = await screen.findByRole('navigation', { name: 'Каналы' })
    expect(await within(channels).findByRole('link', { name: 'Релиз' })).toBeVisible()

    await user.click(within(channels).getByRole('button', { name: 'Свернуть треды #общий' }))
    expect(within(channels).queryByRole('link', { name: 'Релиз' })).not.toBeInTheDocument()

    const unfold = within(channels).getByRole('button', { name: 'Показать треды #общий (1)' })
    expect(unfold).toHaveAttribute('aria-expanded', 'false')
    await user.click(unfold)
    expect(within(channels).getByRole('link', { name: 'Релиз' })).toBeVisible()
  })
})

describe('voice channel card', () => {
  it('is empty until someone joins, then stacks their avatars', async () => {
    const { gateway } = renderApp(GENERAL_URL, { api: withVoice() })
    const channels = await screen.findByRole('navigation', { name: 'Каналы' })
    expect(await within(channels).findByText('пусто')).toBeVisible()

    act(() => gateway.emit('VOICE_STATE_UPDATE', state('200', { selfMute: true })))

    expect(await within(channels).findByText('1 в канале')).toBeVisible()
    const members = within(channels).getByRole('list', { name: 'В канале Общий' })
    expect(within(members).getByRole('listitem', { name: 'Боб (микрофон выключен)' })).toBeVisible()
    // Folded, the card shows faces only: actions live in the unfolded list.
    expect(within(channels).queryByRole('button', { name: 'Действия — Боб' })).toBeNull()
  })

  it('unfolds into a list of who is in it', async () => {
    const { user, gateway } = renderApp(GENERAL_URL, { api: withVoice() })
    const channels = await screen.findByRole('navigation', { name: 'Каналы' })
    act(() => gateway.emit('VOICE_STATE_UPDATE', state('200', { selfMute: true })))

    const unfold = await within(channels).findByRole('button', {
      name: 'Показать участников Общий',
    })
    expect(unfold).toHaveAttribute('aria-expanded', 'false')
    await user.click(unfold)

    const members = within(channels).getByRole('list', { name: 'В канале Общий' })
    expect(within(members).getByText('без звука')).toBeVisible()
    await user.click(within(channels).getByRole('button', { name: 'Свернуть участников Общий' }))
    expect(within(members).queryByText('без звука')).not.toBeInTheDocument()
  })

  it('shows where you are connected, with a button to hang up', async () => {
    const { user } = renderApp(GENERAL_URL, { api: withVoice() })
    await user.click(await screen.findByRole('button', { name: 'Голосовой канал Общий' }))

    const bar = await screen.findByRole('region', { name: 'Голосовое подключение' })
    expect(await within(bar).findByText('В голосовом')).toBeVisible()
    expect(within(bar).getByText('Общий · Котики')).toBeVisible()
    await user.click(within(bar).getByRole('button', { name: 'Отключиться' }))
    expect(screen.queryByRole('region', { name: 'Голосовое подключение' })).not.toBeInTheDocument()
  })
})
