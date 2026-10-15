import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const RULES = 'Будьте вежливы.\nБез спама.'
const newcomer = { ...testUser, id: '999', username: 'carol' }
/** Carol joined after the rules were set and has not accepted them. */
const pendingGuild = { ...testGuild, ownerId: '200', rules: RULES, myPending: true }

const withPending = () => {
  const api = createFakeApi({ user: newcomer })
  api.guilds.get.mockResolvedValue({ guild: pendingGuild })
  api.guilds.acceptRules.mockResolvedValue({ guild: { ...pendingGuild, myPending: false } })
  return api
}

describe('server rules', () => {
  it('are written in the server overview', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(`/server-settings/${testGuild.id}`, { api })

    const rules = await screen.findByLabelText('Правила сервера')
    await user.type(rules, 'Будьте вежливы')
    await user.click(screen.getByRole('button', { name: 'Сохранить правила' }))

    await waitFor(() =>
      expect(api.guilds.update).toHaveBeenCalledWith(testGuild.id, { rules: 'Будьте вежливы' }),
    )
  })

  it('greet a newcomer, who may write once they accept them', async () => {
    const api = withPending()
    const { user } = renderApp(GENERAL_URL, { api })

    const welcome = await screen.findByRole('dialog', { name: 'Добро пожаловать на Котики' })
    expect(within(welcome).getByText(/Без спама\./)).toBeVisible()
    await user.click(within(welcome).getByRole('button', { name: 'Принимаю правила' }))

    await waitFor(() => expect(api.guilds.acceptRules).toHaveBeenCalledWith(testGuild.id))
    expect(await screen.findByRole('textbox', { name: 'Сообщение в #общий' })).toBeVisible()
  })

  it('keep the composer closed until then, with a way back to them', async () => {
    const { user } = renderApp(GENERAL_URL, { api: withPending() })

    await user.click(
      within(await screen.findByRole('dialog', { name: 'Добро пожаловать на Котики' })).getByRole(
        'button',
        { name: 'Закрыть' },
      ),
    )

    expect(screen.queryByRole('textbox', { name: 'Сообщение в #общий' })).toBeNull()
    expect(screen.getByText('Примите правила сервера, чтобы писать.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Открыть правила' }))
    expect(await screen.findByRole('dialog', { name: 'Добро пожаловать на Котики' })).toBeVisible()
  })

  it('let go once accepted on another device', async () => {
    const { user, gateway } = renderApp(GENERAL_URL, { api: withPending() })
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Добро пожаловать на Котики' })).getByRole(
        'button',
        { name: 'Закрыть' },
      ),
    )

    act(() =>
      gateway.emit('GUILD_MEMBER_UPDATE', {
        guildId: testGuild.id,
        userId: newcomer.id,
        roleIds: [],
        nickname: null,
        timeoutUntil: null,
        pending: false,
      }),
    )

    expect(await screen.findByRole('textbox', { name: 'Сообщение в #общий' })).toBeVisible()
  })
})
