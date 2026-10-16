import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { testUser } from '../../test/fake-api'
import { createFakeShell } from '../../test/fake-shell'
import { renderApp } from '../../test/render-app'

describe('the application settings of the desktop shell', () => {
  it('are not offered in a browser', async () => {
    renderApp('/settings/account', { user: testUser })

    expect(await screen.findByRole('link', { name: 'Моя учётная запись' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Приложение' })).not.toBeInTheDocument()
  })

  it('switch autostart and the tray, and keep a push-to-talk shortcut that can be taken', async () => {
    const shell = createFakeShell({ taken: ['Ctrl+Alt+T'] })
    const { user } = renderApp('/settings/account', { user: testUser, shell: shell.shell })

    await user.click(await screen.findByRole('link', { name: 'Приложение' }))
    expect(await screen.findByRole('heading', { name: 'Приложение' })).toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: 'Запускать вместе с системой' }))
    await waitFor(() => expect(shell.autostart()).toBe(true))
    await user.click(screen.getByRole('switch', { name: 'Сворачивать в трей при закрытии окна' }))
    await waitFor(() => expect(shell.preferences().closeToTray).toBe(false))

    const field = screen.getByLabelText('Сочетание клавиш', { exact: true })
    await user.type(field, 'Ctrl+Alt+T')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText(/не удалось занять/)).toBeInTheDocument()
    expect(shell.preferences().pushToTalk).toBeNull()

    await user.clear(field)
    await user.type(field, 'Ctrl+Shift+V')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Сохранено')).toBeInTheDocument()
    expect(shell.preferences().pushToTalk).toBe('Ctrl+Shift+V')
    // Proved and released: nothing stays bound from the settings page.
    expect(shell.bound()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Сменить сервер' }))
    expect(shell.shell.changeInstance).toHaveBeenCalled()
    expect(screen.getByText('Версия приложения 0.15.0-test')).toBeInTheDocument()
  })
})
