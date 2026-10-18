import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const window_ = () => screen.findByRole('dialog', { name: 'Настройки сервера' })

describe('server settings window', () => {
  it('opens over the chat from the server menu, keeping the channel', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, router } = renderApp(GENERAL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Меню сервера Котики' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Настройки сервера' }))

    const settings = await window_()
    expect(within(settings).getByRole('heading', { name: 'Обзор', level: 1 })).toBeVisible()
    expect(router.state.location.pathname).toBe(GENERAL_URL)
    // The chat stays behind the window: same page, same connection.
    expect(
      screen.getByRole('list', { name: 'Сообщения в #общий', hidden: true }),
    ).toBeInTheDocument()

    await user.click(within(settings).getByRole('link', { name: 'Роли' }))
    expect(await within(settings).findByRole('heading', { name: 'Роли', level: 1 })).toBeVisible()

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Настройки сервера' })).toBeNull(),
    )
    expect(router.state.location.pathname).toBe(GENERAL_URL)
  })

  it('opens from old links to the full-page settings', async () => {
    const { router } = renderApp(`/server-settings/${testGuild.id}/roles`, { user: testUser })

    const settings = await window_()
    expect(within(settings).getByRole('heading', { name: 'Роли', level: 1 })).toBeVisible()
    await waitFor(() => expect(router.state.location.pathname).toBe(GENERAL_URL))
  })
})
