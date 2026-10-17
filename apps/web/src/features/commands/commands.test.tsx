import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testHistory, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Command } from '@chinchi/shared'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const bot = {
  id: '900',
  username: 'dice_bot',
  displayName: null,
  avatarUrl: null,
  bot: true as const,
}
const roll: Command = {
  id: '77',
  name: 'roll',
  description: 'Бросить кубик',
  options: [{ name: 'sides', description: 'Граней', required: true }],
  bot,
}

const composer = () => screen.findByRole('textbox', { name: 'Сообщение в #общий' })

const setup = () => {
  const api = createFakeApi({ user: testUser })
  api.commands.guild.mockResolvedValue({ commands: [roll] })
  return { ...renderApp(CHANNEL_URL, { api }), api }
}

describe('slash commands', () => {
  it('suggests commands after "/" and runs the picked one', async () => {
    const { api, user } = setup()

    await user.type(await composer(), '/r')
    const option = await screen.findByRole('option', { name: /\/roll/ })
    expect(option).toHaveTextContent('Бросить кубик')
    await user.click(option)
    expect(await composer()).toHaveValue('/roll ')

    await user.type(await composer(), '20{Enter}')
    await waitFor(() =>
      expect(api.interactions.invoke).toHaveBeenCalledWith('503', {
        commandId: '77',
        options: { sides: '20' },
      }),
    )
    expect(api.messages.create).not.toHaveBeenCalled()
    expect(await composer()).toHaveValue('')
  })

  it('passes a picked mention to the command as its token', async () => {
    const { api, user } = setup()

    await user.type(await composer(), '/roll @бо')
    await user.keyboard('{Enter}')
    expect(await composer()).toHaveValue('/roll @Боб ')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(api.interactions.invoke).toHaveBeenCalledWith('503', {
        commandId: '77',
        options: { sides: '<@200>' },
      }),
    )
  })

  it('picks commands from the keyboard', async () => {
    const { user } = setup()

    await user.type(await composer(), '/{ArrowDown}{ArrowUp}{Tab}')
    expect(await composer()).toHaveValue('/roll ')

    await user.clear(await composer())
    await user.type(await composer(), '/ro{Escape}')
    expect(await composer()).toHaveValue('')
  })

  it('holds a command back until its required options are there', async () => {
    const { api, user } = setup()

    await user.type(await composer(), '/roll{Enter}')

    expect(await screen.findByText('Не хватает: sides')).toBeVisible()
    expect(api.interactions.invoke).not.toHaveBeenCalled()
  })

  it('sends unknown commands as ordinary text', async () => {
    const { api, user } = setup()

    await user.type(await composer(), '/shrug ok{Enter}')

    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        '503',
        expect.objectContaining({ content: '/shrug ok' }),
      ),
    )
  })

  it('shows who ran the command a bot answers', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [
        ...testHistory,
        testMessage('1100', {
          author: bot,
          content: 'Выпало 17',
          interaction: { name: 'roll', user: testUser },
        }),
      ],
    })
    renderApp(CHANNEL_URL, { api })

    expect(await screen.findByText('Выпало 17')).toBeVisible()
    expect(screen.getByText(/использует \/roll/)).toBeVisible()
  })
})
