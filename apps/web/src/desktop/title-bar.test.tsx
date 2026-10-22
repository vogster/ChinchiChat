import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { initI18n } from '../lib/i18n'
import { createFakeShell } from '../test/fake-shell'
import { TitleBar } from './title-bar'

initI18n('ru')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TitleBar', () => {
  it('drives the window with its own buttons on Windows', async () => {
    const fake = createFakeShell()
    const user = userEvent.setup()
    render(<TitleBar shell={fake.shell} />)

    await user.click(screen.getByRole('button', { name: 'Свернуть' }))
    expect(fake.shell.window.minimize).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Развернуть' }))
    expect(fake.maximized()).toBe(true)
    // The button now offers to restore the window.
    expect(await screen.findByRole('button', { name: 'Восстановить' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Закрыть окно' }))
    expect(fake.shell.window.close).toHaveBeenCalledOnce()
  })

  it('follows the OS when the window is maximized from outside', async () => {
    const fake = createFakeShell()
    render(<TitleBar shell={fake.shell} />)
    expect(await screen.findByRole('button', { name: 'Развернуть' })).toBeInTheDocument()

    act(() => fake.setMaximized(true))
    expect(await screen.findByRole('button', { name: 'Восстановить' })).toBeInTheDocument()
  })

  it('shows the window title and keeps up with it', async () => {
    const fake = createFakeShell()
    document.title = 'Chinchi'
    render(<TitleBar shell={fake.shell} />)
    expect(screen.getByText('Chinchi')).toBeInTheDocument()

    document.title = '(2) Chinchi — Клуб'
    await waitFor(() => expect(screen.getByText('(2) Chinchi — Клуб')).toBeInTheDocument())
  })

  it('goes back and forward through the history', async () => {
    const fake = createFakeShell()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined)
    const user = userEvent.setup()
    render(<TitleBar shell={fake.shell} />)

    await user.click(screen.getByRole('button', { name: 'Назад' }))
    await user.click(screen.getByRole('button', { name: 'Вперёд' }))
    expect(back).toHaveBeenCalledOnce()
    expect(forward).toHaveBeenCalledOnce()
  })

  it('leaves the window buttons to macOS', () => {
    const fake = createFakeShell({ platform: 'macos' })
    render(<TitleBar shell={fake.shell} />)
    expect(screen.queryByRole('button', { name: 'Закрыть окно' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
  })
})
