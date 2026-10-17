import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Channel } from '@chinchi/shared'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const MEMES_URL = `/channels/${testGuild.id}/504`

/** The test server with one channel changed, owned by someone else (no bypass). */
const guildWith = (id: string, changes: Partial<Channel>, ownerId = '999') => ({
  guild: {
    ...testGuild,
    ownerId,
    channels: testGuild.channels.map((c) => (c.id === id ? { ...c, ...changes } : c)),
  },
})

afterEach(() => {
  localStorage.clear()
})

describe('channel settings', () => {
  it('turns on slowmode and the NSFW flag for a text channel', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(MEMES_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Настроить канал мемы' }))
    const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    await user.selectOptions(
      within(dialog).getByLabelText('Медленный режим', { exact: true }),
      '30',
    )
    await user.click(within(dialog).getByRole('checkbox', { name: /Канал 18\+/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await waitFor(() =>
      expect(api.channels.update).toHaveBeenCalledWith('504', { rateLimitPerUser: 30, nsfw: true }),
    )
  })

  it('names the slowmode steps with the right plural forms', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(MEMES_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Настроить канал мемы' }))
    const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    const select = within(dialog).getByLabelText('Медленный режим', { exact: true })
    const labels = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent)

    expect(labels).toEqual(expect.arrayContaining(['5 секунд', '1 минута', '2 минуты', '6 часов']))
    expect(labels.join()).not.toContain('{{')
  })
})

describe('slowmode', () => {
  it('makes members wait between messages and says so', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(guildWith('503', { rateLimitPerUser: 30 }))
    const { user } = renderApp(GENERAL_URL, { api })

    expect(await screen.findByText(/Медленный режим: 30 с/)).toBeVisible()
    const composer = await screen.findByRole('textbox', { name: 'Сообщение в #общий' })
    await user.type(composer, 'раз{Enter}')
    await waitFor(() => expect(api.messages.create).toHaveBeenCalledTimes(1))

    await user.type(composer, 'два{Enter}')
    expect(await screen.findByText(/Подождите \d+ с/)).toBeVisible()
    expect(api.messages.create).toHaveBeenCalledTimes(1)
    // What was typed stays for later.
    expect(composer).toHaveValue('два')
  })

  it('does not hold back the owner', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(guildWith('503', { rateLimitPerUser: 30 }, testUser.id))
    const { user } = renderApp(GENERAL_URL, { api })

    const composer = await screen.findByRole('textbox', { name: 'Сообщение в #общий' })
    await user.type(composer, 'раз{Enter}')
    await user.type(composer, 'два{Enter}')

    await waitFor(() => expect(api.messages.create).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/Медленный режим/)).not.toBeInTheDocument()
  })
})

describe('NSFW channels', () => {
  it('asks before showing the channel, once', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue(guildWith('503', { nsfw: true }))
    const { user } = renderApp(GENERAL_URL, { api })

    const gate = await screen.findByRole('region', { name: 'Канал 18+' })
    expect(screen.queryByRole('list', { name: 'Сообщения в #общий' })).not.toBeInTheDocument()
    await user.click(within(gate).getByRole('button', { name: 'Продолжить' }))

    expect(await screen.findByRole('list', { name: 'Сообщения в #общий' })).toBeVisible()
    expect(localStorage.getItem('chinchi:nsfw-ok')).toBe('1')
  })
})
